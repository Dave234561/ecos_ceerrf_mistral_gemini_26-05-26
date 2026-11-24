import { OpenAIService, openaiService } from './openai.service.js';
import { MistralService, mistralService, initMistralService } from './mistral.service.js';
import { GeminiService, geminiService, initGeminiService } from './gemini.service.js';

const provider = process.env.LLM_PROVIDER || 'openai';
const realtimeProvider = process.env.REALTIME_PROVIDER || 'openai';

// Initialize Mistral if needed
if (provider === 'mistral') {
  initMistralService(process.env.MISTRAL_API_KEY || '');
}
// Initialize Gemini if needed
if (realtimeProvider === 'gemini') {
  initGeminiService(process.env.GEMINI_API_KEY || '', process.env.GEMINI_MODEL);
}

export class LLMService {
  async generateResponse(question, relevantContent, options: { simulatedPatient?: boolean } = {}) {
    if (provider === 'mistral' && mistralService) {
      // Mistral expects messages array
      const contextText = typeof relevantContent === 'string' ? relevantContent : (relevantContent || []).map((item, idx) => `Context ${idx + 1}:\n${item.content}`).join('\n');
      const messages = [
        { role: 'system', content: 'Réponds en français, précis, concis, sans inventer.' },
        { role: 'user', content: `Question: ${question}\n\nContext:\n${contextText}` }
      ];
      return await mistralService.generateResponse(messages, {
        max_tokens: 1000,
        temperature: 0.5,
        ...(options.simulatedPatient ? { simulatedPatient: true } : {}),
      });
    }
    // Default: OpenAI
    return await openaiService.generateResponse(question, relevantContent);
  }

  async createCompletion(params) {
    if (provider === 'mistral' && mistralService) {
      // Adapter params pour Mistral
      const { model, messages, temperature, max_tokens } = params;
      return await mistralService.generateResponse(messages, { max_tokens, temperature });
    }
    return await openaiService.createCompletion(params);
  }
}

export const llmService = new LLMService();
