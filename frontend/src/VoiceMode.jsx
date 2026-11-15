import { useCallback, useEffect, useRef, useState } from 'react';

const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

const cleanForSpeech = (t) => t.replace(/[*_`#>~]/g, '').replace(/\s+/g, ' ').trim();

// Browsers cut off long utterances, so speak in short sentence-sized chunks.
function chunkText(text) {
  const sentences = text.match(/[^.!?।\n]+[.!?।]*\s*/g) || [text];
  const chunks = [];
  let cur = '';
  for (const s of sentences) {
    if ((cur + s).length > 180 && cur) { chunks.push(cur); cur = s; } else cur += s;
  }
  if (cur.trim()) chunks.push(cur);
  return chunks;
}

function pickVoice(lang) {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  const l = lang.toLowerCase();
  return voices.find((v) => v.lang.toLowerCase() === l) || voices.find((v) => v.lang.toLowerCase().startsWith(l.slice(0, 2)));
}

const STATUS = {
  idle: 'Paused. Tap the circle to talk.',
  listening: 'Listening… speak now',
  thinking: 'Thinking…',
  speaking: 'Speaking… tap to interrupt',
};

/** Hands-free conversation: listen, send, speak the reply, then listen again. */
export default function VoiceMode({ cfg, lang, langs, onLang, ask, onClose }) {
  const [phase, setPhase] = useState('idle');
  const [heard, setHeard] = useState('');
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');

  const phaseRef = useRef('idle');
  const aliveRef = useRef(true);
  const pausedRef = useRef(false);
  const recRef = useRef(null);
  const tokenRef = useRef(0);
  const silentRef = useRef(0);
  const langRef = useRef(lang);
  const askRef = useRef(ask);
  langRef.current = lang;
  askRef.current = ask;

  const go = (p) => { phaseRef.current = p; setPhase(p); };

  const listen = useCallback(() => {
    if (!aliveRef.current || pausedRef.current) return;
    if (!SR) { setError('Voice input is not supported in this browser. Please use Chrome or Edge.'); return; }
    try { recRef.current?.abort(); } catch { /* old recognizer already stopped */ }

    const rec = new SR();
    rec.lang = langRef.current;
    rec.interimResults = true;
    rec.continuous = false;
    let gotFinal = false;

    rec.onstart = () => go('listening');
    rec.onresult = (e) => {
      if (gotFinal) return;
      let fin = '';
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) fin += t; else interim += t;
      }
      setHeard(fin || interim);
      if (fin.trim()) { gotFinal = true; handle(fin.trim()); }
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        pausedRef.current = true;
        go('idle');
        setError('Microphone access is blocked. Allow it in your browser settings, then tap the circle.');
      }
    };
    rec.onend = () => {
      if (recRef.current !== rec || gotFinal || !aliveRef.current) return;
      if (phaseRef.current !== 'listening') return;
      silentRef.current += 1;
      if (silentRef.current >= 4) {
        pausedRef.current = true;
        go('idle');
      } else {
        setTimeout(listen, 250);
      }
    };

    recRef.current = rec;
    try { rec.start(); } catch { /* start() can throw if already running */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const speak = (text) => {
    const token = ++tokenRef.current;
    const synth = window.speechSynthesis;
    const chunks = chunkText(cleanForSpeech(text));
    if (!synth || chunks.length === 0) { listen(); return; }
    go('speaking');
    const voice = pickVoice(langRef.current);
    let i = 0;
    const next = () => {
      if (token !== tokenRef.current || !aliveRef.current) return;
      if (i >= chunks.length) { listen(); return; }
      const u = new SpeechSynthesisUtterance(chunks[i++]);
      u.lang = langRef.current;
      if (voice) u.voice = voice;
      u.onend = next;
      u.onerror = next;
      synth.speak(u);
    };
    synth.cancel();
    next();
  };

  const handle = async (text) => {
    silentRef.current = 0;
    setError('');
    setReply('');
    go('thinking');
    const res = await askRef.current(text);
    if (!aliveRef.current) return;
    if (!res) { listen(); return; }
    setReply(res.text);
    speak(res.text);
  };

  const onOrb = () => {
    const p = phaseRef.current;
    if (p === 'speaking') {
      tokenRef.current += 1;
      window.speechSynthesis?.cancel();
      listen();
    } else if (p === 'listening') {
      pausedRef.current = true;
      go('idle');
      try { recRef.current?.abort(); } catch { /* ignore */ }
    } else if (p === 'idle') {
      pausedRef.current = false;
      silentRef.current = 0;
      setError('');
      listen();
    }
  };

  const changeLang = (e) => {
    onLang(e.target.value);
    langRef.current = e.target.value;
    if (phaseRef.current === 'listening') listen();
  };

  useEffect(() => {
    aliveRef.current = true;
    pausedRef.current = false;
    window.speechSynthesis?.cancel();
    listen();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      aliveRef.current = false;
      tokenRef.current += 1;
      window.removeEventListener('keydown', onKey);
      window.speechSynthesis?.cancel();
      try { recRef.current?.abort(); } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const label = { idle: 'Start talking', listening: 'Pause listening', thinking: 'Thinking', speaking: 'Interrupt and speak' }[phase];

  return (
    <div className="vm" role="dialog" aria-modal="true" aria-label="Conversation mode">
      <div className="vm-top">
        <strong>{cfg.bot_name}</strong>
        <select value={lang} onChange={changeLang} aria-label="Voice language">
          {langs.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
      </div>

      <div className="vm-center">
        <button className={`orb ${phase}`} onClick={onOrb} aria-label={label} disabled={phase === 'thinking'}>
          <span className="orb-bars" aria-hidden="true"><i /><i /><i /><i /><i /></span>
        </button>
        <p className="vm-status" aria-live="polite">{STATUS[phase]}</p>
        {error && <p className="vm-error" role="alert">{error}</p>}
      </div>

      <div className="vm-captions">
        {heard && <p className="cap you"><span>You</span>{heard}</p>}
        {reply && <p className="cap bot"><span>{cfg.bot_name}</span>{reply}</p>}
      </div>

      <button className="vm-end" onClick={onClose}>End conversation</button>
    </div>
  );
}
