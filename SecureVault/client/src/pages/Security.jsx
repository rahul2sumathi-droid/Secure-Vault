import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { errMsg, setAccessToken } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { Alert, Badge, Button, Card, Field, Spinner, formatDate } from '../components/ui.jsx';

function Mfa() {
  const { user, reloadUser } = useAuth();
  const [setup, setSetup] = useState(null);
  const [codes, setCodes] = useState(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [disabling, setDisabling] = useState(false);

  const start = async () => { setError(''); try { setSetup((await api.post('/auth/mfa/setup')).data); } catch (e) { setError(errMsg(e)); } };
  const enable = async (e) => {
    e.preventDefault(); setError('');
    try { const { data } = await api.post('/auth/mfa/enable', { code }); setCodes(data.recoveryCodes); setSetup(null); setCode(''); await reloadUser(); } catch (err) { setError(errMsg(err)); }
  };
  const disable = async (e) => {
    e.preventDefault(); setError('');
    try { await api.post('/auth/mfa/disable', { password, code }); setDisabling(false); setCode(''); setPassword(''); await reloadUser(); } catch (err) { setError(errMsg(err)); }
  };

  return (
    <Card title="Multi-factor authentication" action={user.mfaEnabled ? <Badge tone="green">Enabled</Badge> : <Badge>Off</Badge>}>
      <div className="space-y-4">
        <Alert>{error}</Alert>
        {codes && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="font-medium text-amber-900">Save your recovery codes now - they will not be shown again.</p>
            <p className="mb-2 text-sm text-amber-800">Each code works once if you lose your authenticator.</p>
            <ul className="grid grid-cols-2 gap-1 font-mono text-sm">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
            <Button className="mt-3" variant="secondary" size="sm" onClick={() => setCodes(null)}>I have saved them</Button>
          </div>
        )}
        {!user.mfaEnabled && !setup && <><p className="text-sm text-slate-600">Add a second step to sign-in using an authenticator app (Google Authenticator, Microsoft Authenticator, Authy...).</p><Button onClick={start}>Set up MFA</Button></>}
        {setup && (
          <form onSubmit={enable} className="space-y-3">
            <p className="text-sm text-slate-600">1. Scan this QR code with your authenticator app.</p>
            <img src={setup.qrDataUrl} alt="MFA QR code" className="h-44 w-44 rounded-lg border" />
            <p className="text-xs text-slate-500">Cannot scan? Enter this key manually: <span className="select-all font-mono">{setup.secret}</span></p>
            <Field label="2. Enter the 6-digit code to confirm"><input className="input max-w-xs tracking-widest" inputMode="numeric" required value={code} onChange={(e) => setCode(e.target.value)} /></Field>
            <div className="flex gap-2"><Button>Enable MFA</Button><Button type="button" variant="ghost" onClick={() => setSetup(null)}>Cancel</Button></div>
          </form>
        )}
        {user.mfaEnabled && !disabling && <Button variant="secondary" onClick={() => setDisabling(true)}>Disable MFA</Button>}
        {user.mfaEnabled && disabling && (
          <form onSubmit={disable} className="max-w-sm space-y-3">
            <Field label="Password"><input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            <Field label="Authenticator code"><input className="input" inputMode="numeric" required value={code} onChange={(e) => setCode(e.target.value)} /></Field>
            <div className="flex gap-2"><Button variant="danger">Disable</Button><Button type="button" variant="ghost" onClick={() => setDisabling(false)}>Cancel</Button></div>
          </form>
        )}
      </div>
    </Card>
  );
}

function Sessions() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api.get('/auth/sessions').then((r) => setSessions(r.data.sessions)).catch((e) => setError(errMsg(e))), []);
  useEffect(() => { load(); }, [load]);
  const revoke = async (id) => { try { await api.delete(`/auth/sessions/${id}`); load(); } catch (e) { setError(errMsg(e)); } };
  const all = async () => { try { await api.post('/auth/logout-all'); setAccessToken(null); setUser(null); navigate('/login'); } catch (e) { setError(errMsg(e)); } };

  return (
    <Card title="Active sessions" action={<Button size="sm" variant="danger" onClick={all}>Sign out everywhere</Button>}>
      <Alert>{error}</Alert>
      {!sessions ? <Spinner /> : (
        <ul className="divide-y divide-slate-100">{sessions.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
            <div><p className="max-w-md truncate font-medium">{s.userAgent || 'Unknown device'} {s.current && <Badge tone="green">This device</Badge>}</p><p className="text-slate-500">{s.ip} &middot; signed in {formatDate(s.createdAt)}</p></div>
            {!s.current && <Button size="sm" variant="secondary" onClick={() => revoke(s.id)}>Revoke</Button>}
          </li>))}</ul>
      )}
    </Card>
  );
}

function ChangePassword() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault(); setError(''); setMsg('');
    try { const { data } = await api.post('/auth/change-password', form); setMsg(data.message); setForm({ currentPassword: '', newPassword: '' }); } catch (err) { setError(errMsg(err)); }
  };
  return (
    <Card title="Change password">
      <form onSubmit={submit} className="max-w-sm space-y-3">
        <Alert>{error}</Alert><Alert kind="success">{msg}</Alert>
        <Field label="Current password"><input className="input" type="password" autoComplete="current-password" required value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} /></Field>
        <Field label="New password" hint="At least 10 characters with upper-case, lower-case and a number."><input className="input" type="password" autoComplete="new-password" required minLength={10} value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} /></Field>
        <Button>Update password</Button>
      </form>
    </Card>
  );
}

export default function Security() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Security</h1>
      <Mfa /><ChangePassword /><Sessions />
    </div>
  );
}
