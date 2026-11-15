import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from './api';
import { speakText, useSpeechInput } from './useSpeech';
import ModelPicker from './ModelPicker.jsx';
import VoiceMode from './VoiceMode.jsx';

const LANGS = [
  { code: 'en-IN', label: 'English (India)' },
  { code: 'hi-IN', label: 'हिन्दी' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
];

const STARTERS = [
  'What can you help me with?',
  'Explain something to me in simple words',
  'Help me write a polite message',
  'Give me a quick study plan',
];

function greeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 17) return 'Good afternoon';
  if (h >= 17 && h < 21) return 'Good evening';
  return 'Hello';
}

/** Reveals a new reply progressively so it feels like the bot is typing it out. */
function Typed({ text, animate, onTick }) {
  const [n, setN] = useState(animate ? 0 : text.length);
  useEffect(() => {
    if (!animate) return undefined;
    let i = 0;
    const step = Math.max(2, Math.ceil(text.length / 150));
    const id = setInterval(() => {
      i = Math.min(text.length, i + step);
      setN(i);
      onTick?.();
      if (i >= text.length) clearInterval(id);
    }, 20);
    return () => clearInterval(id);
  }, [text, animate, onTick]);
  return <>{text.slice(0, n)}</>;
}

function CopyButton({ text }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch { /* clipboard unavailable */ }
  };
  return <button onClick={copy} aria-label="Copy reply" className="copy">{done ? 'Copied' : 'Copy'}</button>;
}

export default function Chat({ cfg, user, convId, onConversation, models = [], currentModel = null, onModelChange = async () => {} }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lang, setLang] = useState(localStorage.getItem('voiceLang') || 'en-IN');
  const [speak, setSpeak] = useState(localStorage.getItem('speakReplies') === '1');
  const [voiceOpen, setVoiceOpen] = useState(false);

  const skipLoad = useRef(null);
  const sendingRef = useRef(false);
  const speakRef = useRef(speak);
  const langRef = useRef(lang);
  const sendRef = useRef(async () => null);
  const endRef = useRef(null);
  const taRef = useRef(null);

  speakRef.current = speak;
  langRef.current = lang;

  useEffect(() => {
    if (convId && skipLoad.current === convId) { skipLoad.current = null; return undefined; }
    setError('');
    if (!convId) { setMessages([]); return undefined; }
    let cancelled = false;
    setLoading(true);
    api.getConversation(convId)
      .then((c) => { if (!cancelled) setMessages(c.messages); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [convId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, sending]);
  const tick = useCallback(() => endRef.current?.scrollIntoView({ block: 'end' }), []);

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  // Returns { text, failed } so Conversation mode can speak the answer.
  const send = async (raw, opts = {}) => {
    const text = raw.trim();
    if (!text || sendingRef.current) return null;
    sendingRef.current = true;
    setSending(true);
    setError('');
    setInput('');
    window.speechSynthesis?.cancel();
    const tempId = `tmp-${Date.now()}`;
    setMessages((m) => [...m, { id: tempId, role: 'user', content: text }]);
    let result;
    try {
      let id = convId;
      if (!id) {
        const conv = await api.createConversation();
        id = conv.id;
        skipLoad.current = id;
        onConversation(conv);
      }
      const res = await api.sendMessage(id, text);
      const bot = res.assistant_message;
      setMessages((m) => [...m.filter((x) => x.id !== tempId), res.user_message, { ...bot, fresh: !opts.voice }]);
      onConversation(res.conversation);
      result = { text: bot.content, failed: bot.is_fallback };
      if (!opts.voice && speakRef.current && !bot.is_fallback) speakText(bot.content, langRef.current);
    } catch (e) {
      setMessages((m) => m.filter((x) => x.id !== tempId));
      if (!opts.voice) setInput(text);
      setError(e.status === 429 ? 'You are sending messages too quickly. Wait a few seconds and try again.' : e.message);
      result = { text: 'Sorry, something went wrong. Please try again.', failed: true };
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
    return result;
  };
  sendRef.current = send;

  const voice = useSpeechInput(lang, useCallback((text) => { sendRef.current(text); }, []));
  const toggleMic = () => (voice.listening ? voice.stop() : (window.speechSynthesis?.cancel(), voice.start()));

  const rate = async (msg, value) => {
    const next = msg.feedback === value ? 0 : value;
    setMessages((m) => m.map((x) => (x.id === msg.id ? { ...x, feedback: next } : x)));
    try { await api.sendFeedback(msg.id, next); } catch { /* keep UI optimistic */ }
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  const setLangValue = (v) => { setLang(v); localStorage.setItem('voiceLang', v); };
  const toggleSpeak = () => {
    const next = !speak;
    setSpeak(next);
    localStorage.setItem('speakReplies', next ? '1' : '0');
    if (!next) window.speechSynthesis?.cancel();
  };

  const openVoice = () => { if (voice.listening) voice.stop(); setVoiceOpen(true); };

  const showVoice = cfg.voice_enabled && voice.supported;
  const empty = messages.length === 0 && !loading;

  return (
    <div className="chat">
      <div className="feed" role="log" aria-live="polite">
        <div className="feed-inner">
          {empty && (
            <div className="welcome">
              <span className="welcome-orb" aria-hidden="true" />
              <h2>{greeting()}{user.first_name || user.username ? `, ${user.first_name || user.username}` : ''}.</h2>
              <p>{cfg.welcome_message}</p>
              <div className="chips">
                {STARTERS.map((s) => (
                  <button key={s} className="chip" onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}
          {loading && <p className="muted center">Loading chat…</p>}

          {messages.map((m) => (
            <div key={m.id} className={`msg ${m.role}`}>
              <div className="bubble">
                {m.role === 'assistant' ? <Typed text={m.content} animate={Boolean(m.fresh)} onTick={tick} /> : m.content}
              </div>
              {m.role === 'assistant' && !m.is_fallback && (
                <div className="rate">
                  <CopyButton text={m.content} />
                  <button className={m.feedback === 1 ? 'on' : ''} onClick={() => rate(m, 1)} aria-label="Helpful" aria-pressed={m.feedback === 1}>👍</button>
                  <button className={m.feedback === -1 ? 'on' : ''} onClick={() => rate(m, -1)} aria-label="Not helpful" aria-pressed={m.feedback === -1}>👎</button>
                </div>
              )}
            </div>
          ))}

          {sending && (
            <div className="msg assistant">
              <div className="bubble typing" aria-label={`${cfg.bot_name} is typing`}><i /><i /><i /></div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <div className="composer-wrap">
        {error && <p className="error" role="alert">{error}</p>}
        {voice.error && <p className="error" role="alert">{voice.error}</p>}

        <div className={`composer ${voice.listening ? 'listening' : ''}`}>
          <textarea
            ref={taRef}
            rows={1}
            value={voice.listening && voice.interim ? voice.interim : input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder={voice.listening ? 'Listening… speak now' : `Message ${cfg.bot_name}`}
            readOnly={voice.listening}
            maxLength={4000}
            aria-label="Your message"
          />
          {showVoice && (
            <>
              <button className="talk" onClick={openVoice} aria-label="Start conversation mode" title="Talk with me hands-free" type="button">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
                  <rect x="3" y="10" width="2.6" height="4" rx="1.3" /><rect x="7.6" y="6" width="2.6" height="12" rx="1.3" />
                  <rect x="12.2" y="3" width="2.6" height="18" rx="1.3" /><rect x="16.8" y="7" width="2.6" height="10" rx="1.3" />
                  <rect x="21" y="10" width="0" height="4" />
                </svg>
              </button>
              <button
                className={`mic ${voice.listening ? 'on' : ''}`}
                onClick={toggleMic}
                aria-label={voice.listening ? 'Stop listening' : 'Dictate a message'}
                aria-pressed={voice.listening}
                title="Dictate"
                type="button"
              >
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
                  <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" />
                </svg>
              </button>
            </>
          )}
          <button className="send" onClick={() => send(input)} disabled={sending || !input.trim()} type="button">Send</button>
        </div>

        <div className="composer-foot">
          <ModelPicker models={models} current={currentModel} onSelect={onModelChange} />
          {showVoice && (
          <div className="voice-opts">
            <label>Voice language
              <select value={lang} onChange={(e) => setLangValue(e.target.value)}>
                {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={speak} onChange={toggleSpeak} /> Read replies aloud
            </label>
          </div>
          )}
        </div>
      </div>

      {voiceOpen && (
        <VoiceMode
          cfg={cfg}
          lang={lang}
          langs={LANGS}
          onLang={setLangValue}
          ask={(t) => sendRef.current(t, { voice: true })}
          onClose={() => setVoiceOpen(false)}
        />
      )}
    </div>
  );
}