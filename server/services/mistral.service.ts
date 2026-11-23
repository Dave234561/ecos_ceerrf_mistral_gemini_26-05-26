import { Mistral } from '@mistralai/mistralai';
import { timedPatientPhase } from './patient-timing.js';

export class EmptyPatientResponseError extends Error {}

export class MistralService {
  private client: Mistral;
  private model: string;

  constructor(apiKey: string, model: string = 'mistral-large-latest') {
    this.client = new Mistral({ apiKey });
    this.model = model;
  }

  async generateResponse(messages: Array<{ role: string; content: string }>, options: { max_tokens?: number; temperature?: number } = {}): Promise<string> {
    // Adapter les messages pour le typage strict du SDK
    const mappedMessages = messages.map((m) => {
      if (m.role === 'system') return { role: 'system', content: m.content };
      if (m.role === 'user') return { role: 'user', content: m.content };
      if (m.role === 'assistant') return { role: 'assistant', content: m.content };
      return m;
    });
    const response = await timedPatientPhase('provider', () => this.client.chat.complete({
      model: this.model,
      messages: mappedMessages,
      ...options
    }), this.model);
    return timedPatientPhase('provider_normalization', () => {
      const content = response.choices?.[0]?.message?.content;
      const text = typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content.map((chunk) => chunk.type === 'text' ? chunk.text : '').join('')
          : '';
      if (!text.trim()) throw new EmptyPatientResponseError('No visible model response text');
      return text;
    }, this.model);
  }
}

export let mistralService: MistralService | null = null;

export function initMistralService(apiKey: string, model?: string) {
  mistralService = new MistralService(apiKey, model);
}
