import { useCallback, useEffect, useState } from 'react';
import * as api from './api';

const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never');

function roleOf(u) {
  if (u.is_superuser) return { label: 'Superuser', cls: 'super' };
  if (u.is_staff) return { label: 'Admin', cls: 'admin' };
  return { label: 'User', cls: '' };
}

/* ---------------------------------------------------------------- Users */

function PasswordDialog({ target, onClose, onDone }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.adminResetPassword(target.id, pw);
      onDone(`Password updated for ${target.username}.`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="modal-wrap" role="dialog" aria-modal="true" aria-label="Reset password" onClick={onClose}>
      <form className="modal" onSubmit={submit} onClick={(e) => e.stopPropagation()}>
        <h2>Reset password</h2>
        <p className="set-hint top">Set a new password for <strong>{target.username}</strong>. Tell them to change it after signing in.</p>
        <input className="set-input" type="text" autoFocus minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password (at least 8 characters)" aria-label="New password" autoComplete="off" />
        {error && <p className="error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          <button className="primary save" disabled={busy || pw.length < 8}>{busy ? 'Saving…' : 'Set password'}</button>
        </div>
      </form>
    </div>
  );
}

function UsersTab({ me }) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [pwTarget, setPwTarget] = useState(null);

  useEffect(() => {
    const id = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(id);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.adminListUsers({ search: query, role, page }));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [query, role, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  const run = async (u, fn, ok) => {
    setBusyId(u.id);
    setError('');
    try {
      await fn();
      setToast(ok);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const protectedReason = (u) => {
    if (u.id === me.id) return 'This is you';
    if (u.is_superuser) return 'Superuser';
    if (u.is_staff && !me.is_superuser) return 'Only a superuser can change admins';
    return '';
  };

  return (
    <>
      <div className="adm-tools">
        <input className="set-input" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, username or email" aria-label="Search users" />
        <select className="set-input" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} aria-label="Filter users">
          <option value="">All users</option>
          <option value="admin">Admins</option>
          <option value="inactive">Disabled</option>
        </select>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {toast && <p className="note" role="status">{toast}</p>}

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr><th>User</th><th>Role</th><th>Status</th><th className="num">Chats</th><th className="num">Messages</th><th>Joined</th><th>Last sign-in</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {data?.results.map((u) => {
              const r = roleOf(u);
              const locked = protectedReason(u);
              const busy = busyId === u.id;
              return (
                <tr key={u.id} className={u.is_active ? '' : 'off'}>
                  <td>
                    <div className="who-cell"><b>{u.first_name || u.username}</b><span>{u.email || '@' + u.username}</span></div>
                  </td>
                  <td><span className={`badge ${r.cls}`}>{r.label}</span></td>
                  <td><span className={`badge ${u.is_active ? 'ok' : 'bad'}`}>{u.is_active ? 'Active' : 'Disabled'}</span></td>
                  <td className="num">{u.chat_count}</td>
                  <td className="num">{u.message_count}</td>
                  <td>{fmt(u.date_joined)}</td>
                  <td>{fmt(u.last_login)}</td>
                  <td>
                    {locked ? (
                      <span className="muted" title={locked}>{locked === 'This is you' ? 'You' : 'Protected'}</span>
                    ) : (
                      <div className="row-actions">
                        <button disabled={busy} onClick={() => run(u, () => api.adminUpdateUser(u.id, { is_active: !u.is_active }), u.is_active ? `${u.username} disabled.` : `${u.username} enabled.`)}>
                          {u.is_active ? 'Disable' : 'Enable'}
                        </button>
                        {me.is_superuser && (
                          <button disabled={busy} onClick={() => run(u, () => api.adminUpdateUser(u.id, { is_staff: !u.is_staff }), u.is_staff ? `${u.username} is no longer an admin.` : `${u.username} is now an admin.`)}>
                            {u.is_staff ? 'Remove admin' : 'Make admin'}
                          </button>
                        )}
                        <button disabled={busy} onClick={() => setPwTarget(u)}>Reset password</button>
                        <button
                          className="danger"
                          disabled={busy}
                          onClick={() => {
                            if (window.confirm(`Delete ${u.username} and all of their chats? This cannot be undone.`)) {
                              run(u, () => api.adminDeleteUser(u.id), `${u.username} deleted.`);
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {data && data.results.length === 0 && (
              <tr><td colSpan={8} className="muted center pad">No users match your search.</td></tr>
            )}
            {!data && loading && <tr><td colSpan={8} className="muted center pad">Loading users…</td></tr>}
          </tbody>
        </table>
      </div>

      {data && (
        <div className="pager">
          <span>{data.count} {data.count === 1 ? 'user' : 'users'}</span>
          <div>
            <button className="ghost" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>Previous</button>
            <span className="pager-n">Page {data.page} of {data.pages}</span>
            <button className="ghost" disabled={page >= data.pages || loading} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </div>
      )}

      {pwTarget && (
        <PasswordDialog
          target={pwTarget}
          onClose={() => setPwTarget(null)}
          onDone={(msg) => { setPwTarget(null); setToast(msg); }}
        />
      )}
    </>
  );
}

/* ---------------------------------------------------------- Model catalog */

function ModelsCard({ onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ label: '', provider: 'gemini', model_id: '', description: '', tags: '' });

  useEffect(() => { api.adminListModels().then(setData).catch((e) => setError(e.message)); }, []);

  const apply = async (fn) => {
    setBusy(true);
    setError('');
    try {
      setData(await fn());
      onChanged?.();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async (e) => {
    e.preventDefault();
    if (await apply(() => api.adminAddModel(form))) {
      setForm({ label: '', provider: 'gemini', model_id: '', description: '', tags: '' });
      setOpen(false);
    }
  };

  const f = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <section className="set-card">
      <h2>Models users can choose</h2>
      <p className="set-hint top">Users pick from these in the chat box using the friendly name. Gemini Flash models are free; OpenAI has no free API tier, so its models are paid and only appear once an OpenAI key is set.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {!data && !error && <p className="muted">Loading models…</p>}

      <div className="mlist">
        {data?.models.map((m) => (
          <div key={m.id} className={`mrow ${m.enabled ? '' : 'off'}`}>
            <div className="mrow-main">
              <b>{m.label}</b>
              <small><code>{m.model_id}</code></small>
              <span className="mrow-badges">
                <span className="badge">{data.providers.find((p) => p.value === m.provider)?.label.split(' ')[0] || m.provider}</span>
                {!m.available && <span className="badge bad">Key missing</span>}
                {m.is_default && <span className="badge admin">Default</span>}
              </span>
            </div>
            <label className="switch-row">
              <input type="checkbox" checked={m.enabled} disabled={busy} onChange={(e) => apply(() => api.adminUpdateModel(m.id, { enabled: e.target.checked }))} />
              Enabled
            </label>
            <button type="button" className="ghost sm" disabled={busy || !m.enabled || m.is_default || !m.available} onClick={() => apply(() => api.adminUpdateModel(m.id, { is_default: true }))}>Make default</button>
            <button type="button" className="ghost sm danger" disabled={busy} onClick={() => { if (window.confirm(`Remove ${m.label} from the list?`)) apply(() => api.adminDeleteModel(m.id)); }}>Remove</button>
          </div>
        ))}
      </div>

      {open ? (
        <form className="mnew" onSubmit={add}>
          <div className="grid2">
            <div className="set-group"><label className="set-label" htmlFor="m-label">Friendly name</label><input id="m-label" className="set-input" required value={form.label} onChange={f('label')} placeholder="e.g. Gemini Flash" /></div>
            <div className="set-group"><label className="set-label" htmlFor="m-prov">Provider</label>
              <select id="m-prov" className="set-input" value={form.provider} onChange={f('provider')}>{data?.providers.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
            <div className="set-group"><label className="set-label" htmlFor="m-id">Technical model name</label><input id="m-id" className="set-input" required value={form.model_id} onChange={f('model_id')} placeholder="e.g. gemini-3.8-flash" /></div>
            <div className="set-group"><label className="set-label" htmlFor="m-tags">Tags</label><input id="m-tags" className="set-input" value={form.tags} onChange={f('tags')} placeholder="Free, Fast" /></div>
          </div>
          <div className="set-group"><label className="set-label" htmlFor="m-desc">Short description</label><input id="m-desc" className="set-input" maxLength={160} value={form.description} onChange={f('description')} placeholder="What is this model good at?" /></div>
          <div className="modal-actions">
            <button type="button" className="ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="primary save" disabled={busy}>Add model</button>
          </div>
        </form>
      ) : (
        <button type="button" className="ghost" onClick={() => setOpen(true)}>Add a model</button>
      )}
    </section>
  );
}

/* ------------------------------------------------------- Bot configuration */

function BotTab({ onBotSaved }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.adminGetBot().then((d) => { setData(d); setForm(d.settings); }).catch((e) => setError(e.message));
  }, []);

  if (!form) return error ? <p className="error" role="alert">{error}</p> : <p className="muted">Loading configuration…</p>;

  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm({ ...form, [k]: v });
    setStatus('');
  };
  const dirty = JSON.stringify(form) !== JSON.stringify(data.settings);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const body = {
        ...form,
        temperature: Number(form.temperature),
        max_history: Number(form.max_history),
        max_output_tokens: Number(form.max_output_tokens),
      };
      const res = await api.adminSaveBot(body);
      setData(res);
      setForm(res.settings);
      setStatus('Saved. Everyone now sees the new configuration.');
      onBotSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <section className="set-card">
        <h2>Branding</h2>
        <div className="set-group">
          <label className="set-label" htmlFor="b-name">Bot name</label>
          <input id="b-name" className="set-input" value={form.bot_name} onChange={set('bot_name')} maxLength={80} />
        </div>
        <div className="set-group">
          <label className="set-label" htmlFor="b-color">Brand color</label>
          <div className="color-row">
            <input type="color" aria-label="Pick brand color" value={form.brand_color} onChange={set('brand_color')} />
            <input id="b-color" className="set-input" value={form.brand_color} onChange={set('brand_color')} maxLength={7} />
          </div>
        </div>
        <div className="set-group">
          <label className="set-label" htmlFor="b-logo">Logo URL (optional)</label>
          <input id="b-logo" className="set-input" value={form.logo_url} onChange={set('logo_url')} placeholder="https://…/logo.png" />
        </div>
        <div className="set-group">
          <label className="set-label" htmlFor="b-welcome">Welcome message</label>
          <textarea id="b-welcome" className="set-input area" rows={3} value={form.welcome_message} onChange={set('welcome_message')} />
        </div>
      </section>

      <section className="set-card">
        <h2>Behaviour</h2>
        <div className="set-group">
          <label className="set-label" htmlFor="b-prompt">System prompt</label>
          <textarea id="b-prompt" className="set-input area" rows={6} value={form.system_prompt} onChange={set('system_prompt')} />
          <p className="set-hint">The core instructions for every chat. Add the client's business details, tone and rules here.</p>
        </div>
        <div className="set-group">
          <label className="set-label" htmlFor="b-fallback">Message shown when the AI fails</label>
          <textarea id="b-fallback" className="set-input area" rows={2} value={form.fallback_message} onChange={set('fallback_message')} />
        </div>
        <label className="set-check">
          <input type="checkbox" checked={form.voice_enabled} onChange={set('voice_enabled')} /> Show the microphone and conversation mode
        </label>
      </section>

      <section className="set-card">
        <h2>Reply settings</h2>
        <div className="keys">
          <span className={`badge ${data.keys.gemini ? 'ok' : 'bad'}`}>Gemini key: {data.keys.gemini ? 'configured' : 'missing'}</span>
          <span className={`badge ${data.keys.openai ? 'ok' : ''}`}>OpenAI key: {data.keys.openai ? 'configured' : 'not set'}</span>
        </div>
        <p className="set-hint top">API keys live only in the server's <code>.env</code> file and are never shown here.</p>
        <div className="grid2">
          <div className="set-group">
            <label className="set-label" htmlFor="b-temp">Creativity (0 to 2)</label>
            <input id="b-temp" className="set-input" type="number" step="0.1" min="0" max="2" value={form.temperature} onChange={set('temperature')} />
          </div>
          <div className="set-group">
            <label className="set-label" htmlFor="b-hist">Messages remembered</label>
            <input id="b-hist" className="set-input" type="number" min="1" max="100" value={form.max_history} onChange={set('max_history')} />
          </div>
          <div className="set-group">
            <label className="set-label" htmlFor="b-tokens">Max reply length (tokens)</label>
            <input id="b-tokens" className="set-input" type="number" min="64" max="8192" value={form.max_output_tokens} onChange={set('max_output_tokens')} />
          </div>
        </div>
      </section>

      <ModelsCard onChanged={onBotSaved} />

      <div className="set-bar">
        <span className={`set-status ${error ? 'bad' : ''}`} role="status">{error || status || (dirty ? 'You have unsaved changes' : 'All changes saved')}</span>
        <button type="button" className="primary save" onClick={save} disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save changes'}</button>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ Page */

export default function Admin({ me, onBotSaved }) {
  const [tab, setTab] = useState('users');
  return (
    <div className="settings wide">
      <header className="set-head">
        <h1>Admin panel</h1>
        <p>Manage the people who use this chatbot and how it behaves for everyone.</p>
      </header>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'users'} className={tab === 'users' ? 'on' : ''} onClick={() => setTab('users')}>Users</button>
        <button role="tab" aria-selected={tab === 'bot'} className={tab === 'bot' ? 'on' : ''} onClick={() => setTab('bot')}>Bot configuration</button>
      </div>
      {tab === 'users' ? <UsersTab me={me} /> : <BotTab onBotSaved={onBotSaved} />}
    </div>
  );
}