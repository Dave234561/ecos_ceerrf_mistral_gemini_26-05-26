import { useRef, useEffect } from "react";
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useWebRTCAudio } from '@/hooks/useWebRTCAudio';
import { UserStatus, ChatExchange } from "@/lib/api";
import ChatMessage from "./ChatMessage";

interface ChatAreaProps {
  messages: ChatExchange[];
  isTyping: boolean;
  onSendQuestion: (question: string) => void;
  userStatus?: UserStatus;
  isLoading: boolean;
  enableVoice?: boolean;
}

import { useState } from "react";

export default function ChatArea({ 
  messages, 
  isTyping, 
  onSendQuestion,
  userStatus,
  isLoading,
  enableVoice = false
}: ChatAreaProps) {
  // WebRTC audio: roomId = 'chat-global' (ou à personnaliser selon besoin)
  const { connected: audioConnected } = useWebRTCAudio({ roomId: 'chat-global', enabled: enableVoice });
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState("");

  // Reconnaissance vocale continue pour interruption automatique
  useSpeechRecognition({
    enabled: enableVoice,
    onResult: (text: string) => {
      // Interrompre la synthèse vocale
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try { window.speechSynthesis.cancel(); } catch {}
      }
      // TODO: envoyer un signal d'interruption au backend si possible
      // Envoyer la nouvelle question automatiquement
      if (text.trim()) onSendQuestion(text);
    },
    lang: 'fr-FR',
  });

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  // Synthèse vocale automatique de la réponse IA
  useEffect(() => {
    if (!enableVoice || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (!messages || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (!last?.response || isTyping) return;
    try { window.speechSynthesis.cancel(); } catch {}
    const utter = new window.SpeechSynthesisUtterance(last.response);
    utter.lang = 'fr-FR';
    utter.rate = 1.0;
    utter.pitch = 1.0;
    try { window.speechSynthesis.speak(utter); } catch {}
    return () => {
      try { window.speechSynthesis.cancel(); } catch {}
    };
  }, [messages, isTyping, enableVoice]);

  return (
    <div className="flex-grow flex flex-col bg-neutral-50 p-4 md:p-6">
      {/* Messages container */}
      {enableVoice && (
        <div className="mb-2 flex items-center text-xs text-gray-500">
          <span className={audioConnected ? 'text-green-600' : 'text-red-600'}>
            ●
          </span>
          <span className="ml-2">
            Audio {audioConnected ? 'connecté' : 'déconnecté'}
          </span>
        </div>
      )}
      <div 
        ref={messagesContainerRef}
        className="flex-grow overflow-y-auto custom-scrollbar mb-4 space-y-6"
      >
        {/* Welcome message */}
        {!isLoading && (
          <div className="chat-bubble bg-white rounded-xl p-4 shadow-card message-transition">
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 rounded-full bg-primary flex-shrink-0 flex items-center justify-center">
                <span className="material-icons text-white text-sm">smart_toy</span>
              </div>
              <div>
                <p className="text-neutral-600">
                  Bonjour ! Je suis votre assistant de cours. Je peux répondre à vos questions sur le contenu de vos cours. N'hésitez pas à me demander de l'aide.
                </p>
                <p className="mt-2 text-neutral-400 text-sm">
                  Vous avez droit à 20 questions par jour.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Loading indicator for initial load */}
        {isLoading && (
          <div className="flex justify-center items-center h-32">
            <div className="w-8 h-8 border-t-4 border-primary border-solid rounded-full animate-spin"></div>
          </div>
        )}
        
        {/* Message history */}
        {!isLoading && messages.map((message) => (
          <ChatMessage
            key={message.id}
            question={message.question}
            response={message.response}
            timestamp={new Date(message.timestamp)}
          />
        ))}
        
        {/* Typing indicator */}
        {isTyping && (
          <div className="chat-bubble bg-white rounded-xl p-4 shadow-card message-transition animate-fade-in">
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 rounded-full bg-primary flex-shrink-0 flex items-center justify-center">
                <span className="material-icons text-white text-sm">smart_toy</span>
              </div>
              <div className="pt-2">
                <div className="flex items-center space-x-1">
                  <span className="text-sm text-neutral-500 mr-2">L'assistant rédige</span>
                  <div className="typing-indicator">
                    <span className="typing-dot"></span>
                    <span className="typing-dot"></span>
                    <span className="typing-dot"></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Input area */}
      <form className="flex items-center space-x-2" onSubmit={e => {
        e.preventDefault();
        if (inputValue.trim() && !(isTyping || (userStatus?.limitReached ?? false))) {
          onSendQuestion(inputValue);
          setInputValue("");
        }
      }}>
        <input
          type="text"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          placeholder="Posez votre question sur le contenu du cours..."
          className="flex-grow px-4 py-3 text-neutral-700 bg-transparent border-none focus:outline-none"
          disabled={isTyping || (userStatus?.limitReached ?? false)}
        />
        <button
          type="submit"
          disabled={!inputValue.trim() || isTyping || (userStatus?.limitReached ?? false)}
          className="p-2 rounded-full bg-primary text-white hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="material-icons">send</span>
        </button>
      </form>
    </div>
  );
}

// CSS utility classes for chat area
const styles = `
  .chat-bubble {
    max-width: 75%;
  }
  .typing-indicator {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .typing-dot {
    height: 6px;
    width: 6px;
    background: #6b7280;
    border-radius: 50%;
    display: inline-block;
    animation: typing-bounce 1.4s infinite ease-in-out;
  }
  .typing-dot:nth-child(1) {
    animation-delay: 0s;
  }
  .typing-dot:nth-child(2) {
    animation-delay: 0.2s;
  }
  .typing-dot:nth-child(3) {
    animation-delay: 0.4s;
  }
  @keyframes typing-bounce {
    0%, 60%, 100% {
      transform: translateY(0);
      opacity: 0.4;
    }
    30% {
      transform: translateY(-8px);
      opacity: 1;
    }
  }
  .animate-fade-in {
    animation: fade-in 0.3s ease-in;
  }
  @keyframes fade-in {
    0% {
      opacity: 0;
      transform: translateY(10px);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }
  .message-transition {
    transition: all 0.3s ease;
  }
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: #f1f1f1;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: #c1c1c1;
    border-radius: 10px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: #a1a1a1;
  }
`;
