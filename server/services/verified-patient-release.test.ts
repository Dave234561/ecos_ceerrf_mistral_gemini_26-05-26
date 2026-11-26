import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adultCases } from './patient-case-adult.js';
import { handleVerifiedPatientRelease, usesVerifiedPatientRelease, VERIFIED_PATIENT_RELEASE_BRANCH } from './verified-patient-release.js';

const input = { sessionId: 'session_4_123_abc', query: 'Êtes-vous venu de votre plein gré ?', email: 'learner@example.test', suppliedScenario: 4 };
function fixture(overrides: { owner?: string; scenario?: number; sheet?: boolean; raw?: string } = {}) {
  const saved: any[] = [];
  const calls: string[] = [];
  const selection: string[] = [];
  const deps = {
    loadClient: async () => ({
      from(table: string) {
        calls.push(table);
        const q = {
          select(s: string) { selection.push(s); return q; }, eq: () => q, in: () => q, order: () => q,
          insert(rows: any[]) { saved.push(...rows); return { error: null }; },
          limit: () => ({ data: [{ role: 'assistant', response: 'Bonjour.' }, { role: 'user', question: 'Bonjour ?' }], error: null }),
          maybeSingle: () => ({ data: table === 'sessions' ? {
            id: 28, student_email: overrides.owner ?? input.email, scenario_id: overrides.scenario ?? 4,
          } : { patient_prompt: 'Fiche synthétique' }, error: null }),
        };
        return q;
      },
    }),
    resolveSheet: overrides.sheet === false ? undefined : () => adultCases[4],
    generate: async (turn: any) => {
      calls.push('provider');
      assert.deepEqual(turn.messages.map((x: any) => x.role), ['system', 'user', 'assistant', 'user']);
      return overrides.raw ?? '{"answers":["voluntary"]}';
    },
  };
  return { saved, calls, selection, deps };
}

test('activates only in production and the dedicated release preview', () => {
  assert.equal(usesVerifiedPatientRelease({ VERCEL_ENV: 'production' }), true);
  assert.equal(usesVerifiedPatientRelease({ VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: VERIFIED_PATIENT_RELEASE_BRANCH }), true);
  assert.equal(usesVerifiedPatientRelease({ VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'feature/lti' }), false);
  assert.equal(usesVerifiedPatientRelease({ VERCEL_ENV: 'development' }), false);
});

test('reads the signed-in session and patient-only prompt, calls the model once and saves only approved text', async () => {
  const s = fixture();
  const result = await handleVerifiedPatientRelease(input, s.deps);
  assert.deepEqual(result, { status: 200, response: 'Je suis venu de mon plein gré.' });
  assert.deepEqual(s.calls, ['sessions', 'scenarios', 'exchanges', 'provider', 'exchanges']);
  assert.deepEqual(s.selection, ['id, student_email, scenario_id', 'patient_prompt', 'role, question, response']);
  assert.deepEqual(s.saved.map(x => [x.session_id, x.role, x.response]), [[28, 'user', ''], [28, 'assistant', 'Je suis venu de mon plein gré.']]);
});

test('leaves other cases untouched; fails closed for another owner, a mismatch, a stale sheet or bad output', async () => {
  for (const [override, status, code] of [
    [{ owner: 'someone@example.test' }, 404, 'PATIENT_SESSION_NOT_FOUND'],
    [{ scenario: 5 }, 409, 'PATIENT_SCENARIO_MISMATCH'],
    [{ sheet: false }, 503, 'PATIENT_SCENARIO_UNAVAILABLE'],
    [{ raw: '{"answers":["unknown_id"]}' }, 422, 'PATIENT_RESPONSE_REJECTED'],
  ] as const) {
    const s = fixture(override);
    assert.deepEqual(await handleVerifiedPatientRelease(input, s.deps), { status, code });
    assert.equal(s.saved.length, 0);
    if (status !== 422) assert.ok(!s.calls.includes('provider'));
  }
  const other = fixture();
  assert.equal(await handleVerifiedPatientRelease({ ...input, sessionId: 'session_2_123_abc', suppliedScenario: 2 }, other.deps), undefined);
  assert.deepEqual(other.calls, []);
});
