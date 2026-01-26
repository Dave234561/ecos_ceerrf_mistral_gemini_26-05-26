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
    recognition.interimResults = true; // Enabled interim results for faster feedback
    recognitionRef.current = recognition;

    console.log('🎙️ Speech recognition starting...');

    recognition.onstart = () => {
      console.log('🎙️ Speech recognition started');
      setListening(true);
    };

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          console.log('🎙️ Final transcript:', transcript);
          onResult(transcript.trim());
        } else {
          interimTranscript += transcript;
        }
      }
      if (interimTranscript) {
        // Optional: show interim results in UI if needed
        // console.log('🎙️ Interim transcript:', interimTranscript);
      }
    };

    recognition.onerror = (event: any) => {
      console.error('🎙️ Speech recognition error:', event.error);
      setError(event.error);
      // Don't setListening(false) here if it's going to restart
    };

    recognition.onend = () => {
      console.log('🎙️ Speech recognition ended');
      setListening(false);
      if (enabled) {
        console.log('🎙️ Attempting automatic restart...');
        try {
          recognition.start();
        } catch (e) {
          console.error('🎙️ Failed to restart speech recognition:', e);
        }
      }
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
