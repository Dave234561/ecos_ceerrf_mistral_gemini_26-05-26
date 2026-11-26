import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Clock, Send, User, Bot, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { getScenarioIdWithFallback, debugSessionData } from "@/utils/sessionUtils";
import LoadingIndicator from "./LoadingIndicator";
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';

interface PatientSimulatorProps {
  sessionId: string;
  email: string;
  onSessionEnd: () => void;
  onShowEvaluation?: (sessionId: string) => void;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export default function PatientSimulator({ sessionId, email, onSessionEnd, onShowEvaluation }: PatientSimulatorProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentQuery, setCurrentQuery] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [isPatientWaiting, setIsPatientWaiting] = useState(false);
  const [sessionStartTime] = useState(new Date());
  const [remainingTime, setRemainingTime] = useState(25 * 60); // 25 minutes in seconds
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [showImagePopup, setShowImagePopup] = useState(false);

  // WebRTC (client) for Gemini Live audio playback
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const suppressAudioUntilRef = useRef(0);
  const recognitionRef = useRef<any>(null);
  const voiceEnabledRef = useRef(false);
  const sendMessageRef = useRef<(text: string) => void>(() => {});
  const lastVoiceSendAtRef = useRef(0);
  const lastVoiceTranscriptRef = useRef('');
  
  // Direct audio streaming refs
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioWorkletRef = useRef<AudioWorkletNode | null>(null);
  const micAudioCtxRef = useRef<AudioContext | null>(null);

  const decodeBase64ToArrayBuffer = (b64: string): ArrayBuffer => {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  };

  const decodeBase64ToPcm16LE = (b64: string): Int16Array => {
    const buf = decodeBase64ToArrayBuffer(b64);
    const view = new DataView(buf);
    const len = Math.floor(buf.byteLength / 2);
    const out = new Int16Array(len);
    for (let i = 0; i < len; i++) {
      out[i] = view.getInt16(i * 2, true);
    }
    return out;
  };

  const unlockAudio = async () => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
          sampleRate: 24000,
        });
        nextPlayTimeRef.current = audioCtxRef.current.currentTime;
      }
      if (audioCtxRef.current.state === 'suspended') {
        await audioCtxRef.current.resume();
      }
    } catch {
      // ignore
    }
  };

  const ensureAudioContext = async (sampleRate: number) => {
    if (!audioCtxRef.current || audioCtxRef.current.sampleRate !== sampleRate) {
      try { audioCtxRef.current?.close(); } catch {}
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate,
      });
      nextPlayTimeRef.current = audioCtxRef.current.currentTime;
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch {}
    }
    return ctx;
  };

  const playPcm16 = async (pcm16: Int16Array, sampleRate: number) => {
    if (!pcm16.length) return;
    const ctx = await ensureAudioContext(sampleRate);

    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = Math.max(-1, Math.min(1, pcm16[i] / 32768));
    }

    const buffer = ctx.createBuffer(1, float32.length, sampleRate);
    buffer.getChannelData(0).set(float32);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);

    const startAt = Math.max(ctx.currentTime, nextPlayTimeRef.current);
    src.start(startAt);
    nextPlayTimeRef.current = startAt + buffer.duration;
  };

  const playEncodedAudio = async (b64: string) => {
    const buf = decodeBase64ToArrayBuffer(b64);
    const ctx = await ensureAudioContext(audioCtxRef.current?.sampleRate || 24000);
    const audioBuffer = await ctx.decodeAudioData(buf.slice(0));

    const src = ctx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(ctx.destination);
    const startAt = Math.max(ctx.currentTime, nextPlayTimeRef.current);
    src.start(startAt);
    nextPlayTimeRef.current = startAt + audioBuffer.duration;
  };

  const playAudioChunk = async (b64: string, mimeType?: string) => {
    const mt = (mimeType || '').toLowerCase();
    if (mt.includes('audio/pcm') || mt.includes('audio/l16')) {
      const m = /rate=(\d+)/.exec(mt);
      const rate = m ? parseInt(m[1], 10) : 24000;
      const pcm16 = decodeBase64ToPcm16LE(b64);
      await playPcm16(pcm16, Number.isFinite(rate) ? rate : 24000);
      return;
    }
    await playEncodedAudio(b64);
  };

  const interruptAudioPlayback = () => {
    suppressAudioUntilRef.current = performance.now() + 400;
    try { window.speechSynthesis?.cancel?.(); } catch {}
    try { audioCtxRef.current?.close(); } catch {}
    audioCtxRef.current = null;
    nextPlayTimeRef.current = 0;
  };

  // Fetch session details - MUST be declared before useEffect that uses it
  const { data: session } = useQuery({
    queryKey: ['ecos-session', sessionId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/ecos/sessions/${sessionId}?email=${email}`);
      return response.session;
    }
  });

  const sendSpeakText = (text: string) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== 'open') return;
    if (!text || !text.trim()) return;
    try {
      dc.send(JSON.stringify({ type: 'speak', text }));
    } catch {}
  };

  useEffect(() => {
    // Connect WebRTC once per simulator session
    if (!session) return;

    const voiceType = session?.scenario?.voiceType || session?.scenario?.voice_type || 'male';
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/api/voice/webrtc?voiceType=${voiceType}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    pcRef.current = pc;

    const dc = pc.createDataChannel('voice');
    dcRef.current = dc;
    let offerSent = false;
    let remoteDescriptionReady = false;
    const pendingRemoteCandidates: RTCIceCandidateInit[] = [];

    dc.onopen = () => console.info('🎙️ WebRTC data channel is open; audio can be sent');
    dc.onclose = () => console.warn('🎙️ WebRTC data channel closed');
    pc.onconnectionstatechange = () => {
      console.info('🎙️ WebRTC connection state:', pc.connectionState);
    };

    dc.onmessage = async (ev) => {
      if (typeof ev.data !== 'string') return;
      let msg: any;
      try { msg = JSON.parse(ev.data); } catch { return; }

      if (msg.type === 'interrupt') {
        interruptAudioPlayback();
        return;
      }

      if (msg.type === 'waiting') {
        setIsPatientWaiting(true);
        // Reset waiting status after 5 seconds or when audio starts
        setTimeout(() => setIsPatientWaiting(false), 5000);
        return;
      }

      if (msg.type === 'audio' && typeof msg.data === 'string') {
        if (performance.now() < suppressAudioUntilRef.current) return;
        setIsPatientWaiting(false);
        await playAudioChunk(msg.data, msg.mimeType);
      }

      if (msg.type === 'transcript') {
        console.log(`📝 Received transcript (${msg.role}): ${msg.text}`);
        
        // Handle user transcript (what the student said)
        if (msg.role === 'user') {
          // We only add it if it's not empty and different from the last one to avoid duplicates
          const cleanText = msg.text.trim();
          if (cleanText && cleanText !== lastVoiceTranscriptRef.current) {
            lastVoiceTranscriptRef.current = cleanText;
            
            setMessages(prev => {
              // Avoid adding duplicate user messages that might come from both STT and Gemini transcript
              const lastMsg = prev[prev.length - 1];
              if (lastMsg && lastMsg.role === 'user' && lastMsg.content === cleanText) return prev;
              
              return [...prev, {
                id: Date.now().toString() + '-user-voice',
                role: 'user',
                content: cleanText,
                timestamp: new Date().toISOString()
              }];
            });
          }
        }
        
        // Handle assistant transcript (what the patient said)
        if (msg.role === 'assistant') {
          const cleanText = msg.text.trim();
          if (cleanText) {
            setMessages(prev => {
              // If the last message was a user message, we add this as a new assistant response
              // If the last message was already an assistant message, we might want to append or replace
              // For now, let's just add it if it's different from the last content
              const lastMsg = prev[prev.length - 1];
              if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content === cleanText) return prev;
              
              return [...prev, {
                id: Date.now().toString() + '-assistant-voice',
                role: 'assistant',
                content: cleanText,
                timestamp: new Date().toISOString()
              }];
            });
          }
        }
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        try {
          ws.send(JSON.stringify({ type: 'ice', candidate: event.candidate }));
        } catch {}
      }
    };

    ws.onmessage = async (event) => {
      let msg: any;
      try { msg = JSON.parse(event.data); } catch { return; }

      if (msg.type === 'ready' && !offerSent) {
        offerSent = true;
        console.info('🎙️ Voice server ready; starting WebRTC negotiation');
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          ws.send(JSON.stringify({ type: 'offer', offer }));
        } catch (error) {
          console.error('🎙️ Failed to start WebRTC negotiation:', error);
        }
        return;
      }

      if (msg.type === 'error') {
        console.error('🎙️ Voice server error:', msg.message);
        return;
      }

      if (msg.type === 'answer' && msg.answer) {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.answer));
        remoteDescriptionReady = true;
        for (const candidate of pendingRemoteCandidates.splice(0)) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (error) {
            console.warn('🎙️ Failed to apply queued ICE candidate:', error);
          }
        }
      }
      if (msg.type === 'ice' && msg.candidate) {
        if (!remoteDescriptionReady) {
          pendingRemoteCandidates.push(msg.candidate);
        } else {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
          } catch (error) {
            console.warn('🎙️ Failed to apply ICE candidate:', error);
          }
        }
      }
    };

    const cleanup = () => {
      try { ws.send(JSON.stringify({ type: 'close' })); } catch {}
      try { ws.close(); } catch {}
      try { dc.close(); } catch {}
      try { pc.close(); } catch {}
      wsRef.current = null;
      dcRef.current = null;
      pcRef.current = null;

      try { audioCtxRef.current?.close(); } catch {}
      audioCtxRef.current = null;
      nextPlayTimeRef.current = 0;
    };

    ws.onopen = () => console.info('🎙️ Voice signaling WebSocket opened');
    ws.onerror = (event) => {
      console.error('🎙️ Voice signaling WebSocket error:', event);
      cleanup();
    };
    ws.onclose = (event) => {
      console.info('🎙️ Voice signaling WebSocket closed:', event.code, event.reason);
      cleanup();
    };

    return cleanup;
  }, [sessionId, session?.scenario?.id, session?.scenario?.voice_type, session?.scenario?.voiceType]);

  // Immediate STT feedback for user
  useSpeechRecognition({
    enabled: voiceEnabled,
    onResult: (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      
      console.log('🎙️ Browser STT result:', clean);
      
      // Deduplicate with last message
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'user' && (last.content === clean || last.content.includes(clean))) return prev;
        
        return [...prev, {
          id: Date.now().toString() + '-user-stt',
          role: 'user',
          content: clean,
          timestamp: new Date().toISOString()
        }];
      });
      
      // Interrupt patient if speaking
      interruptAudioPlayback();
    },
    lang: 'fr-FR',
  });

  // Countdown timer effect
  useEffect(() => {
    const timer = setInterval(() => {
      setRemainingTime(prev => {
        if (prev <= 1) {
          // Time's up - automatically end session
          endSessionMutation.mutate();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Auto-scroll to the latest message whenever messages change
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  // Synthèse vocale automatique de la réponse IA
  useEffect(() => {
    // If WebRTC voice channel is active, do not use browser TTS (avoid double audio / autoplay issues)
    if (dcRef.current && dcRef.current.readyState === 'open') return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (!messages || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last?.role !== 'assistant' || !last.content) return;
    try { window.speechSynthesis.cancel(); } catch {}
    const utter = new window.SpeechSynthesisUtterance(last.content);
    utter.lang = 'fr-FR';
    
    // Select voice based on scenario preference
    const voices = window.speechSynthesis.getVoices();
    const voiceType = session?.scenario?.voiceType || session?.scenario?.voice_type || 'male';
    
    if (voices.length > 0) {
      // Try to find a suitable French voice
      const frenchVoices = voices.filter(v => v.lang.startsWith('fr'));
      if (frenchVoices.length > 0) {
        if (voiceType === 'female') {
          // Look for common female names in voice synthesis
          const femaleVoice = frenchVoices.find(v => 
            v.name.toLowerCase().includes('hortense') || 
            v.name.toLowerCase().includes('julie') ||
            v.name.toLowerCase().includes('female') ||
            v.name.toLowerCase().includes('femme')
          );
          if (femaleVoice) utter.voice = femaleVoice;
        } else {
          // Look for common male names or default
          const maleVoice = frenchVoices.find(v => 
            v.name.toLowerCase().includes('paul') || 
            v.name.toLowerCase().includes('male') ||
            v.name.toLowerCase().includes('homme')
          );
          if (maleVoice) utter.voice = maleVoice;
        }
      }
    }

    utter.rate = 1.0;
    utter.pitch = voiceType === 'female' ? 1.1 : 0.9;
    try { window.speechSynthesis.speak(utter); } catch {}
    return () => {
      try { window.speechSynthesis.cancel(); } catch {}
    };
  }, [messages]);


  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (query: string) => {
      // Use session utilities to get the best available scenarioId
      const resolvedScenarioId = getScenarioIdWithFallback({
        session,
        sessionId: sessionId
      });

      console.log('🔄 [PatientSimulator] Sending message with resolved session details:', {
        email,
        sessionId,
        resolvedScenarioId,
        sessionScenarioId: session?.scenarioId,
        query: query.substring(0, 50) + '...'
      });

      // Debug session data for troubleshooting
      debugSessionData({
        sessionId,
        session,
        scenarioId: resolvedScenarioId ?? undefined
      });
      
      return apiRequest('POST', '/api/ecos/patient-simulator', {
        email,
        sessionId,
        query,
        scenarioId: resolvedScenarioId ?? undefined
      });
    },
    onSuccess: (data, query) => {
      // Add user message
      const userMessage: Message = {
        id: Date.now().toString() + '-user',
        role: 'user',
        content: query,
        timestamp: new Date().toISOString()
      };

      // Add assistant response
      const assistantMessage: Message = {
        id: Date.now().toString() + '-assistant',
        role: 'assistant',
        content: data.response,
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, userMessage, assistantMessage]);
      setCurrentQuery("");

      // Trigger Gemini Live audio via WebRTC
      sendSpeakText(data.response);
    }
  });

  useEffect(() => {
    sendMessageRef.current = (text: string) => {
      const clean = (text || '').trim();
      if (!clean) return;
      if (sendMessageMutation.isPending) return;

      // Anti-rafale: SpeechRecognition peut renvoyer plusieurs "final" très rapprochés
      const now = Date.now();
      if (now - lastVoiceSendAtRef.current < 1500) return;
      if (clean === lastVoiceTranscriptRef.current) return;

      lastVoiceSendAtRef.current = now;
      lastVoiceTranscriptRef.current = clean;
      setIsPatientWaiting(false);
      sendMessageMutation.mutate(clean);
    };
  }, [sendMessageMutation]);

  // Direct audio streaming to Gemini Live
  useEffect(() => {
    voiceEnabledRef.current = voiceEnabled;

    if (!voiceEnabled) {
      // Stop microphone streaming
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(track => track.stop());
        micStreamRef.current = null;
      }
      if (micAudioCtxRef.current) {
        try { micAudioCtxRef.current.close(); } catch {}
        micAudioCtxRef.current = null;
      }
      audioWorkletRef.current = null;
      console.log('🎤 [DirectAudio] Stopped microphone streaming');
      return;
    }

    let stopped = false;

    const startMicrophoneStreaming = async () => {
      try {
        // Request microphone access
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: 16000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          }
        });
        
        if (stopped) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        micStreamRef.current = stream;
        console.log('🎤 [DirectAudio] Microphone access granted');

        // Create AudioContext for processing at 16kHz (Gemini expects this)
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
          sampleRate: 16000,
        });
        micAudioCtxRef.current = audioCtx;

        const source = audioCtx.createMediaStreamSource(stream);
        
        // Use ScriptProcessorNode (deprecated but widely supported) for audio processing
        // Buffer size of 4096 samples at 16kHz = ~256ms chunks
        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        
        processor.onaudioprocess = (event) => {
          if (!voiceEnabledRef.current || stopped) return;
          
          const dc = dcRef.current;
          if (!dc || dc.readyState !== 'open') return;

          const inputData = event.inputBuffer.getChannelData(0);
          
          // Convert Float32 (-1 to 1) to Int16 PCM
          const pcm16 = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }

          // Convert to base64
          const uint8 = new Uint8Array(pcm16.buffer);
          let binary = '';
          for (let i = 0; i < uint8.length; i++) {
            binary += String.fromCharCode(uint8[i]);
          }
          const base64 = btoa(binary);

          // Send audio chunk to server via DataChannel
          try {
            dc.send(JSON.stringify({
              type: 'audio',
              data: base64,
              mimeType: 'audio/pcm;rate=16000'
            }));
          } catch (e) {
            console.error('🎤 [DirectAudio] Failed to send audio chunk:', e);
          }
        };

        source.connect(processor);
        processor.connect(audioCtx.destination);
        
        console.log('🎤 [DirectAudio] Started streaming audio to Gemini Live');

      } catch (err: any) {
        console.error('🎤 [DirectAudio] Failed to start microphone:', err);
        if (err.name === 'NotAllowedError') {
          alert('Accès au microphone refusé. Veuillez autoriser l\'accès dans les paramètres de votre navigateur.');
        } else if (err.name === 'NotFoundError') {
          alert('Aucun microphone trouvé. Vérifiez que votre microphone est branché.');
        } else {
          alert(`Erreur microphone: ${err.message}`);
        }
        setVoiceEnabled(false);
      }
    };

    startMicrophoneStreaming();

    return () => {
      stopped = true;
      voiceEnabledRef.current = false;
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(track => track.stop());
        micStreamRef.current = null;
      }
      if (micAudioCtxRef.current) {
        try { micAudioCtxRef.current.close(); } catch {}
        micAudioCtxRef.current = null;
      }
      audioWorkletRef.current = null;
    };
  }, [voiceEnabled]);

  // End session mutation
  const endSessionMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('PUT', `/api/ecos/sessions/${sessionId}`, {
        email,
        status: 'completed'
      });
    },
    onSuccess: () => {
      // If there are messages (meaningful interaction), show evaluation
      if (messages.length > 0 && onShowEvaluation && sessionId) {
        console.log('✅ Calling onShowEvaluation with sessionId:', sessionId);
        onShowEvaluation(sessionId);
      } else {
        // No interaction occurred, go back to dashboard
        console.log('⚠️ No messages or invalid sessionId, returning to dashboard');
        onSessionEnd();
      }
    },
    onError: (error) => {
      console.error('Error ending session:', error);
    }
  });

  const handleSendMessage = () => {
    if (currentQuery.trim()) {
      // Ensure AudioContext is unlocked by a user gesture
      unlockAudio();
      // Check if we have any way to resolve scenarioId before sending
      const resolvedScenarioId = getScenarioIdWithFallback({
        session,
        sessionId: sessionId
      });

      if (!resolvedScenarioId) {
        console.warn('⚠️ [PatientSimulator] No scenarioId available, message may use fallback prompt');
      }

      sendMessageMutation.mutate(currentQuery);
    }
  };

  const handleEndSession = () => {
    endSessionMutation.mutate();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Get scenario image based on scenario ID
  const getScenarioImage = () => {
    // scenarioId can be in session.scenario.id or session.scenarioId or session.scenario_id
    const scenarioId = session?.scenario?.id || session?.scenarioId || session?.scenario_id;
    const title = session?.scenario?.title?.toLowerCase() || '';
    
    console.log('🖼️ [getScenarioImage] Debug:', {
      scenarioId,
      'session.scenario.id': session?.scenario?.id,
      'session.scenarioId': session?.scenarioId,
      'session.scenario_id': session?.scenario_id,
      title
    });

    const scenarioImages: Record<number, string> = {
      1: "/images/otite_sans_pleurs_1.png", // Douleur de l'oreille chez l'Enfant (ORL)
      2: "/images/douleur_thoracic.png",
      3: "/images/trauma_poignet.png",
      4: "/images/patient_psychiatrique.png",
      5: "/images/patient_age_choc.png", // État de choc - Patient âgé en médecine interne
      6: "/images/syndrome_du_canal_carpien.png",
      7: "/images/patient_psychiatrique.png",
    };

    if (scenarioId && scenarioImages[scenarioId]) {
      return scenarioImages[scenarioId];
    }

    // Fallback based on title keywords
    if (title.includes('psychiatrique') || title.includes('psychotique') || title.includes('schizophrén')) {
      return "/images/patient_psychiatrique.png";
    } else if (title.includes('choc') || title.includes('âgé') || title.includes('personne âgée') || title.includes('médecine interne')) {
      return "/images/patient_age_choc.png";
    } else if (title.includes('thoracique')) {
      return "/images/douleur_thoracique.png";
    } else if (title.includes('poignet') || title.includes('trauma')) {
      return "/images/trauma_poignet.png";
    }

    return "/images/cahier.png";
  };

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-4 md:py-6">
      {/* Session Header */}
      <Card className="mb-6 border-2 border-blue-500">
        <CardHeader>
          <div className="flex justify-between items-start gap-4">
            <div className="flex gap-4 flex-1 min-w-0">
              {/* Patient Image */}
              <div className="flex-shrink-0">
                <img
                  src={getScenarioImage()}
                  alt={session?.scenario?.title || "Patient"}
                  className="w-20 h-20 md:w-24 md:h-24 object-cover rounded-lg border-2 border-gray-200"
                />
              </div>

              {/* Scenario Info */}
              <div className="flex-1 min-w-0">
                <CardTitle className="text-xl">{session?.scenario?.title}</CardTitle>
                <p className="text-gray-600 mt-1 break-words">{session?.scenario?.description}</p>
              </div>
            </div>

            {/* Timer and Actions */}
            <div className="flex items-center space-x-4 flex-shrink-0">
              <Badge
                variant="outline"
                className={`flex items-center space-x-1 ${remainingTime <= 60 ? 'bg-red-50 text-red-700 border-red-200' : ''}`}
              >
                <Clock className="w-4 h-4" />
                <span>{formatTime(remainingTime)}</span>
              </Badge>
              <Button
                onClick={handleEndSession}
                disabled={endSessionMutation.isPending}
              >
                {endSessionMutation.isPending ? 'Fermeture...' : 'Terminer la Session'}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Clickable Image - ONLY for Scenario ID 1 (Douleur de l'oreille chez l'Enfant) */}
      {session?.scenarioId === 1 && (
        <Card className="mb-6 cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setShowImagePopup(true)}>
          <CardContent className="p-4">
            <div className="text-center mb-2">
              <p className="text-sm text-gray-600">Cliquez pour agrandir l'image de l'otite</p>
            </div>
            <img
              src="/images/otite_detail.png"
              alt="Image de l'otite"
              className="w-full h-auto rounded-lg"
            />
          </CardContent>
        </Card>
      )}

      {/* Chat Interface */}
      <Card className="flex flex-col border-2 border-blue-500 h-[60vh] md:h-[70vh] lg:h-[75vh] overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <span>Simulation Patient</span>
          </CardTitle>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col min-h-0">
          {/* Messages Area */}
          <div ref={messagesContainerRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden space-y-4 mb-4 p-3 md:p-4 bg-gray-50 rounded-lg">
            {messages.length === 0 && (
              <div className="text-center text-gray-500 py-8">
                
                <p>Bonjour, je suis votre patient pour cet examen.</p>
                <p className="text-sm">Commencez votre consultation en me posant des questions.</p>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`min-w-0 max-w-full sm:max-w-[85%] md:max-w-[75%] p-3 rounded-lg break-words ${
                    message.role === 'user'
                      ? 'bg-blue-500 text-white'
                      : 'bg-white border border-gray-200'
                  }`}
                >
                  <div className="flex items-center space-x-2 mb-1">
                    {message.role === 'user' ? (
                      <User className="w-4 h-4" />
                    ) : (
                      <Bot className="w-4 h-4" />
                    )}
                    <span className="text-xs opacity-75">
                      {message.role === 'user' ? 'Vous' : 'Patient'}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap break-words break-all">{message.content}</p>
                </div>
              </div>
            ))}

            <LoadingIndicator
              isLoading={sendMessageMutation.isPending}
              message="Le patient réfléchit…"
              showQueueStatus={true}
            />
            {sendMessageMutation.isError &&
              /"code"\s*:\s*"AI_PATIENT_EMPTY_RESPONSE"/.test(sendMessageMutation.error?.message ?? '') && (
                <p role="alert" className="mt-2 text-sm text-destructive">
                  Le patient n’a renvoyé aucun texte. Votre question est conservée : vous pouvez la reformuler ou réessayer.
                </p>
              )}
            {sendMessageMutation.isError &&
              /"code"\s*:\s*"(?:PATIENT_RESPONSE_REJECTED|PATIENT_HISTORY_UNAVAILABLE|PATIENT_SCENARIO_UNAVAILABLE|PATIENT_PROVIDER_UNAVAILABLE|PATIENT_SESSION_NOT_FOUND|PATIENT_SCENARIO_MISMATCH|AI_PATIENT_SIMULATOR_FAILED)"/.test(sendMessageMutation.error?.message ?? '') && (
                <p role="alert" className="mt-2 text-sm text-destructive">
                  Impossible d’afficher la réponse du patient pour le moment. Vous pouvez réessayer sans ressaisir votre question.
                </p>
              )}
            {isPatientWaiting && (
              <div className="text-sm text-primary animate-pulse flex items-center justify-center mt-2">
                <span className="material-icons text-sm mr-1">hourglass_empty</span>
                Le patient vous attend...
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="flex space-x-2 min-w-0">
            <Textarea
              value={currentQuery}
              onChange={(e) => setCurrentQuery(e.target.value)}
              placeholder="Posez votre question au patient..."
              className="flex-1 border-2 border-blue-500 resize-none"
              rows={2}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
            />
            <button
              type="button"
              onClick={() => {
                if (!navigator.mediaDevices?.getUserMedia) {
                  alert('L\'accès au microphone n\'est pas supporté sur ce navigateur.');
                  return;
                }

                unlockAudio();
                setVoiceEnabled((v) => {
                  const next = !v;
                  if (!next) interruptAudioPlayback();
                  return next;
                });
              }}
              className={`p-2 rounded-full transition-colors ${voiceEnabled ? 'bg-primary/20 text-primary' : 'bg-neutral-100 text-neutral-700 hover:bg-primary/20'}`}
              title="Activer le micro"
            >
              <span className="material-icons">mic</span>
            </button>
            <Button
              onClick={handleSendMessage}
              disabled={!currentQuery.trim() || sendMessageMutation.isPending}
              className="self-end"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>

                  </CardContent>
      </Card>

      {/* Image Popup - Enlarged view */}
      <Dialog open={showImagePopup} onOpenChange={setShowImagePopup}>
        <DialogContent className="max-w-5xl w-full p-0 overflow-hidden">
          <DialogTitle className="sr-only">Image agrandie de l'otite</DialogTitle>
          <div className="relative">
            <button
              onClick={() => setShowImagePopup(false)}
              className="absolute top-4 right-4 z-10 bg-white rounded-full p-2 shadow-lg hover:bg-gray-100 transition-colors"
              aria-label="Fermer"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src="/images/otite_detail.png"
              alt="Image agrandie de l'otite"
              className="w-full h-auto"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
