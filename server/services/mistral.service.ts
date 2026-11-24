import { HTTPClient, Mistral } from '@mistralai/mistralai';
import { logMistralCompletion, timedPatientPhase } from './patient-timing.js';

export class EmptyPatientResponseError extends Error {}

export class MistralService {
  private client: Mistral;
  private patientSmallClient: Mistral;
  private model: string;

  constructor(apiKey: string, model: string = 'mistral-large-latest') {
    this.client = new Mistral({ apiKey });
    // SDK 1.x strips reasoning_effort during serialization. Add it only for the
    // explicitly selected patient client, retaining SDK authentication and retries.
    const patientHttpClient = new HTTPClient().addHook('beforeRequest', async (request) => {
      if (request.method !== 'POST' || new URL(request.url).pathname !== '/v1/chat/completions') return request;
      const payload = await request.clone().json() as Record<string, unknown>;
      const body = JSON.stringify({ ...payload, reasoning_effort: 'none' });
      const headers = new Headers(request.headers);
      headers.delete('content-length');
      return new Request(request, { body, headers });
    });
    this.patientSmallClient = new Mistral({ apiKey, httpClient: patientHttpClient });
    this.model = model;
  }

  async generateResponse(messages: Array<{ role: string; content: string }>, options: { max_tokens?: number; temperature?: number; simulatedPatient?: boolean } = {}): Promise<string> {
    // Adapter les messages pour le typage strict du SDK
    const mappedMessages = messages.map((m) => {
      if (m.role === 'system') return { role: 'system', content: m.content };
      if (m.role === 'user') return { role: 'user', content: m.content };
      if (m.role === 'assistant') return { role: 'assistant', content: m.content };
      return m;
    });
    const client = options.simulatedPatient ? this.patientSmallClient : this.client;
    const model = options.simulatedPatient ? 'mistral-small-2603' : this.model;
    const response = await timedPatientPhase('provider', () => client.chat.complete({
      model,
      messages: mappedMessages,
      temperature: options.temperature,
      ...(options.max_tokens !== undefined ? { maxTokens: options.max_tokens } : {})
    }), model);
    const choice = response.choices?.[0];
    const content = choice?.message?.content;
    logMistralCompletion(choice?.finishReason, response.usage, content);
    return timedPatientPhase('provider_normalization', () => {
      const text = typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content.map((chunk) => chunk.type === 'text' ? chunk.text : '').join('')
          : '';
      if (!text.trim()) throw new EmptyPatientResponseError('No visible model response text');
      return text;
    }, model);
  }
}

export let mistralService: MistralService | null = null;

export function initMistralService(apiKey: string, model?: string) {
  mistralService = new MistralService(apiKey, model);
}
