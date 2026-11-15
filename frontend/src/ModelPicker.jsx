import { useEffect, useRef, useState } from 'react';

const tagClass = (t) => {
  const k = t.toLowerCase();
  if (k.includes('free')) return 'free';
  if (k.includes('paid')) return 'paid';
  return '';
};

export function Tags({ tags }) {
  return (
    <span className="mp-tags">
      {tags.map((t) => <i key={t} className={`tag ${tagClass(t)}`}>{t}</i>)}
    </span>
  );
}

/** A simple model chooser that sits next to the chat box. Users see friendly names only. */
export default function ModelPicker({ models, current, onSelect }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  if (!models.length) return null;
  const cur = models.find((m) => m.key === current?.key) || models[0];

  const pick = async (m) => {
    if (m.key === cur.key) { setOpen(false); return; }
    setBusy(true);
    try { await onSelect(m.key); } finally { setBusy(false); setOpen(false); }
  };

  return (
    <div className="mp" ref={ref}>
      <button type="button" className="mp-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)} disabled={busy} title="Choose a model">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="m12 2 2.2 6.3L21 10l-6.8 1.7L12 18l-2.2-6.3L3 10l6.8-1.7L12 2Zm7 13 1 2.7 2.7 1-2.7 1-1 2.7-1-2.7-2.7-1 2.7-1 1-2.7Z" /></svg>
        <span>{busy ? 'Switching…' : cur.label}</span>
        {models.length > 1 && <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>}
      </button>

      {open && models.length > 1 && (
        <ul className="mp-pop" role="listbox" aria-label="Choose a model">
          <li className="mp-title">Choose a model</li>
          {models.map((m) => (
            <li key={m.key}>
              <button type="button" role="option" aria-selected={m.key === cur.key} className={`mp-opt ${m.key === cur.key ? 'on' : ''}`} onClick={() => pick(m)}>
                <span className="mp-main"><b>{m.label}</b><small>{m.description}</small></span>
                <Tags tags={m.tags} />
                {m.key === cur.key && <svg className="mp-check" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}