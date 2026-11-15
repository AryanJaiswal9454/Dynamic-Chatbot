import { useCallback, useEffect, useMemo, useState } from 'react';
import * as api from './api';
import Admin from './admin.jsx';
import Auth from './Auth.jsx';
import Chat from './Chat.jsx';
import Logo from './logo.jsx';
import Dashboard from './Dashboard.jsx';
import Settings from './Settings.jsx';
import ThemeToggle from './ThemeToggle.jsx';

const FALLBACK_CFG = {
  bot_name: 'Assistant',
  welcome_message: 'Ask me anything.',
  brand_color: '#6C5CE7',
  logo_url: '',
  voice_enabled: true,
};

export default function App() {
  const [cfg, setCfg] = useState(null);
  const [user, setUser] = useState(null);
  const [prefs, setPrefs] = useState(null);
  const [prefsError, setPrefsError] = useState('');
  const [booting, setBooting] = useState(true);
  const [view, setView] = useState('chat');
  const [convs, setConvs] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    api.getConfig().catch(() => FALLBACK_CFG).then(setCfg);
  }, []);

  useEffect(() => {
    api.onAuthLost(() => { setUser(null); setPrefs(null); setConvs([]); setActiveId(null); });
    if (!api.hasToken()) { setBooting(false); return; }
    api.me().then(setUser).catch(() => {}).finally(() => setBooting(false));
  }, []);

  const loadPrefs = useCallback(() => {
    setPrefsError('');
    api.getPreferences()
      .then(setPrefs)
      .catch((e) => setPrefsError(`${e.status ? `Error ${e.status}: ` : ''}${e.message}`));
  }, []);

  useEffect(() => {
    if (!user) return;
    api.listConversations().then(setConvs).catch(() => {});
    loadPrefs();
  }, [user, loadPrefs]);

  // What the signed-in user sees: the default bot with their own name and color applied.
  const botCfg = useMemo(() => {
    if (!cfg) return null;
    const p = prefs?.preferences;
    return {
      ...cfg,
      bot_name: p?.assistant_name || cfg.bot_name,
      brand_color: p?.accent_color || cfg.brand_color,
    };
  }, [cfg, prefs]);

  useEffect(() => {
    if (!botCfg) return;
    document.documentElement.style.setProperty('--brand', botCfg.brand_color);
    document.title = botCfg.bot_name;
  }, [botCfg]);

  const changeModel = useCallback(async (key) => {
    const res = await api.updatePreferences({ model_name: key });
    setPrefs(res);
  }, []);

  const refreshBot = useCallback(() => {
    api.getConfig().then(setCfg).catch(() => {});
    loadPrefs();
  }, [loadPrefs]);

  const upsertConversation = useCallback((conv) => {
    setConvs((prev) => [conv, ...prev.filter((c) => c.id !== conv.id)]);
    setActiveId(conv.id);
  }, []);

  const removeConversation = async (id) => {
    if (!window.confirm('Delete this chat? This cannot be undone.')) return;
    try {
      await api.deleteConversation(id);
      setConvs((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) setActiveId(null);
    } catch { /* list stays as is */ }
  };

  const signOut = () => {
    api.logout();
    setUser(null); setPrefs(null); setConvs([]); setActiveId(null); setView('chat');
  };

  if (!cfg || booting) return <div className="boot"><Logo size={64} className="pulse" /><span>Loading…</span></div>;
  if (!user) return (<><ThemeToggle /><Auth cfg={cfg} onAuthed={setUser} /></>);

  const go = (v, id = null) => { setView(v); setActiveId(id); setMenuOpen(false); };
  const titles = { dashboard: 'Analytics', settings: 'Bot settings', admin: 'Admin panel' };

  return (
    <>
      <ThemeToggle />
      <div className="shell">
        <aside className={`rail ${menuOpen ? 'open' : ''}`}>
          <div className="brand">
            {botCfg.logo_url ? <img src={botCfg.logo_url} alt="" /> : <Logo size={34} />}
            <strong>{botCfg.bot_name}</strong>
          </div>
          <button className="new-chat" onClick={() => go('chat', null)}>New chat</button>

          <nav className="history" aria-label="Chat history">
            {convs.length === 0 && <p className="muted">Your chats will appear here.</p>}
            {convs.map((c) => (
              <div key={c.id} className={`hist-row ${view === 'chat' && c.id === activeId ? 'active' : ''}`}>
                <button className="hist-title" onClick={() => go('chat', c.id)} title={c.title}>{c.title}</button>
                <button className="hist-del" aria-label={`Delete chat ${c.title}`} onClick={() => removeConversation(c.id)}>×</button>
              </div>
            ))}
          </nav>

          <div className="rail-foot">
            <button className={`link ${view === 'settings' ? 'on' : ''}`} onClick={() => go('settings')}>Bot settings</button>
            {user.is_staff && (
              <>
                <button className={`link ${view === 'dashboard' ? 'on' : ''}`} onClick={() => go('dashboard')}>Analytics</button>
                <button className={`link ${view === 'admin' ? 'on' : ''}`} onClick={() => go('admin')}>Admin panel</button>
              </>
            )}
            <div className="who">
              <span>{user.first_name || user.username}</span>
              <button className="link" onClick={signOut}>Sign out</button>
            </div>
          </div>
        </aside>

        {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}

        <main className="stage">
          <header className="topbar">
            <button className="burger" aria-label="Open menu" onClick={() => setMenuOpen(true)}>☰</button>
            <span>{titles[view] || botCfg.bot_name}</span>
          </header>
          {view === 'dashboard' && <Dashboard />}
          {view === 'admin' && user.is_staff && <Admin me={user} onBotSaved={refreshBot} />}
          {view === 'settings' && <Settings data={prefs} error={prefsError} onRetry={loadPrefs} onSaved={setPrefs} />}
          {view === 'chat' && (
            <Chat
              cfg={botCfg}
              user={user}
              convId={activeId}
              onConversation={upsertConversation}
              models={prefs?.options?.models || []}
              currentModel={prefs?.current_model || null}
              onModelChange={changeModel}
            />
          )}
        </main>
      </div>
    </>
  );
}