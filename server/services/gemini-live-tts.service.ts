import { createRequire } from 'module';

type LiveMessageHandler = (msg: any) => void;

export class GeminiLiveTTS {
  private session: any;
  private closed = false;

  static async connect(params: {
    apiKey: string;
    model: string;
    systemInstruction?: string;
    tools?: any[];
    voiceName?: 'Aoede' | 'Charon' | 'Fenrir' | 'Kore' | 'Puck';
    onMessage: LiveMessageHandler;
    onError?: (err: any) => void;
    onClose?: (ev: any) => void;
  }): Promise<GeminiLiveTTS> {
    const require = createRequire(import.meta.url);
    const { GoogleGenAI, Modality } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey: params.apiKey });

    const session = await ai.live.connect({
      model: params.model,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: params.voiceName || 'Puck',
            },
          },
        },
        systemInstruction: params.systemInstruction,
        tools: params.tools,
      },
      callbacks: {
        onopen: () => {
          console.log('✅ Gemini Live connection opened');
        },
        onmessage: (message: any) => {
          params.onMessage(message);
        },
        onerror: (err: any) => {
          console.error('❌ Gemini Live error:', err);
          if (params.onError) params.onError(err);
        },
        onclose: (ev: any) => {
          console.log('ℹ️ Gemini Live connection closed');
          if (params.onClose) params.onClose(ev);
        },
      },
    });

    const tts = new GeminiLiveTTS();
    tts.session = session;
    return tts;
  }

  async sendToolResponse(toolOutputs: any[]): Promise<void> {
    if (this.closed) return;
    await this.session.send({
      toolResponse: {
        functionResponses: toolOutputs
      }
    });
  }

  async speakText(text: string): Promise<void> {
    if (this.closed) return;
    if (!text || !text.trim()) return;

    await this.session.send({
      clientContent: {
        turns: [{
          role: 'user',
          parts: [{ text: text }]
        }],
        turnComplete: true
      }
    });
  }

  /**
   * Send raw audio data to Gemini Live for real-time speech recognition and response.
   * Based on official documentation: session.sendRealtimeInput({ audio: { data, mimeType } })
   */
  async sendAudio(audioBase64: string, mimeType: string = 'audio/pcm;rate=16000'): Promise<void> {
    if (this.closed) return;
    if (!audioBase64) return;

    await this.session.sendRealtimeInput({
      audio: {
        data: audioBase64,
        mimeType: mimeType,
      },
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.session?.close?.();
    } catch {
      // ignore
    }
  }
}
