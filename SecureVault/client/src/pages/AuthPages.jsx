import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api, { errMsg } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { Alert, Button, Field } from '../components/ui.jsx';

function Shell({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-slate-900 via-brand-900 to-slate-900 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-brand-600 text-2xl">&#128274;</div>
          <h1 className="text-xl font-bold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {children}
        {footer && <div className="mt-6 text-center text-sm text-slate-500">{footer}</div>}
      </div>
    </div>
  );
}

export function Login() {
  const { login, verifyMfa } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [mfaToken, setMfaToken] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      if (mfaToken) {
        await verifyMfa(mfaToken, code);
        navigate('/');
      } else {
        const r = await login(form.email, form.password);
        if (r.mfaRequired) setMfaToken(r.mfaToken); else navigate('/');
      }
    } catch (err) {
      setError(errMsg(err));
      if (mfaToken && err.response?.status === 401 && /expired/i.test(errMsg(err))) { setMfaToken(null); setCode(''); }
    } finally { setBusy(false); }
  };

  return (
    <Shell title="Sign in to SecureVault" subtitle={mfaToken ? 'Two-step verification' : 'Secure document sharing'}
      footer={!mfaToken && <><Link className="text-brand-600 hover:underline" to="/forgot-password">Forgot password?</Link><span className="mx-2">&middot;</span><Link className="text-brand-600 hover:underline" to="/register">Create account</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        <Alert>{error}</Alert>
        {!mfaToken ? (
          <>
            <Field label="Email"><input className="input" type="email" autoComplete="username" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Password"><input className="input" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          </>
        ) : (
          <Field label="Authenticator code or recovery code" hint="Enter the 6-digit code from your app, or one of your 10-character recovery codes.">
            <input className="input tracking-widest" autoFocus autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
        )}
        <Button className="w-full" disabled={busy}>{busy ? 'Please wait...' : mfaToken ? 'Verify' : 'Sign in'}</Button>
        {mfaToken && <button type="button" className="w-full text-sm text-slate-500 hover:underline" onClick={() => { setMfaToken(null); setCode(''); setError(''); }}>&larr; Back</button>}
      </form>
    </Shell>
  );
}

export function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'owner' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try { await api.post('/auth/register', form); navigate('/login'); } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  };
  return (
    <Shell title="Create your account" footer={<>Already registered? <Link className="text-brand-600 hover:underline" to="/login">Sign in</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        <Alert>{error}</Alert>
        <Field label="Full name"><input className="input" required minLength={2} value={form.name} onChange={set('name')} /></Field>
        <Field label="Email"><input className="input" type="email" required value={form.email} onChange={set('email')} /></Field>
        <Field label="Password" hint="At least 10 characters with upper-case, lower-case and a number."><input className="input" type="password" autoComplete="new-password" required minLength={10} value={form.password} onChange={set('password')} /></Field>
        <Field label="I will mainly..." hint="Admin and Auditor accounts are assigned by an administrator.">
          <select className="input" value={form.role} onChange={set('role')}>
            <option value="owner">Upload and manage documents (File Owner)</option>
            <option value="collaborator">Work on documents shared with me (Collaborator)</option>
          </select>
        </Field>
        <Button className="w-full" disabled={busy}>{busy ? 'Creating...' : 'Create account'}</Button>
      </form>
    </Shell>
  );
}

export function Forgot() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try { const { data } = await api.post('/auth/forgot', { email }); setMsg(data.message); } catch (err) { setError(errMsg(err)); }
  };
  return (
    <Shell title="Reset your password" subtitle="We'll email you a single-use link" footer={<Link className="text-brand-600 hover:underline" to="/login">Back to sign in</Link>}>
      <form onSubmit={submit} className="space-y-4">
        <Alert>{error}</Alert>
        <Alert kind="success">{msg}</Alert>
        <Field label="Email"><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Button className="w-full">Send reset link</Button>
        <p className="text-xs text-slate-500">If email (SMTP) is not configured on the server, the link is printed in the server console instead of being sent.</p>
      </form>
    </Shell>
  );
}

export function Reset() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try { await api.post('/auth/reset', { token: params.get('token') || '', password }); navigate('/login'); } catch (err) { setError(errMsg(err)); }
  };
  return (
    <Shell title="Choose a new password" footer={<Link className="text-brand-600 hover:underline" to="/login">Back to sign in</Link>}>
      <form onSubmit={submit} className="space-y-4">
        <Alert>{error}</Alert>
        <Field label="New password" hint="At least 10 characters with upper-case, lower-case and a number."><input className="input" type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <Button className="w-full">Update password</Button>
      </form>
    </Shell>
  );
}
