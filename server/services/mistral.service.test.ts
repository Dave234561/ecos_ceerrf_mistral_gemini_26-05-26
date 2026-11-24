import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MistralService } from './mistral.service.js';

test('Mistral SDK serializes the configured token cap and omits it when unset', async (t) => {
  const bodies: Record<string, unknown>[] = [];
  t.mock.method(globalThis, 'fetch', async (input: Request) => {
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
