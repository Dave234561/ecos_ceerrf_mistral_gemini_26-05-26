import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PATIENT_DIALOGUE_BRANCH, usesPatientDialoguePreview, buildPatientDialogueMessages, selectPatientScenario, checkPatientDialogueOutput, PatientDialogueOutputRejected } from './patient-dialogue-preview.ts';

test('B is isolated from other previews, production and local processes', () => {
  for (const env of ['production', 'development', undefined]) assert.equal(usesPatientDialoguePreview({ VERCEL_ENV: env, VERCEL_GIT_COMMIT_REF: PATIENT_DIALOGUE_BRANCH }), false);
  assert.equal(usesPatientDialoguePreview({ VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'preview/unrelated' }), false);
  assert.equal(usesPatientDialoguePreview({ VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: PATIENT_DIALOGUE_BRANCH }), true);
  assert.equal(usesPatientDialoguePreview({ VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'feature/lti' }), true);
  assert.equal(usesPatientDialoguePreview({ VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'feature/lti' }), false);
});

test('use only the signed-in learner’s saved session and scenario', () => {
  const session = { student_email: 'abc@example.test', scenario_id: 4 };
  assert.deepEqual(selectPatientScenario(session, 'ABC@example.test', '4'), { id: 4 });
  assert.deepEqual(selectPatientScenario(session, 'abc@example.test', undefined), { id: 4 });
  assert.deepEqual(selectPatientScenario(null, 'abc@example.test', '4'), { error: 'PATIENT_SESSION_NOT_FOUND' });
  assert.deepEqual(selectPatientScenario(session, 'xyz@example.test', 4), { error: 'PATIENT_SESSION_NOT_FOUND' });
  assert.deepEqual(selectPatientScenario(session, 'abc@example.test', '5'), { error: 'PATIENT_SCENARIO_MISMATCH' });
});

test('send the scenario as system and chronological recent dialogue as separate turns', () => {
  const facts = 'Hospitalisé vers la fin de la première semaine. N’a pas dormi depuis trois jours.';
  const msgs = buildPatientDialogueMessages(facts, [
    { role: 'assistant', response: 'Je suis venu volontairement.' },
    { role: 'user', question: 'Vous avez décidé de venir ?' },
    { role: 'system', response: 'Not a patient message' },
  ], 'Et depuis quand êtes-vous là ?');
  assert.ok(msgs[0].content.endsWith(facts));
  assert.deepEqual(msgs.slice(1), [
    { role: 'user', content: 'Vous avez décidé de venir ?' },
    { role: 'assistant', content: 'Je suis venu volontairement.' },
    { role: 'user', content: 'Et depuis quand êtes-vous là ?' },
  ]);
  assert.deepEqual(buildPatientDialogueMessages('Fiche', [], 'Salut').map(m => m.role), ['system', 'user']);
  const rows = Array.from({ length: 20 }, (_, i) => i % 2 === 0
    ? { role: 'assistant', response: 'Réponse ' + i }
    : { role: 'user', question: 'Question ' + i });
  assert.equal(buildPatientDialogueMessages('Fiche', rows, 'Encore ?').length, 10);
});

test('targeted output checks reject obvious tutor leakage but allow natural refusal and unknowns', () => {
  for (const text of ['', 'Barème : 2 points', 'Examinateur : voici le corrigé', 'https://example.test/cours', 'Le barème prévoit de poser deux questions.']) {
    assert.throws(() => checkPatientDialogueOutput(text), PatientDialogueOutputRejected);
  }
  assert.equal(checkPatientDialogueOutput('Patient : Je ne sais pas combien de nuits exactement.'), 'Je ne sais pas combien de nuits exactement.');
  assert.equal(checkPatientDialogueOutput('Je ne sais pas de quel barème vous parlez.'), 'Je ne sais pas de quel barème vous parlez.');
});

test('real Mistral adapter serializes the three cases with structured roles and no generic tutor', async t => {
  const { MistralService } = await import('./mistral.service.js');
  const requests: any[] = [];
  t.mock.method(globalThis, 'fetch', async (req: Request) => {
    requests.push(await req.json());
    return Response.json({
      id: 'fake', object: 'chat.completion', created: 1, model: 'mistral-small-2603',
      usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
      choices: [{ index: 0, message: { role: 'assistant', content: 'Réponse fictive autorisée.' }, finish_reason: 'stop' }],
    });
  });
  const model = new MistralService('fake-api-key');
  const cases = [
    ['Mère d’un enfant fébrile depuis trois jours.', 'Il boit comme avant ?'],
    ['Patient venu volontairement en fin de première semaine.', 'Combien de nuits à l’hôpital ?'],
    ['Personne de 79 ans, malade depuis hier.', 'Vous habitez ici depuis quand ?'],
  ];
  for (const [facts, question] of cases) {
    const messages = buildPatientDialogueMessages(facts, [
      { role: 'assistant', response: 'Ça ne va pas.' },
      { role: 'user', question: 'Comment allez-vous ?' },
    ], question);
    assert.equal(await model.generateResponse(messages, { simulatedPatient: true, max_tokens: 360, temperature: 0.2 }), 'Réponse fictive autorisée.');
    const wire = requests.at(-1)!;
    assert.equal(wire.model, 'mistral-small-2603');
    assert.equal(wire.reasoning_effort, 'none');
    assert.equal(wire.max_tokens, 360);
    assert.deepEqual(wire.messages.map(({ role, content }: { role: string; content: string }) => ({ role, content })), messages);
    assert.equal(wire.messages.find((message: { role: string }) => message.role === 'assistant')?.prefix, false);
    assert.equal(wire.messages[0].role, 'system');
    assert.ok(wire.messages[0].content.endsWith(facts));
    assert.deepEqual(wire.messages.at(-1), { role: 'user', content: question });
    assert.ok(!JSON.stringify(wire).includes('LearnWorlds'));
  }
});

test('opt-in Small 4 high uses a separate transport and does not expose internal or truncated text', async t => {
  const { MistralService, EmptyPatientResponseError } = await import('./mistral.service.js');
  const wire: any[] = [];
  t.mock.method(globalThis, 'fetch', async (req: Request) => {
    wire.push(await req.json());
    return Response.json({
      id: 'fictional', object: 'chat.completion', created: 1, model: 'mistral-small-2603',
      usage: { prompt_tokens: 20, completion_tokens: 12, total_tokens: 32 },
      choices: [{ index: 0, message: { role: 'assistant', content: [
        { type: 'thinking', thinking: [{ type: 'text', text: 'INTERNAL_ONLY' }] },
        { type: 'text', text: 'Réponse visible.' },
      ] }, finish_reason: wire.length === 3 ? 'length' : 'stop' }],
    });
  });
  const service = new MistralService('fake-api-key');
  const messages = buildPatientDialogueMessages('Cas fictif', [], 'Depuis quand ?');
  const high = { simulatedPatient: true, patientReasoning: 'high' as const, max_tokens: 1100 };
  assert.equal(await service.generateResponse(messages, high), 'Réponse visible.');
  assert.equal(await service.generateResponse(messages, { simulatedPatient: true, max_tokens: 360 }), 'Réponse visible.');
  await assert.rejects(service.generateResponse(messages, high), EmptyPatientResponseError);
  assert.deepEqual(wire.map(x => [x.model, x.reasoning_effort, x.max_tokens]), [
    ['mistral-small-2603', 'high', 1100], ['mistral-small-2603', 'none', 360], ['mistral-small-2603', 'high', 1100],
  ]);
});
