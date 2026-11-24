import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { RequestHandler } from 'express';

type Phase =
  | 'route'
  | 'response'
  | 'scenario_validation'
  | 'conversation_memory'
  | 'scenario_prompt_fetch'
  | 'generation'
  | 'provider'
  | 'provider_normalization'
  | 'patient_normalization'
  | 'persistence'
  | 'analysis_dispatch'
  | 'patient_fallback';
type Trace = { id: string; start: number };
type Outcome = 'start' | 'ok' | 'error' | 'closed';
const context = new AsyncLocalStorage<Trace>();

function safeLabel(value: string | undefined): string | undefined {
  return value && /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(value) ? value : undefined;
}

function log(trace: Trace, phase: Phase, outcome: Outcome, start: number, model?: string, error?: unknown, status?: number) {
  const now = performance.now();
  console.info(JSON.stringify({
    event: 'ecos.patient.timing',
    trace_id: trace.id,
    phase,
    outcome,
    elapsed_ms: Math.round((now - trace.start) * 10) / 10,
    duration_ms: Math.round((now - start) * 10) / 10,
    model: safeLabel(model),
    error_class: outcome === 'error' ? (error instanceof Error ? safeLabel(error.constructor.name) || 'Error' : 'NonError') : undefined,
    status,
  }));
}

export const patientTiming: RequestHandler = (_req, res, next) => {
  const trace = { id: randomUUID(), start: performance.now() };
  const finish = () => {
    res.off('close', close);
    log(trace, 'response', 'ok', trace.start, undefined, undefined, res.statusCode);
  };
  const close = () => {
    res.off('finish', finish);
    log(trace, 'response', 'closed', trace.start, undefined, undefined, res.headersSent ? res.statusCode : undefined);
  };
  res.once('finish', finish);
  res.once('close', close);
  context.run(trace, () => {
    log(trace, 'route', 'start', trace.start);
    next();
  });
};

export async function timedPatientPhase<T>(phase: Phase, run: () => T | Promise<T>, model?: string): Promise<T> {
  const trace = context.getStore();
  if (!trace) return run();
  const start = performance.now();
  log(trace, phase, 'start', start, model);
  try {
    const value = await run();
    log(trace, phase, 'ok', start, model);
    return value;
  } catch (error) {
    log(trace, phase, 'error', start, model, error);
    throw error;
  }
}

export function patientTimingError(phase: Phase, error: unknown): void {
  const trace = context.getStore();
  if (trace) log(trace, phase, 'error', performance.now(), undefined, error);
}

const mistralFinishReasons = ['stop', 'length', 'model_length', 'error', 'tool_calls'];

function safeCount(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

export function logMistralCompletion(
  finishReason: string | undefined,
  usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | undefined,
  content: string | readonly { type: string }[] | null | undefined,
): void {
  const trace = context.getStore();
  if (!trace) return;
  const chunks = Array.isArray(content) ? content : undefined;
  console.info(JSON.stringify({
    event: 'ecos.patient.mistral_completion',
    trace_id: trace.id,
    finish_reason: finishReason === undefined ? 'missing' : mistralFinishReasons.includes(finishReason) ? finishReason : 'other',
    prompt_tokens: safeCount(usage?.promptTokens),
    completion_tokens: safeCount(usage?.completionTokens),
    total_tokens: safeCount(usage?.totalTokens),
    content_shape: chunks ? 'chunks' : typeof content === 'string' ? 'string' : 'missing',
    chunk_count: chunks?.length,
    text_chunk_count: chunks?.filter(chunk => chunk.type === 'text').length,
    thinking_chunk_count: chunks?.filter(chunk => chunk.type === 'thinking').length,
  }));
}
