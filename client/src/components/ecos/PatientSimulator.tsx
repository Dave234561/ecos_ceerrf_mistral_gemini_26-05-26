import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Clock, Send, User, Bot, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { getScenarioIdWithFallback, debugSessionData } from "@/utils/sessionUtils";
import LoadingIndicator from "./LoadingIndicator";

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

  const decodeBase64ToInt16 = (b64: string): Int16Array => {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Int16Array(bytes.buffer);
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

  const playPcm16 = async (pcm16: Int16Array, sampleRate = 24000) => {
    if (!pcm16.length) return;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate,
      });
      nextPlayTimeRef.current = audioCtxRef.current.currentTime;
    }

    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch {}
    }

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
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/api/voice/webrtc`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    pcRef.current = pc;

    const dc = pc.createDataChannel('voice');
    dcRef.current = dc;

    dc.onmessage = async (ev) => {
      if (typeof ev.data !== 'string') return;
      let msg: any;
      try { msg = JSON.parse(ev.data); } catch { return; }

      if (msg.type === 'audio' && typeof msg.data === 'string') {
        const pcm16 = decodeBase64ToInt16(msg.data);
        await playPcm16(pcm16, 24000);
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

      if (msg.type === 'answer' && msg.answer) {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.answer));
      }
      if (msg.type === 'ice' && msg.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
        } catch {}
      }
    };

    ws.onopen = async () => {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      ws.send(JSON.stringify({ type: 'offer', offer }));
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

    ws.onerror = cleanup;
    ws.onclose = cleanup;

    return cleanup;
  }, [sessionId]);

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
    utter.rate = 1.0;
    utter.pitch = 1.0;
    try { window.speechSynthesis.speak(utter); } catch {}
    return () => {
      try { window.speechSynthesis.cancel(); } catch {}
    };
  }, [messages]);

  // Fetch session details
  const { data: session } = useQuery({
    queryKey: ['ecos-session', sessionId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/ecos/sessions/${sessionId}?email=${email}`);
      return response.session;
    }
  });

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
        scenarioId: resolvedScenarioId
      });
      
      return apiRequest('POST', '/api/ecos/patient-simulator', {
        email,
        sessionId,
        query,
        scenarioId: resolvedScenarioId
      });
    },
    onSuccess: (data) => {
      // Add user message
      const userMessage: Message = {
        id: Date.now().toString() + '-user',
        role: 'user',
        content: currentQuery,
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
                if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
                  alert('La reconnaissance vocale n\'est pas supportée sur ce navigateur.');
                  return;
                }
                // @ts-ignore
                const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                const recognition = new SpeechRecognition();
                recognition.lang = 'fr-FR';
                recognition.interimResults = false;
                recognition.maxAlternatives = 1;
                recognition.onresult = (event) => {
                  const transcript = event.results[0][0].transcript;
                  setCurrentQuery(transcript);
                };
                recognition.onerror = () => {};
                recognition.onend = () => {};
                recognition.start();
              }}
              className="p-2 rounded-full bg-neutral-100 text-neutral-700 hover:bg-primary/20 transition-colors"
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