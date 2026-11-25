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
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      if (url.pathname !== '/api/voice/webrtc') return;
      wss.handleUpgrade(req, socket, head, (ws) => {
        // Pass the request to the connection handler to access query params
        (ws as any).upgradeReq = req;
        wss.emit('connection', ws, req);
      });
    } catch (e) {
      socket.destroy();
    }
  });

  wss.on('connection', async (ws, req) => {
    // Extract voiceType from query params
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const requestedVoiceType = url.searchParams.get('voiceType') || 'male';
    const voiceName = requestedVoiceType === 'female' ? 'Kore' : 'Puck';

    console.log(`🎙️ New Voice WebRTC connection. VoiceType: ${requestedVoiceType}, Gemini Voice: ${voiceName}`);

    // Lazy imports: do not crash server if deps are missing.
    let wrtc: any = null;
    let wrtcLoadError: unknown;
    try {
      const require = createRequire(import.meta.url);
      try {
        wrtc = require('@roamhq/wrtc');
      } catch (error) {
        wrtcLoadError = error;
        wrtc = require('wrtc');
      }
    } catch (error) {
      logger.error('Voice WebRTC: failed to load WebRTC native dependency', {
        primaryError: wrtcLoadError instanceof Error ? wrtcLoadError.message : String(wrtcLoadError),
        fallbackError: error instanceof Error ? error.message : String(error),
      });
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
    const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp'; // Use stable flash model if available
    
    if (!apiKey) {
      ws.send(JSON.stringify({ type: 'error', message: 'Missing GEMINI_API_KEY on server.' }));
      ws.close();
      return;
    }

    const pc = new wrtc.RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    let dataChannel: any = null;
    let remoteDescriptionReady = false;
    const pendingRemoteCandidates: any[] = [];

    console.log(`🔧 Connecting to Gemini Live with config:`, {
      model,
      voiceName,
      requestedVoiceType
    });

    // Bridge to Gemini Live (audio output). We forward audio chunks to the client.
    let gemini: any;
    try {
      gemini = await GeminiLiveTTS.connect({
      apiKey,
      model,
      voiceName,
      systemInstruction: 'Tu es un patient virtuel. Réponds naturellement en français. Si l\'utilisateur semble hésiter ou s\'arrêter au milieu d\'une phrase, utilise l\'outil wait_more pour lui indiquer que tu attends la suite.',
      tools: [
        {
          function_declarations: [
            {
              name: 'wait_more',
              description: 'Indique au système d\'attendre que l\'utilisateur finisse sa phrase. À utiliser si l\'utilisateur marque une pause mais semble avoir encore des choses à dire.',
              parameters: {
                type: 'OBJECT',
                properties: {
                  reason: {
                    type: 'STRING',
                    description: 'La raison pour laquelle on attend (optionnel).'
                  }
                }
              }
            }
          ]
        }
      ],
      onMessage: async (message: any) => {
        try {
          if (message?.serverContent?.interrupted) {
            dataChannel?.send(JSON.stringify({ type: 'interrupt' }));
            return;
          }

          // Handle User Transcription (STT) from Gemini
          const userTranscription = message?.serverContent?.userTurn?.parts?.[0]?.text;
          if (userTranscription) {
            console.log('🗣️ User transcript from Gemini:', userTranscription);
            dataChannel?.send(JSON.stringify({ type: 'transcript', text: userTranscription, role: 'user' }));
          }

          // Handle Model Transcription
          const modelTranscription = message?.serverContent?.modelTurn?.parts?.[0]?.text;
          if (modelTranscription) {
            dataChannel?.send(JSON.stringify({ type: 'transcript', text: modelTranscription, role: 'assistant' }));
          }

          // Handle Tool Calls
          const toolCall = message?.toolCall;
          if (toolCall?.functionCalls) {
            const toolResponses: any[] = [];
            for (const fc of toolCall.functionCalls) {
              if (fc.name === 'wait_more') {
                console.log('🤖 Bot called wait_more');
                dataChannel?.send(JSON.stringify({ type: 'waiting', message: "Le patient vous attend..." }));
                toolResponses.push({
                  name: fc.name,
                  id: fc.id,
                  response: { success: true, status: 'waiting' }
                });
              }
            }
            if (toolResponses.length > 0) {
              await gemini.sendToolResponse(toolResponses);
            }
            return;
          }

          const parts = message?.serverContent?.modelTurn?.parts;
          if (!Array.isArray(parts)) {
            console.log('🔍 No parts found in message:', JSON.stringify(message, null, 2));
            return;
          }

          console.log(`🎵 Processing ${parts.length} parts from Gemini Live (voice: ${voiceName})`);
          
          for (const part of parts) {
            const b64 = part?.inlineData?.data;
            const mimeType = part?.inlineData?.mimeType;
            
            if (!b64) {
              console.log('🔍 Part without audio data:', part);
              continue;
            }
            
            console.log(`🎵 Sending audio chunk: ${mimeType}, size: ${b64.length} chars`);
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
    } catch (error: any) {
      const message = error?.message || 'Failed to connect to Gemini Live';
      logger.error('Voice WebRTC: failed to connect to Gemini Live', { error: message });
      try { ws.send(JSON.stringify({ type: 'error', message })); } catch {}
      try { pc.close(); } catch {}
      try { ws.close(); } catch {}
      return;
    }

    pc.onicecandidate = (event: any) => {
      if (event.candidate) {
        ws.send(JSON.stringify({ type: 'ice', candidate: event.candidate }));
      }
    };
    pc.onconnectionstatechange = () => {
      logger.info('Voice WebRTC peer connection state changed', { state: pc.connectionState });
    };
    pc.oniceconnectionstatechange = () => {
      logger.info('Voice WebRTC ICE state changed', { state: pc.iceConnectionState });
    };

    pc.ondatachannel = (event: any) => {
      dataChannel = event.channel;
      logger.info('Voice WebRTC data channel received', { label: dataChannel.label });
      dataChannel.onopen = () => logger.info('Voice WebRTC data channel opened');
      dataChannel.onclose = () => logger.info('Voice WebRTC data channel closed');
      let receivedAudioChunks = 0;
      let lastAudioLogAt = 0;

      dataChannel.onmessage = async (ev: any) => {
        const msg = typeof ev.data === 'string' ? safeJsonParse(ev.data) : null;
        if (!msg) return;

        // Handle text-to-speech (fallback/existing functionality)
        if (msg.type === 'speak' && typeof msg.text === 'string') {
          await gemini.speakText(msg.text);
        }

        // Handle direct audio input from client microphone
        if (msg.type === 'audio' && typeof msg.data === 'string') {
          receivedAudioChunks++;
          const now = Date.now();
          if (receivedAudioChunks === 1 || now - lastAudioLogAt >= 5000) {
            logger.info('Voice WebRTC audio received from browser', {
              chunks: receivedAudioChunks,
              base64Chars: msg.data.length,
              mimeType: msg.mimeType || 'audio/pcm;rate=16000'
            });
            lastAudioLogAt = now;
          }
          const mimeType = msg.mimeType || 'audio/pcm;rate=16000';
          await gemini.sendAudio(msg.data, mimeType);
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
        logger.info('Voice WebRTC offer received');
        await pc.setRemoteDescription(new wrtc.RTCSessionDescription(msg.offer));
        remoteDescriptionReady = true;
        for (const candidate of pendingRemoteCandidates.splice(0)) {
          try {
            await pc.addIceCandidate(new wrtc.RTCIceCandidate(candidate));
          } catch (error: any) {
            logger.warn('Voice WebRTC: failed to apply queued ICE candidate', { error: error?.message });
          }
        }
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({ type: 'answer', answer }));
        logger.info('Voice WebRTC answer sent');
      }

      if (msg.type === 'ice' && msg.candidate) {
        if (!remoteDescriptionReady) {
          pendingRemoteCandidates.push(msg.candidate);
        } else {
          try {
            await pc.addIceCandidate(new wrtc.RTCIceCandidate(msg.candidate));
          } catch (e: any) {
            logger.warn('Voice WebRTC: failed to add ICE candidate', { error: e?.message });
          }
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

    ws.on('close', (code: number, reason: Buffer) => {
      logger.info('Voice WebRTC signaling socket closed', {
        code,
        reason: reason.toString()
      });
      try {
        gemini.close();
      } catch {}
      try {
        pc.close();
      } catch {}
    });

    ws.send(JSON.stringify({ type: 'ready' }));
    logger.info('Voice WebRTC signaling ready sent');
  });

  logger.info('Voice WebRTC signaling enabled', { path: '/api/voice/webrtc' });
}
