import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import type { Request, Response as ExpressResponse } from 'express';
import { patientTiming } from './patient-timing.js';
import { EmptyPatientResponseError, MistralService } from './mistral.service.js';

test('Mistral SDK serializes the configured token cap and omits it when unset', async (t) => {
  const bodies: Record<string, unknown>[] = [];
  t.mock.method(globalThis, 'fetch', async (input: globalThis.Request) => {
    assert.equal(input.method, 'POST');
    assert.equal(new URL(input.url).pathname, '/v1/chat/completions');
    bodies.push(await input.json());
    return Response.json({
      id: 'fake-completion',
      object: 'chat.completion',
      created: 1,
      usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 },
      model: 'mistral-large-latest',
      choices: [{ index: 0, message: { role: 'assistant', content: 'Réponse fictive' }, finish_reason: 'stop' }],
    });
  });
  const service = new MistralService('fake-api-key');
  const messages = [{ role: 'user', content: 'Question fictive' }];
  for (const max_tokens of [1000, 1500, undefined]) {
    assert.equal(await service.generateResponse(messages, { max_tokens, temperature: 0.5 }), 'Réponse fictive');
  }
  assert.equal(bodies.length, 3);
  for (const [index, body] of bodies.entries()) {
    assert.equal(body.model, 'mistral-large-latest');
    assert.deepEqual(body.messages, messages);
    assert.equal(body.temperature, 0.5);
    assert.equal(Object.hasOwn(body, 'maxTokens'), false);
    if (index < 2) assert.equal(body.max_tokens, [1000, 1500][index]);
    else assert.equal(Object.hasOwn(body, 'max_tokens'), false);
  }
});

test('completion telemetry exposes only allowlisted metadata before normalization', async (t) => {
  const logs: string[] = [];
  t.mock.method(console, 'info', (line: string) => logs.push(line));
  const cases = [
    { reason: 'length', chunks: [{ type: 'thinking', thinking: [{ type: 'text', text: 'PRIVATE_REASONING' }] }] },
    { reason: 'PRIVATE_UNKNOWN_REASON', chunks: [{ type: 'text', text: 'PRIVATE_VISIBLE_TEXT' }] },
  ];
  t.mock.method(globalThis, 'fetch', async () => {
    const { reason, chunks } = cases.shift()!;
    return Response.json({
      id: 'PRIVATE_PROVIDER_ID',
      object: 'chat.completion',
      created: 1,
      model: 'mistral-large-latest',
      usage: { prompt_tokens: 4, completion_tokens: 1000, total_tokens: 1004, unexpected: 'PRIVATE_USAGE_EXTRA' },
      choices: [{ index: 0, message: { role: 'assistant', content: chunks }, finish_reason: reason }],
    });
  });
  const service = new MistralService('PRIVATE_KEY');
  const ask = () => new Promise<string>((resolve, reject) => {
    const res = new EventEmitter() as ExpressResponse;
    patientTiming({} as Request, res, () => {
      service.generateResponse([{ role: 'user', content: 'PRIVATE_PROMPT' }], { max_tokens: 1000 })
        .then(resolve, reject);
    });
  });
  await assert.rejects(ask(), EmptyPatientResponseError);
  assert.equal(await ask(), 'PRIVATE_VISIBLE_TEXT');
  assert.equal(logs.some(line => line.includes('PRIVATE_')), false);

  const events = logs.map(line => JSON.parse(line));
  const completions = events.filter(e => e.event === 'ecos.patient.mistral_completion');
  assert.equal(completions.length, 2);
  const traces = events.filter(e => e.phase === 'route').map(e => e.trace_id);
  assert.deepEqual(completions, ['length', 'other'].map((finish_reason, index) => ({
    event: 'ecos.patient.mistral_completion',
    trace_id: traces[index],
    finish_reason,
    prompt_tokens: 4,
    completion_tokens: 1000,
    total_tokens: 1004,
    content_shape: 'chunks',
    chunk_count: 1,
    text_chunk_count: index,
    thinking_chunk_count: 1 - index,
  })));
  for (const completion of completions) {
    const normalizationIndex = events.findIndex(e => e.trace_id === completion.trace_id && e.phase === 'provider_normalization');
    assert.ok(normalizationIndex > events.indexOf(completion));
  }
});

test('only the Preview simulated patient sends Small 4 with high reasoning over the SDK transport', async (t) => {
  const settings = { LLM_PROVIDER: 'mistral', MISTRAL_API_KEY: 'fake-mistral-key', OPENAI_API_KEY: 'fake-openai-key', REALTIME_PROVIDER: 'openai', VERCEL_ENV: 'preview' };
  for (const [key, value] of Object.entries(settings)) {
    const previous = process.env[key];
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
    process.env[key] = value;
  }
  const requests: Record<string, unknown>[] = [];
  t.mock.method(globalThis, 'fetch', async (request: globalThis.Request) => {
    assert.equal(new URL(request.url).pathname, '/v1/chat/completions');
    assert.equal(request.headers.get('authorization'), 'Bearer fake-mistral-key');
    const body = await request.json();
    requests.push(body);
    const high = body.reasoning_effort === 'high';
    const thinking = { type: 'thinking', thinking: [{ type: 'text', text: 'PRIVATE_REASONING' }] };
    const content = !high ? 'Réponse fictive' : requests.filter(r => r.reasoning_effort === 'high').length === 1
      ? [thinking, { type: 'text', text: 'Réponse fictive' }] : [thinking];
    return Response.json({
      id: 'fake-completion', object: 'chat.completion', created: 1, model: 'mistral-large-latest',
      usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 },
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: Array.isArray(content) && content.length === 1 ? 'length' : 'stop' }],
    });
  });
  const { llmService } = await import('./llm.service.js');
  const context = [{ role: 'system', content: 'Scénario fictif' }, { role: 'user', content: 'Question fictive' }];
  const options = { simulatedPatient: true };
  const answers = await Promise.all([
    llmService.generateResponse('', context, options),
    llmService.generateResponse('', context),
    llmService.createCompletion({ messages: context, max_tokens: 1500, temperature: 0.5 }),
  ]);
  assert.deepEqual(answers, ['Réponse fictive', 'Réponse fictive', 'Réponse fictive']);
  assert.equal(requests.length, 3);
  const withEffort = requests.filter(body => Object.hasOwn(body, 'reasoning_effort'));
  assert.equal(withEffort.length, 1);
  const regular = requests.find(body => body.max_tokens === 1000 && !Object.hasOwn(body, 'reasoning_effort'));
  assert.ok(regular);
  assert.deepEqual(withEffort[0], { ...regular, model: 'mistral-small-2603', reasoning_effort: 'high' });
  assert.equal(regular.model, 'mistral-large-latest');
  assert.equal(regular.temperature, 0.5);
  assert.equal(requests.find(body => body.max_tokens === 1500)?.reasoning_effort, undefined);
  await assert.rejects(llmService.generateResponse('', context, options), EmptyPatientResponseError);
  process.env.VERCEL_ENV = 'production';
  assert.equal(await llmService.generateResponse('', context, options), 'Réponse fictive');
  assert.deepEqual(requests.at(-1), { ...withEffort[0], reasoning_effort: 'none' });
});
