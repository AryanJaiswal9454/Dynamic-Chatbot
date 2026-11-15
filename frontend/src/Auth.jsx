import { useEffect, useRef, useState } from 'react';
import * as api from './api';
import Logo from './logo.jsx';

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
const IconUser = () => (<svg viewBox="0 0 24 24" width="19" height="19" {...stroke} aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>);
const IconMail = () => (<svg viewBox="0 0 24 24" width="19" height="19" {...stroke} aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></svg>);
const IconLock = () => (<svg viewBox="0 0 24 24" width="19" height="19" {...stroke} aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="3" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>);
const IconEye = ({ off }) => (
  <svg viewBox="0 0 24 24" width="19" height="19" {...stroke} aria-hidden="true">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />
    {off && <path d="M4 4l16 16" />}
  </svg>
);
const IconMic = () => (<svg viewBox="0 0 24 24" width="18" height="18" {...stroke} aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>);
const IconMemory = () => (<svg viewBox="0 0 24 24" width="18" height="18" {...stroke} aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.8 7L4 20l1.2-4.4A8 8 0 1 1 21 12Z" /></svg>);
const IconMoon = () => (<svg viewBox="0 0 24 24" width="18" height="18" {...stroke} aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>);

function Field({ id, label, icon, right, ...input }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="field-box">
        {icon}
        <input id={id} {...input} />
        {right}
      </div>
    </div>
  );
}

function OtpInput({ value, onChange, disabled }) {
  const refs = useRef([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] || '');

  const setAt = (i, d) => {
    const next = digits.slice();
    next[i] = d;
    onChange(next.join(''));
  };
  const handleChange = (i, e) => {
    const d = e.target.value.replace(/\D/g, '').slice(-1);
    setAt(i, d);
    if (d && i < 5) refs.current[i + 1]?.focus();
  };
  const handleKey = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus();
  };
  const handlePaste = (e) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!text) return;
    e.preventDefault();
    onChange(text);
    refs.current[Math.min(text.length, 5)]?.focus();
  };

  return (
    <div className="otp" onPaste={handlePaste}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          className={d ? 'filled' : ''}
          value={d}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          aria-label={`Digit ${i + 1}`}
          disabled={disabled}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKey(i, e)}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}

export default function Auth({ cfg, onAuthed }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', email: '', first_name: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(null); // { email } while waiting for the emailed code
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [note, setNote] = useState('');
  const busyRef = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const switchMode = (m) => { setMode(m); setError(''); };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') {
        await api.login(form.username, form.password);
        onAuthed(await api.me());
      } else {
        const res = await api.register(form);
        setPending({ email: res.email });
        setCode('');
        setNote('');
        setCooldown(res.resend_in || 60);
      }
    } catch (err) {
      setError(err.status === 401 ? 'Wrong username or password.' : err.message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value) => {
    if (busyRef.current || value.length !== 6) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      onAuthed(await api.verifySignup(pending.email, value));
    } catch (err) {
      setError(err.message);
      setCode('');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const onCode = (v) => {
    setCode(v);
    if (v.length === 6) verify(v);
  };

  const resend = async () => {
    setError('');
    setNote('');
    try {
      const res = await api.resendSignupCode(pending.email);
      setCooldown(res.resend_in || 60);
      setNote('A new code is on its way.');
      setCode('');
    } catch (err) {
      setError(err.message);
    }
  };

  const backToForm = () => { setPending(null); setCode(''); setError(''); setNote(''); };

  const login = mode === 'login';

  return (
    <div className="auth">
      {/* ---------- left: brand + live chat preview ---------- */}
      <section className="hero">
        <span className="blob b1" aria-hidden="true" />
        <span className="blob b2" aria-hidden="true" />
        <span className="blob b3" aria-hidden="true" />

        <div className="brand">
          {cfg.logo_url ? <img src={cfg.logo_url} alt="" /> : <Logo size={44} />}
          <strong>{cfg.bot_name}</strong>
        </div>

        <div className="hero-copy">
          <span className="pill"><i /> Online and ready</span>
          <h2>Ask anything.<br />Get answers that <em>feel human.</em></h2>
          <p>{cfg.welcome_message}</p>
          <ul className="feats">
            <li><IconMic /> Talk or type</li>
            <li><IconMemory /> Remembers your chat</li>
            <li><IconMoon /> Day and night mode</li>
          </ul>
        </div>

        <div className="demo" aria-hidden="true">
          <div className="demo-b you">Can you explain photosynthesis in simple words?</div>
          <div className="demo-slot">
            <div className="demo-b bot typing-b"><i /><i /><i /></div>
            <div className="demo-b bot reply">Sure! Plants catch sunlight and use it to turn water and air into their own food. That is how they grow.</div>
          </div>
        </div>
      </section>

      {/* ---------- right: form ---------- */}
      <section className="auth-side">
        {pending ? (
          <div className="auth-card">
            <div className="otp-icon" aria-hidden="true"><IconMail /></div>
            <h1>Check your email</h1>
            <p className="auth-sub">We sent a 6-digit code to <strong>{pending.email}</strong>. Enter it below to finish creating your account.</p>

            <OtpInput value={code} onChange={onCode} disabled={busy} />

            {error && <p className="error" role="alert">{error}</p>}
            {note && !error && <p className="note" role="status">{note}</p>}

            <button type="button" className="primary" disabled={busy || code.length !== 6} onClick={() => verify(code)}>
              {busy ? <span className="spin" aria-hidden="true" /> : null}
              {busy ? 'Verifying…' : 'Verify and continue'}
            </button>

            <p className="switch">
              Did not get it?{' '}
              {cooldown > 0 ? (
                <span>Resend in {cooldown}s</span>
              ) : (
                <button type="button" className="link" onClick={resend}>Send a new code</button>
              )}
            </p>
            <p className="switch tight">
              <button type="button" className="link" onClick={backToForm}>Use a different email</button>
            </p>
            <p className="switch tight small">The code expires in 10 minutes. Check your spam folder too.</p>
          </div>
        ) : (
        <div className="auth-card">
          <div className="seg" role="tablist" aria-label="Sign in or create account">
            <span className="seg-thumb" style={{ transform: login ? 'translateX(0)' : 'translateX(100%)' }} />
            <button type="button" role="tab" aria-selected={login} className={login ? 'on' : ''} onClick={() => switchMode('login')}>Sign in</button>
            <button type="button" role="tab" aria-selected={!login} className={!login ? 'on' : ''} onClick={() => switchMode('register')}>Create account</button>
          </div>

          <h1>{login ? 'Welcome back' : 'Join in seconds'}</h1>
          <p className="auth-sub">{login ? `Sign in to continue chatting with ${cfg.bot_name}.` : `Create an account and start talking to ${cfg.bot_name}.`}</p>

          <form onSubmit={submit} key={mode} className="auth-fields">
            <Field id="username" label="Username" icon={<IconUser />} value={form.username} onChange={set('username')} autoComplete="username" placeholder="your username" required />
            {!login && (
              <>
                <Field id="first_name" label="First name" icon={<IconUser />} value={form.first_name} onChange={set('first_name')} autoComplete="given-name" placeholder="optional" />
                <Field id="email" label="Email" icon={<IconMail />} type="email" value={form.email} onChange={set('email')} autoComplete="email" placeholder="you@example.com" required />
              </>
            )}
            <Field
              id="password"
              label="Password"
              icon={<IconLock />}
              type={show ? 'text' : 'password'}
              value={form.password}
              onChange={set('password')}
              autoComplete={login ? 'current-password' : 'new-password'}
              minLength={login ? undefined : 8}
              placeholder={login ? 'your password' : 'at least 8 characters'}
              required
              right={
                <button type="button" className="eye" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>
                  <IconEye off={show} />
                </button>
              }
            />

            {error && <p className="error" role="alert">{error}</p>}

            <button className="primary" disabled={busy}>
              {busy ? <span className="spin" aria-hidden="true" /> : null}
              {busy ? 'Please wait…' : login ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <p className="switch">
            {login ? 'New here?' : 'Already registered?'}{' '}
            <button type="button" className="link" onClick={() => switchMode(login ? 'register' : 'login')}>
              {login ? 'Create an account' : 'Sign in'}
            </button>
          </p>
        </div>
        )}
      </section>
    </div>
  );
}