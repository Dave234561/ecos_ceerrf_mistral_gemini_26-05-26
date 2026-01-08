// Gemini service for realtime analysis (texte et audio)
import fetch from 'node-fetch';

export class GeminiService {
  private apiKey: string;
  private model: string;
  private apiUrl: string;

  constructor(apiKey: string, model: string = 'gemini-2.5-flash') {
    this.apiKey = apiKey;
    this.model = model;
    this.apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  }

  async generateText(messages: {role: string, content: string}[]): Promise<string> {
    const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n');
    const body = {
      contents: [{ parts: [{ text: prompt }] }]
    };
    const res = await fetch(this.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  // Ajoute ici la méthode audio si besoin (stream, etc.)
}

export let geminiService: GeminiService | null = null;
export function initGeminiService(apiKey: string, model?: string) {
  geminiService = new GeminiService(apiKey, model);
}
