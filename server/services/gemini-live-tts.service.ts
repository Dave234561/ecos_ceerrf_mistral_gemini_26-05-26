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
    });

    const tts = new GeminiLiveTTS();
    tts.session = session;

    // Register callbacks after connecting
    session.on('open', () => {
      console.log(' Gemini Live connection opened');
    });

    session.on('message', (message: any) => {
      params.onMessage(message);
    });

    session.on('error', (err: any) => {
      console.error(' Gemini Live error:', err);
      if (params.onError) params.onError(err);
    });

    session.on('close', (ev: any) => {
      console.log(' Gemini Live connection closed');
      if (params.onClose) params.onClose(ev);
    });

    return tts;
  }

  async sendToolResponse(toolOutputs: any[]): Promise<void> {
    if (this.closed) return;
    await this.session.send({
      tool_responses: toolOutputs
    });
  }

  async speakText(text: string): Promise<void> {
    if (this.closed) return;
    if (!text || !text.trim()) return;

    await this.session.send({
      text: text,
      end_of_turn: true,
    });
  }

  /**
   * Send raw audio data to Gemini Live for real-time speech recognition and response.
   */
  async sendAudio(audioBase64: string, mimeType: string = 'audio/pcm;rate=16000'): Promise<void> {
    if (this.closed) return;
    if (!audioBase64) return;

    await this.session.send({
      realtime_input: {
        media_chunks: [
          {
            data: audioBase64,
            mime_type: mimeType,
          },
        ],
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
