import type { Server as HttpServer } from 'http';
import { createRequire } from 'module';
import { WebSocketServer } from 'ws';
import { logger } from './logger.service.js';

type Json = Record<string, any>;

function safeJsonParse(raw: string): Json | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setupVoiceWebRTC(httpServer: HttpServer) {
  // WebSocket server used only for signaling (offer/answer/ice)
  const wss = new WebSocketServer({ noServer: true });

  // Attach WS upgrade
  httpServer.on('upgrade', (req, socket, head) => {
    try {
      const url = new URL(req.url || '', 'http://localhost');
      if (url.pathname !== '/api/voice/webrtc') return;
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } catch (e) {
      socket.destroy();
    }
  });

  wss.on('connection', async (ws) => {
    // Lazy imports: do not crash server if deps are missing.
    let wrtc: any = null;
    try {
      const require = createRequire(import.meta.url);
      try {
        wrtc = require('@roamhq/wrtc');
      } catch {
        wrtc = require('wrtc');
      }
    } catch {
      ws.send(JSON.stringify({
        type: 'error',
        message: "Missing WebRTC dependency. Install with: npm i @roamhq/wrtc (recommended)  OR  npm i wrtc",
      }));
      ws.close();
      return;
    }

    let GeminiLiveTTS: any = null;
    try {
      const mod = await import('./gemini-live-tts.service.js');
      GeminiLiveTTS = mod.GeminiLiveTTS;
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: "Missing Gemini Live bridge. Ensure server/services/gemini-live-tts.service.ts is built and '@google/genai' is installed." }));
      ws.close();
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY || '';
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash-native-audio-preview';
    if (!apiKey) {
      ws.send(JSON.stringify({ type: 'error', message: 'Missing GEMINI_API_KEY on server.' }));
      ws.close();
      return;
    }

    const pc = new wrtc.RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    let dataChannel: any = null;

    // Bridge to Gemini Live (audio output). We forward audio chunks to the client.
    const gemini = await GeminiLiveTTS.connect({
      apiKey,
      model,
      systemInstruction: 'Tu es un patient virtuel. Réponds naturellement en français.',
      onMessage: (message: any) => {
        try {
          if (message?.serverContent?.interrupted) {
            dataChannel?.send(JSON.stringify({ type: 'interrupt' }));
            return;
          }
          const parts = message?.serverContent?.modelTurn?.parts;
          if (!Array.isArray(parts)) return;

          for (const part of parts) {
            const b64 = part?.inlineData?.data;
            const mimeType = part?.inlineData?.mimeType;
            if (!b64) continue;
            dataChannel?.send(JSON.stringify({ type: 'audio', data: b64, mimeType }));
          }
        } catch (err: any) {
          logger.warn('Voice WebRTC: failed to forward Gemini audio chunk', { error: err?.message });
        }
      },
      onError: (err: any) => {
        try {
          dataChannel?.send(JSON.stringify({ type: 'error', message: err?.message || 'Gemini error' }));
        } catch {}
      },
      onClose: () => {
        try {
          dataChannel?.send(JSON.stringify({ type: 'closed' }));
        } catch {}
      },
    });

    pc.onicecandidate = (event: any) => {
      if (event.candidate) {
        ws.send(JSON.stringify({ type: 'ice', candidate: event.candidate }));
      }
    };

    pc.ondatachannel = (event: any) => {
      dataChannel = event.channel;

      dataChannel.onmessage = async (ev: any) => {
        const msg = typeof ev.data === 'string' ? safeJsonParse(ev.data) : null;
        if (!msg) return;

        if (msg.type === 'speak' && typeof msg.text === 'string') {
          await gemini.speakText(msg.text);
        }
      };

      dataChannel.onclose = () => {
        try {
          gemini.close();
        } catch {}
        try {
          pc.close();
        } catch {}
      };
    };

    ws.on('message', async (raw) => {
      const msg = safeJsonParse(raw.toString());
      if (!msg) return;

      if (msg.type === 'offer') {
        await pc.setRemoteDescription(new wrtc.RTCSessionDescription(msg.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({ type: 'answer', answer }));
      }

      if (msg.type === 'ice' && msg.candidate) {
        try {
          await pc.addIceCandidate(new wrtc.RTCIceCandidate(msg.candidate));
        } catch (e: any) {
          logger.warn('Voice WebRTC: failed to add ICE candidate', { error: e?.message });
        }
      }

      if (msg.type === 'close') {
        try {
          gemini.close();
        } catch {}
        try {
          pc.close();
        } catch {}
        try {
          ws.close();
        } catch {}
      }
    });

    ws.on('close', () => {
      try {
        gemini.close();
      } catch {}
      try {
        pc.close();
      } catch {}
    });

    ws.send(JSON.stringify({ type: 'ready' }));
  });

  logger.info('Voice WebRTC signaling enabled', { path: '/api/voice/webrtc' });
}
