import { projectPatientPilot } from './patient-case-guard.js';
import { PatientDialogueOutputRejected, selectPatientScenario } from './patient-dialogue-preview.js';
import { buildPatientSheetTurn } from './patient-dialogue-sheet.js';
import { timedPatientPhase } from './patient-timing.js';
import { EmptyPatientResponseError, VerifiedPatientMistral } from './verified-patient-mistral.js';

export const VERIFIED_PATIENT_RELEASE_BRANCH = 'release/ecos-verified-patient-20261126';
const caseIds = new Set([1, 4, 5]);

export function usesVerifiedPatientRelease(env: Record<string, string | undefined>) {
  return env.VERCEL_ENV === 'production' ||
    (env.VERCEL_ENV === 'preview' && env.VERCEL_GIT_COMMIT_REF === VERIFIED_PATIENT_RELEASE_BRANCH);
}

type Query = { sessionId: unknown; query: unknown; email: string; suppliedScenario: unknown };
type Result = { status: number; code: string } | { status: 200; response: string };
type Dependencies = {
  loadClient: () => Promise<any>;
  resolveSheet?: typeof projectPatientPilot;
  generate: (turn: ReturnType<typeof buildPatientSheetTurn>) => Promise<string>;
};

export async function handleVerifiedPatientRelease(input: Query, deps: Dependencies): Promise<Result | undefined> {
  // Only the three known student session shapes enter the new route. The path
  // label is a hint, never authorization; the verified row decides ownership
  // and case identity. All other scenarios retain the existing behavior.
  const hint = typeof input.sessionId === 'string' ? /^session_(1|4|5)_/.exec(input.sessionId)?.[1] : undefined;
  const supplied = typeof input.suppliedScenario === 'string' || typeof input.suppliedScenario === 'number'
    ? Number(input.suppliedScenario) : undefined;
  if (!hint && (supplied == null || !caseIds.has(supplied))) return undefined;
  if (typeof input.sessionId !== 'string' || typeof input.query !== 'string' ||
      !input.query.trim() || input.query.length > 500) return { status: 400, code: 'INVALID_INPUT' };
  const query = input.query.trim();
  const client = await deps.loadClient();
  const session = await timedPatientPhase('scenario_validation', async () => {
    const { data, error } = await client.from('sessions').select('id, student_email, scenario_id')
      .eq('session_id', input.sessionId).maybeSingle();
    if (error) throw error;
    return data;
  });
  const selected = selectPatientScenario(session, input.email, input.suppliedScenario);
  if ('error' in selected) return { status: selected.error === 'PATIENT_SESSION_NOT_FOUND' ? 404 : 409, code: selected.error };
  if (!caseIds.has(selected.id)) return undefined;
  const id = Number(session.id);
  if (!Number.isSafeInteger(id) || id < 1) return { status: 503, code: 'PATIENT_HISTORY_UNAVAILABLE' };
  const [source, history] = await Promise.all([
    timedPatientPhase('scenario_prompt_fetch', async () => {
      const { data, error } = await client.from('scenarios').select('patient_prompt').eq('id', selected.id).maybeSingle();
      if (error) throw error;
      return typeof data?.patient_prompt === 'string' ? data.patient_prompt : '';
    }),
    timedPatientPhase('conversation_memory', async () => {
      const { data, error } = await client.from('exchanges').select('role, question, response').eq('session_id', id)
        .in('role', ['user', 'assistant']).order('timestamp', { ascending: false }).order('id', { ascending: false }).limit(8);
      if (error) throw error;
      return data ?? [];
    }),
  ]);
  const sheet = (deps.resolveSheet ?? projectPatientPilot)(selected.id, source);
  if (!sheet) return { status: 503, code: 'PATIENT_SCENARIO_UNAVAILABLE' };
  const turn = buildPatientSheetTurn(sheet, source, history, query);
  let response: string;
  try {
    const raw = await timedPatientPhase('generation', () => deps.generate(turn));
    response = await timedPatientPhase('scenario_fact_validation', () => turn.render(raw));
  } catch (error) {
    if (error instanceof ProviderUnavailable) return { status: 503, code: 'PATIENT_PROVIDER_UNAVAILABLE' };
    if (error instanceof EmptyPatientResponseError || error instanceof PatientDialogueOutputRejected) {
      return { status: 422, code: 'PATIENT_RESPONSE_REJECTED' };
    }
    throw error;
  }
  await timedPatientPhase('persistence', async () => {
    const stamp = new Date().toISOString();
    const { error } = await client.from('exchanges').insert([
      { session_id: id, role: 'user', question: query, response: '', timestamp: stamp },
      { session_id: id, role: 'assistant', question: response, response, timestamp: stamp },
    ]);
    if (error) throw error;
  });
  return { status: 200, response };
}
class ProviderUnavailable extends Error {}
let patientModel: VerifiedPatientMistral | undefined;
export function generateVerifiedPatientTurn(turn: ReturnType<typeof buildPatientSheetTurn>) {
  const key = process.env.MISTRAL_API_KEY?.trim();
  if (!key) throw new ProviderUnavailable();
  patientModel ??= new VerifiedPatientMistral(key);
  return patientModel.generateResponse(turn.messages, {
    simulatedPatient: true, patientReasoning: 'high', patientSheetSchema: turn.schema, max_tokens: 1100, temperature: 0,
  });
}
