import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.ts';
import { useSession } from '../lib/session.tsx';

/** Centered card used by every auth page. */
function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="auth-wrap">
      <div className="panel auth-card">
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  );
}

/**
 * The password rules, shown live next to the field. The server enforces the
 * same rules (plus a common-password list it owns).
 */
function PasswordRules({ password, confirm, email }: { password: string; confirm: string; email?: string }) {
  const localPart = email?.split('@')[0]?.toLowerCase();
  const rules: { ok: boolean; label: string }[] = [
    { ok: password.length >= 8 && password.length <= 128, label: 'At least 8 characters (max 128)' },
    {
      ok: !localPart || localPart.length < 4 || !password.toLowerCase().includes(localPart),
      label: 'Does not contain your email name',
    },
    { ok: password.length > 0 && password === confirm, label: 'Both fields match' },
  ];
  return (
    <ul className="pw-rules">
      {rules.map((r) => (
        <li key={r.label} className={r.ok ? 'ok' : ''}>
          {r.ok ? '✓' : '·'} {r.label}
        </li>
      ))}
      <li className="pw-note">Avoid common passwords; anything easily guessed is rejected.</li>
    </ul>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setUser } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await api.login(email, password);
      setUser(user);
      const next = searchParams.get('next');
      navigate(next && next.startsWith('/') ? next : '/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Sign in">
      <form onSubmit={submit} className="auth-form">
        <label>
          Email
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <div className="upload-error auth-error">{error}</div>}
        <button className="btn btn-primary" disabled={busy || !email || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <Link className="link-btn" to="/forgot-password">
          Forgot password?
        </Link>
      </form>
    </AuthCard>
  );
}

export function ForgotPasswordPage() {
  return (
    <AuthCard title="Forgot password">
      <p className="auth-copy">
        Password resets are handled by your advisor for now. Reach out to them and they will send you a fresh
        set-password link.
      </p>
      <Link className="link-btn" to="/login">
        Back to sign in
      </Link>
    </AuthCard>
  );
}

export function SetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const { setUser } = useSession();

  const [info, setInfo] = useState<{ valid: boolean; email?: string; purpose?: string } | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setInfo({ valid: false });
      return;
    }
    api.tokenInfo(token).then(setInfo).catch(() => setInfo({ valid: false }));
  }, [token]);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const user = await api.setPassword(token, password);
      setUser(user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set the password.');
    } finally {
      setBusy(false);
    }
  }

  if (!info) {
    return <AuthCard title="Set your password">…</AuthCard>;
  }
  if (!info.valid) {
    return (
      <AuthCard title="Link expired">
        <p className="auth-copy">
          This link is invalid or has expired. Ask your advisor for a new one.
        </p>
        <Link className="link-btn" to="/login">
          Back to sign in
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={info.purpose === 'reset' ? 'Reset your password' : 'Welcome — set your password'}>
      <p className="auth-copy">
        Setting a password for <strong>{info.email}</strong>.
      </p>
      <form onSubmit={submit} className="auth-form">
        <label>
          New password
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </label>
        <label>
          Confirm password
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        <PasswordRules password={password} confirm={confirm} email={info.email} />
        {error && <div className="upload-error auth-error">{error}</div>}
        <button className="btn btn-primary" disabled={busy || password.length < 8 || password !== confirm}>
          {busy ? 'Saving…' : 'Set password and sign in'}
        </button>
      </form>
    </AuthCard>
  );
}

export function ChangePasswordPage() {
  const navigate = useNavigate();
  const { user } = useSession();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.changePassword(current, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Change password">
      <form onSubmit={submit} className="auth-form">
        <label>
          Current password
          <input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoFocus
          />
        </label>
        <label>
          New password
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label>
          Confirm new password
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        <PasswordRules password={password} confirm={confirm} email={user?.email} />
        {error && <div className="upload-error auth-error">{error}</div>}
        <div className="auth-actions">
          <button className="btn btn-primary" disabled={busy || password.length < 8 || password !== confirm || !current}>
            {busy ? 'Saving…' : 'Change password'}
          </button>
          <button type="button" className="btn" onClick={() => navigate(-1)}>
            Cancel
          </button>
        </div>
      </form>
    </AuthCard>
  );
}
