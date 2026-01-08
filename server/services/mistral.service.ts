import { Mistral } from '@mistralai/mistralai';

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
    const response = await this.client.chat.complete({
      model: this.model,
      messages: mappedMessages,
      ...options
    });
    return typeof response.choices[0]?.message?.content === 'string' ? response.choices[0].message.content : '';
  }
}

export let mistralService: MistralService | null = null;

export function initMistralService(apiKey: string, model?: string) {
  mistralService = new MistralService(apiKey, model);
}
