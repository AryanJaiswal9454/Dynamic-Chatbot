import { useCallback, useEffect, useRef, useState } from 'react';

const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export const speechSupported = Boolean(SR);

/** Speech-to-text using the browser's built-in recognizer (no extra cost, no API key). */
export function useSpeechInput(lang, onFinal) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const recRef = useRef(null);
  const finalRef = useRef(onFinal);
  finalRef.current = onFinal;

  const stop = useCallback(() => recRef.current?.stop(), []);

  const start = useCallback(() => {
    if (!SR) return;
    setError('');
    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      let finalText = '';
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interimText += t;
      }
      setInterim(interimText);
      if (finalText.trim()) finalRef.current(finalText.trim());
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed') setError('Microphone access is blocked. Allow it in your browser settings.');
      else if (e.error === 'no-speech') setError("I didn't catch that. Tap the mic and try again.");
      else if (e.error !== 'aborted') setError('Voice input failed. Please type your message instead.');
    };
    rec.onend = () => { setListening(false); setInterim(''); };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, [lang]);

  useEffect(() => () => recRef.current?.abort(), []);

  return { supported: Boolean(SR), listening, interim, error, start, stop };
}

export function speakText(text, lang) {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  window.speechSynthesis.speak(u);
}
