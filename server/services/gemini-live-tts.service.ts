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
              voiceName: params.voiceName || 'Puck', // 'Puck' est souvent une voix masculine claire, 'Kore' est féminine
            },
          },
        },
        systemInstruction: params.systemInstruction,
        tools: params.tools,
      },
      callbacks: {
        onopen: () => {},
        onmessage: params.onMessage,
        onerror: params.onError || (() => {}),
        onclose: params.onClose || (() => {}),
      },
    });

    const tts = new GeminiLiveTTS();
    tts.session = session;
    return tts;
  }

  async sendToolResponse(toolOutputs: any[]): Promise<void> {
    if (this.closed) return;
    await this.session.sendClientContent({
      tool_responses: toolOutputs
    });
  }

  async speakText(text: string): Promise<void> {
    if (this.closed) return;
    if (!text || !text.trim()) return;

    // Live API expects turns + turnComplete
    await this.session.sendClientContent({
      turns: text,
      turnComplete: true,
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
