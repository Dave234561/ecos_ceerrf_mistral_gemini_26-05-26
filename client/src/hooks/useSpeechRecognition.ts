import { useEffect, useRef, useState } from 'react';

export function useSpeechRecognition({ enabled, onResult, lang = 'fr-FR' }: {
  enabled: boolean;
  onResult: (text: string) => void;
  lang?: string;
}) {
  const recognitionRef = useRef<any>(null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      setListening(false);
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = false;
    recognitionRef.current = recognition;

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          onResult(event.results[i][0].transcript.trim());
        }
      }
    };

    recognition.onerror = (event: any) => {
      setError(event.error);
      setListening(false);
    };
    recognition.onend = () => {
      setListening(false);
      if (enabled) recognition.start(); // relance automatique
    };
    if (enabled) {
      recognition.start();
      setListening(true);
    }
    return () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.stop();
      setListening(false);
    };
    // eslint-disable-next-line
  }, [enabled, lang]);

  return { listening, error };
}
