import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { Alert, Badge, Card, Spinner, formatBytes, timeAgo } from '../components/ui.jsx';

const Stat = ({ label, value, tone }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <p className="text-sm text-slate-500">{label}</p>
    <p className={`mt-1 text-3xl font-bold ${tone || ''}`}>{value}</p>
  </div>
);

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get('/dashboard').then((r) => setData(r.data)).catch((e) => setError(errMsg(e))); }, []);
  if (error) return <Alert>{error}</Alert>;
  if (!data) return <Spinner />;
  const s = data.stats;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome, {user.name.split(' ')[0]}</h1>
        {!user.mfaEnabled && <div className="mt-3"><Alert kind="warn">Your account is not protected by multi-factor authentication. <Link className="font-medium underline" to="/security">Turn it on</Link></Alert></div>}
      </div>

      {data.role === 'owner' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="My files" value={s.files} /><Stat label="Encrypted storage" value={formatBytes(s.storageBytes)} />
            <Stat label="Active shares I granted" value={s.sharedByMe} /><Stat label="Shared with me" value={s.sharedWithMe} />
          </div>
          <Card title="Recently updated" action={<Link to="/files" className="text-sm text-brand-600 hover:underline">All files</Link>}>
            {data.recent.length === 0 ? <p className="text-sm text-slate-500">No files yet. Upload your first document from My Files.</p> : (
              <ul className="divide-y divide-slate-100">{data.recent.map((f) => (
                <li key={f._id} className="flex items-center justify-between py-2.5 text-sm"><Link className="font-medium text-brand-600 hover:underline" to={`/files/${f._id}`}>{f.name}</Link><span className="text-slate-500">{formatBytes(f.size)} &middot; {timeAgo(f.updatedAt)}</span></li>))}</ul>
            )}
          </Card>
        </>
      )}

      {data.role === 'collaborator' && (
        <div className="grid gap-4 sm:grid-cols-2"><Stat label="Documents shared with me" value={s.sharedWithMe} /><Stat label="Access expiring within 7 days" value={s.expiringSoon} tone={s.expiringSoon ? 'text-amber-600' : ''} /></div>
      )}

      {(data.role === 'admin' || data.role === 'auditor') && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Events (24h)" value={s.events24h} /><Stat label="Access denials (24h)" value={s.denied24h} tone={s.denied24h ? 'text-amber-600' : ''} />
            <Stat label="Failed sign-ins (24h)" value={s.failedLogins24h} tone={s.failedLogins24h ? 'text-red-600' : ''} />
            {data.role === 'admin' && <Stat label="Active users" value={`${s.activeUsers}/${s.users}`} />}
          </div>
          {data.role === 'admin' && <div className="grid gap-4 sm:grid-cols-2"><Stat label="Users with MFA" value={`${s.mfaUsers}/${s.users}`} /><Stat label="Currently locked accounts" value={s.lockedUsers} tone={s.lockedUsers ? 'text-red-600' : ''} /></div>}
          <Card title="Latest security events" action={<Link to="/audit" className="text-sm text-brand-600 hover:underline">Open audit log</Link>}>
            {data.recent.length === 0 ? <p className="text-sm text-slate-500">Nothing to report.</p> : (
              <ul className="divide-y divide-slate-100">{data.recent.map((e) => (
                <li key={e._id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <span><Badge tone={e.outcome === 'success' ? 'green' : 'red'}>{e.action}</Badge> <span className="ml-2 text-slate-600">{e.userEmail || 'unknown'}</span></span>
                  <span className="text-slate-500">{timeAgo(e.timestamp)}</span></li>))}</ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
