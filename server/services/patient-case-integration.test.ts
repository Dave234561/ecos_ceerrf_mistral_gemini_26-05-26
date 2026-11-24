import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VerifiedPatientScenarioUnavailableError } from './patient-case-guard.js';

test('pilot fails closed on an unknown DB revision; non-pilots and production retain the existing provider', async (t) => {
  t.mock.method(console, 'log', () => {});
  const oldEnv = process.env.VERCEL_ENV;
  const oldKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'fake-key';
  t.after(() => {
    if (oldEnv === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = oldEnv;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey;
  });
  const { unifiedDb } = await import('./unified-database.service.js');
  const { conversationMemoryService } = await import('./conversation-memory.service.js');
  t.after(() => conversationMemoryService.destroy());
  const { llmService } = await import('./llm.service.js');
  const { virtualPatientService } = await import('./virtual-patient.service.js');
  t.mock.method(unifiedDb, 'getScenarios', async () => [
    { id: 1, patient_prompt: 'synthetic unverified revision' },
    { id: 4, patient_prompt: 'synthetic unverified adult 4 revision' },
    { id: 5, patient_prompt: 'synthetic unverified adult 5 revision' },
    { id: 6, patient_prompt: 'synthetic alternate case' },
  ]);
  const provider = t.mock.method(llmService, 'generateResponse', async () => 'Réponse simulée sans réseau.');
  process.env.VERCEL_ENV = 'preview';
  await assert.rejects(virtualPatientService.generatePatientResponse('preview-pilot', 'fake@example.test', 'Bonjour !', 1),
    VerifiedPatientScenarioUnavailableError);
  for (const id of [4, 5]) await assert.rejects(virtualPatientService.generatePatientResponse('unverified-adult', 'fake@example.test', 'Bonjour !', id),
    VerifiedPatientScenarioUnavailableError);
  assert.equal(provider.mock.callCount(), 0);
  const otherCase = await virtualPatientService.generatePatientResponse('preview-other', 'fake@example.test', 'Bonjour !', 6);
  assert.equal(otherCase.response, 'Réponse simulée sans réseau.');
  assert.deepEqual(provider.mock.calls[0].arguments[2], { simulatedPatient: true });
  process.env.VERCEL_ENV = 'production';
  const production = await virtualPatientService.generatePatientResponse('production-control', 'fake@example.test', 'Bonjour !', 1);
  assert.equal(production.response, 'Réponse simulée sans réseau.');
  assert.equal(provider.mock.callCount(), 2);
});
