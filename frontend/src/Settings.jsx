import { useEffect, useMemo, useState } from 'react';
import * as api from './api';
import { Tags } from './ModelPicker.jsx';

const LANGS = [
  { code: 'en-IN', label: 'English (India)' },
  { code: 'hi-IN', label: 'हिन्दी' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
];

const SWATCHES = ['#6C5CE7', '#0E7C66', '#2D7FF9', '#E4572E', '#D6409F', '#F2A900'];

const TONE_HINT = {
  '': 'The standard style set for this assistant.',
  friendly: 'Warm and approachable.',
  professional: 'Polished and to the point.',
  casual: 'Relaxed, like chatting with a friend.',
  playful: 'Light, with a touch of humour.',
  teacher: 'Explains step by step in simple words.',
};
const LENGTH_HINT = {
  '': 'Standard reply length.',
  short: 'One to three sentences.',
  balanced: 'A moderate amount of detail.',
  detailed: 'Thorough, well organised answers.',
};
const CREATIVITY_HINT = {
  '': 'Standard balance.',
  precise: 'Sticks to facts. Best for study and work.',
  balanced: 'A mix of accuracy and variety.',
  creative: 'More imaginative and varied replies.',
};

function Segmented({ label, value, options, hints, onChange }) {
  return (
    <div className="set-group">
      <div className="set-label" id={`seg-${label}`}>{label}</div>
      <div className="set-seg" role="radiogroup" aria-labelledby={`seg-${label}`}>
        {options.map((o) => (
          <button
            key={o.value || 'default'}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className={value === o.value ? 'on' : ''}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="set-hint">{hints[value] || ''}</p>
    </div>
  );
}

export default function Settings({ data, error: loadError, onRetry, onSaved }) {
  const [form, setForm] = useState(null);
  const [voice, setVoice] = useState({
    lang: localStorage.getItem('voiceLang') || 'en-IN',
    speak: localStorage.getItem('speakReplies') === '1',
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { if (data && !form) setForm(data.preferences); }, [data, form]);

  const dirty = useMemo(() => {
    if (!data || !form) return false;
    const voiceChanged =
      voice.lang !== (localStorage.getItem('voiceLang') || 'en-IN') ||
      voice.speak !== (localStorage.getItem('speakReplies') === '1');
    return JSON.stringify(form) !== JSON.stringify(data.preferences) || voiceChanged;
  }, [data, form, voice]);

  if (!data || !form) {
    return (
      <div className="settings">
        {loadError ? (
          <div className="set-card">
            <h2>Could not load your settings</h2>
            <p className="error" role="alert">{loadError}</p>
            <button type="button" className="ghost" onClick={onRetry}>Try again</button>
          </div>
        ) : (
          <p className="muted">Loading settings…</p>
        )}
      </div>
    );
  }

  const { options } = data;
  const set = (k) => (v) => { setForm({ ...form, [k]: v }); setStatus(''); };
  const accent = form.accent_color || options.default_color;
  const shownName = form.assistant_name || options.default_bot_name;

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await api.updatePreferences(form);
      localStorage.setItem('voiceLang', voice.lang);
      localStorage.setItem('speakReplies', voice.speak ? '1' : '0');
      onSaved(res);
      setForm(res.preferences);
      setStatus('Saved');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!window.confirm('Reset all your bot settings to the defaults?')) return;
    setSaving(true);
    setError('');
    try {
      const res = await api.resetPreferences();
      onSaved(res);
      setForm(res.preferences);
      setStatus('Reset to defaults');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings">
      <header className="set-head">
        <h1>Bot settings</h1>
        <p>Make {shownName} yours. These choices apply to your own chats only.</p>
      </header>

      <section className="set-card current">
        <div>
          <span className="set-k">Model in use</span>
          <strong className="set-v">{data.current_model?.label || 'Not set up'}</strong>
        </div>
        <div>
          <span className="set-k">Provider</span>
          <strong className="set-v">{data.current_model?.provider_label || 'None'}</strong>
        </div>
        <div>
          <span className="set-k">Default model</span>
          <strong className="set-v">{options.default_model?.label || 'None'}</strong>
        </div>
      </section>

      <section className="set-card">
        <h2>Look and name</h2>
        <div className="set-group">
          <label className="set-label" htmlFor="aname">Assistant name</label>
          <input id="aname" className="set-input" maxLength={40} value={form.assistant_name} placeholder={options.default_bot_name} onChange={(e) => set('assistant_name')(e.target.value)} />
        </div>
        <div className="set-group">
          <div className="set-label">Accent color</div>
          <div className="swatches">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch ${accent.toLowerCase() === c.toLowerCase() ? 'on' : ''}`}
                style={{ background: c }}
                aria-label={`Use color ${c}`}
                onClick={() => set('accent_color')(c)}
              />
            ))}
            <label className="swatch custom" title="Pick any color">
              <input type="color" value={accent} onChange={(e) => set('accent_color')(e.target.value.toUpperCase())} aria-label="Pick a custom color" />
            </label>
            {form.accent_color && <button type="button" className="link small" onClick={() => set('accent_color')('')}>Use default</button>}
          </div>
        </div>
        <div className="preview" aria-label="Preview">
          <div className="pv you" style={{ background: accent }}>How do I stay focused while studying?</div>
          <div className="pv bot"><b>{shownName}</b>Try short sessions with breaks in between, and keep your phone out of reach.</div>
        </div>
      </section>

      <section className="set-card">
        <h2>Personality</h2>
        <Segmented label="Tone" value={form.tone} options={options.tones} hints={TONE_HINT} onChange={set('tone')} />
        <Segmented label="Reply length" value={form.reply_length} options={options.lengths} hints={LENGTH_HINT} onChange={set('reply_length')} />
        <Segmented label="Creativity" value={form.creativity} options={options.creativity} hints={CREATIVITY_HINT} onChange={set('creativity')} />
      </section>

      <section className="set-card">
        <h2>Your instructions</h2>
        <p className="set-hint top">Tell the bot about you or how to answer. For example: "I am in class 12. Explain with simple examples."</p>
        <textarea className="set-input area" rows={4} maxLength={1000} value={form.custom_instructions} onChange={(e) => set('custom_instructions')(e.target.value)} placeholder="Write anything you want the bot to remember about how to talk to you." aria-label="Your instructions" />
        <div className="set-count">{form.custom_instructions.length} / 1000</div>
      </section>

      <section className="set-card">
        <h2>AI model</h2>
        <p className="set-hint top">Choose the model that writes your answers. You can also switch it any time from the chat box.</p>
        <div className="models" role="radiogroup" aria-label="AI model">
          <button type="button" role="radio" aria-checked={!form.model_name} className={`model ${!form.model_name ? 'on' : ''}`} onClick={() => set('model_name')('')}>
            <span><b>Use the default</b><small>{options.default_model?.label || 'The standard model'}</small></span>
            {!form.model_name && <em>Selected</em>}
          </button>
          {options.models.map((m) => (
            <button key={m.key} type="button" role="radio" aria-checked={form.model_name === m.key} className={`model ${form.model_name === m.key ? 'on' : ''}`} onClick={() => set('model_name')(m.key)}>
              <span><b>{m.label}</b><small>{m.description}</small></span>
              <Tags tags={m.tags} />
              {form.model_name === m.key && <em>Selected</em>}
            </button>
          ))}
        </div>
      </section>

      <section className="set-card">
        <h2>Voice</h2>
        <div className="set-group">
          <label className="set-label" htmlFor="vlang">Voice language</label>
          <select id="vlang" className="set-input" value={voice.lang} onChange={(e) => { setVoice({ ...voice, lang: e.target.value }); setStatus(''); }}>
            {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </div>
        <label className="set-check">
          <input type="checkbox" checked={voice.speak} onChange={(e) => { setVoice({ ...voice, speak: e.target.checked }); setStatus(''); }} />
          Read replies aloud in normal chat
        </label>
      </section>

      <div className="set-bar">
        <span className={`set-status ${error ? 'bad' : ''}`} role="status">
          {error || status || (dirty ? 'You have unsaved changes' : 'All changes saved')}
        </span>
        <button type="button" className="ghost" onClick={reset} disabled={saving}>Reset to defaults</button>
        <button type="button" className="primary save" onClick={save} disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save changes'}</button>
      </div>
    </div>
  );
}