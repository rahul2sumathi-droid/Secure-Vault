import { useCallback, useEffect, useState } from 'react';
import api, { errMsg } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { Alert, Badge, Button, Card, Empty, RoleBadge, Spinner, formatDate } from '../components/ui.jsx';
import { AccessBadges } from './FilesPage.jsx';

function Users() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api.get('/admin/users').then((r) => setUsers(r.data.users)).catch((e) => setError(errMsg(e))), []);
  useEffect(() => { load(); }, [load]);
  const patch = async (u, body) => { setError(''); try { await api.patch(`/admin/users/${u._id}`, body); load(); } catch (err) { setError(errMsg(err)); } };

  if (!users) return <Spinner />;
  return (
    <div className="space-y-3">
      <Alert>{error}</Alert>
      <div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-100">
        <thead className="bg-slate-50"><tr><th className="th">User</th><th className="th">Role</th><th className="th">Status</th><th className="th">MFA</th><th className="th">Last sign-in</th><th className="th" /></tr></thead>
        <tbody className="divide-y divide-slate-100">{users.map((u) => {
          const self = u._id === me._id;
          return (
            <tr key={u._id}>
              <td className="td"><span className="font-medium">{u.name}</span><br /><span className="text-xs text-slate-500">{u.email}</span></td>
              <td className="td">{self ? <RoleBadge role={u.role} /> : (
                <select className="input !w-auto !py-1" value={u.role} onChange={(e) => patch(u, { role: e.target.value })} aria-label={`Role for ${u.email}`}>
                  <option value="owner">File Owner</option><option value="collaborator">Collaborator</option><option value="auditor">Auditor</option><option value="admin">Admin</option>
                </select>)}</td>
              <td className="td">{u.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="red">Deactivated</Badge>}{u.lockUntil && new Date(u.lockUntil) > new Date() && <Badge tone="amber">Locked</Badge>}</td>
              <td className="td">{u.mfaEnabled ? <Badge tone="green">On</Badge> : <Badge>Off</Badge>}</td>
              <td className="td text-slate-600">{formatDate(u.lastLoginAt)}</td>
              <td className="td text-right">{!self && <Button size="sm" variant={u.isActive ? 'danger' : 'secondary'} onClick={() => patch(u, { isActive: !u.isActive })}>{u.isActive ? 'Deactivate' : 'Reactivate'}</Button>}</td>
            </tr>);
        })}</tbody></table></div>
    </div>
  );
}

function Grants() {
  const [grants, setGrants] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api.get('/admin/grants').then((r) => setGrants(r.data.grants)).catch((e) => setError(errMsg(e))), []);
  useEffect(() => { load(); }, [load]);
  const revoke = async (g) => {
    if (!window.confirm(`Revoke ${g.userEmail}'s access to "${g.fileName}"?`)) return;
    try { await api.delete(`/admin/grants/${g._id}`); load(); } catch (err) { setError(errMsg(err)); }
  };
  if (!grants) return <Spinner />;
  return (
    <div className="space-y-3">
      <Alert kind="warn">Admins can review and revoke access, but never read document contents.</Alert>
      <Alert>{error}</Alert>
      {grants.length === 0 ? <Empty>No active grants.</Empty> : (
        <div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50"><tr><th className="th">File</th><th className="th">Owner</th><th className="th">Shared with</th><th className="th">Access</th><th className="th">Expires</th><th className="th" /></tr></thead>
          <tbody className="divide-y divide-slate-100">{grants.map((g) => (
            <tr key={g._id}><td className="td font-medium">{g.fileName}</td><td className="td text-slate-600">{g.ownerEmail}</td><td className="td text-slate-600">{g.userEmail}</td>
              <td className="td"><AccessBadges a={g} /></td><td className="td text-slate-600">{g.expiresAt ? formatDate(g.expiresAt) : 'Never'}</td>
              <td className="td text-right"><Button size="sm" variant="danger" onClick={() => revoke(g)}>Revoke</Button></td></tr>))}</tbody></table></div>
      )}
    </div>
  );
}

export default function Admin() {
  const [tab, setTab] = useState('users');
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Users &amp; Access</h1>
      <Card>
        <div className="mb-4 flex gap-1 border-b border-slate-200">
          {[['users', 'Users'], ['grants', 'Access grants']].map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === k ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{l}</button>)}
        </div>
        {tab === 'users' ? <Users /> : <Grants />}
      </Card>
    </div>
  );
}
