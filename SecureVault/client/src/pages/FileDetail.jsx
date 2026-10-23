import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { errMsg, fetchFile } from '../api.js';
import { Alert, Badge, Button, Card, Empty, Field, Modal, Spinner, formatBytes, formatDate } from '../components/ui.jsx';
import { AccessBadges } from './FilesPage.jsx';

function ShareDialog({ fileId, canGrant, onClose, onDone }) {
  const [email, setEmail] = useState('');
  const [matches, setMatches] = useState([]);
  const [perm, setPerm] = useState({ download: false, edit: false, reshare: false });
  const [expiry, setExpiry] = useState('7');
  const [custom, setCustom] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (email.trim().length < 3 || email.includes(' ')) { setMatches([]); return undefined; }
    const t = setTimeout(() => api.get('/users/search', { params: { q: email } }).then((r) => setMatches(r.data.users)).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [email]);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    let expiresAt = null;
    if (expiry === 'custom') expiresAt = custom ? new Date(custom).toISOString() : null;
    else if (expiry !== 'never') expiresAt = new Date(Date.now() + Number(expiry) * 86400000).toISOString();
    try { await api.post(`/files/${fileId}/share`, { email, ...perm, expiresAt }); onDone(); } catch (err) { setError(errMsg(err)); setBusy(false); }
  };
  const toggle = (k) => (e) => setPerm({ ...perm, [k]: e.target.checked });

  return (
    <Modal title="Share file" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Alert>{error}</Alert>
        <Field label="Recipient email">
          <input className="input" type="email" required autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
          {matches.length > 0 && (
            <ul className="mt-1 rounded-lg border border-slate-200 bg-white text-sm shadow-sm">
              {matches.map((u) => <li key={u.email}><button type="button" className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => { setEmail(u.email); setMatches([]); }}>{u.name} <span className="text-slate-500">({u.email})</span></button></li>)}
            </ul>
          )}
        </Field>
        <fieldset className="space-y-2 text-sm">
          <legend className="label">Permissions</legend>
          <label className="flex items-center gap-2"><input type="checkbox" checked disabled /> View <span className="text-slate-400">(always included)</span></label>
          <label className="flex items-center gap-2"><input type="checkbox" disabled={!canGrant.download} checked={perm.download} onChange={toggle('download')} /> Download</label>
          <label className="flex items-center gap-2"><input type="checkbox" disabled={!canGrant.edit} checked={perm.edit} onChange={toggle('edit')} /> Edit <span className="text-slate-400">(upload new versions)</span></label>
          {canGrant.owner && <label className="flex items-center gap-2"><input type="checkbox" checked={perm.reshare} onChange={toggle('reshare')} /> Allow resharing</label>}
        </fieldset>
        <Field label="Access expires">
          <select className="input" value={expiry} onChange={(e) => setExpiry(e.target.value)}>
            <option value="1">in 1 day</option><option value="7">in 7 days</option><option value="30">in 30 days</option><option value="90">in 90 days</option>
            <option value="custom">custom date...</option><option value="never">never</option>
          </select>
          {expiry === 'custom' && <input className="input mt-2" type="datetime-local" required value={custom} onChange={(e) => setCustom(e.target.value)} />}
        </Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={busy}>{busy ? 'Sharing...' : 'Share'}</Button></div>
      </form>
    </Modal>
  );
}

function Versions({ id, file, reload, setError }) {
  const [versions, setVersions] = useState(null);
  const [pair, setPair] = useState([]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef();
  const a = file.access;

  const load = useCallback(() => api.get(`/files/${id}/versions`).then((r) => setVersions(r.data.versions)).catch((e) => setError(errMsg(e))), [id, setError]);
  useEffect(() => { load(); }, [load, file.currentVersion]);

  const upload = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const fd = new FormData();
    fd.append('file', f); fd.append('comment', comment);
    setBusy(true); setError('');
    try { await api.post(`/files/${id}/versions`, fd); setComment(''); reload(); } catch (err) { setError(errMsg(err)); } finally { setBusy(false); input.current.value = ''; }
  };
  const restore = async (no) => {
    if (!window.confirm(`Restore version ${no}? It will become a new latest version; history is kept.`)) return;
    try { await api.post(`/files/${id}/versions/${no}/restore`); reload(); } catch (err) { setError(errMsg(err)); }
  };
  const togglePair = (no) => setPair((p) => (p.includes(no) ? p.filter((x) => x !== no) : [...p, no].slice(-2)));
  const cmp = pair.length === 2 ? pair.map((n) => versions.find((v) => v.versionNo === n)).sort((x, y) => x.versionNo - y.versionNo) : null;

  return (
    <div className="space-y-4">
      {a.edit && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg bg-slate-50 p-4">
          <div className="min-w-[14rem] flex-1"><label className="label">Change note (optional)</label><input className="input" maxLength={300} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What changed?" /></div>
          <div><input ref={input} type="file" className="hidden" onChange={upload} /><Button disabled={busy} onClick={() => input.current.click()}>{busy ? 'Encrypting...' : 'Upload new version'}</Button></div>
        </div>
      )}
      {cmp && (
        <div className="rounded-lg border border-brand-100 bg-brand-50 p-3 text-sm">
          <b>Compare v{cmp[0].versionNo} &rarr; v{cmp[1].versionNo}:</b>{' '}
          {cmp[0].hash === cmp[1].hash ? 'identical content (same SHA-256).' : `content differs; size ${formatBytes(cmp[0].size)} \u2192 ${formatBytes(cmp[1].size)} (${cmp[1].size - cmp[0].size >= 0 ? '+' : '-'}${formatBytes(Math.abs(cmp[1].size - cmp[0].size))}).`}
        </div>
      )}
      {!versions ? <Spinner /> : (
        <ol className="relative space-y-4 border-l-2 border-slate-200 pl-6">
          {versions.map((v) => (
            <li key={v.versionNo} className="relative">
              <span className={`absolute -left-[33px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white ${v.current ? 'bg-brand-600' : 'bg-slate-400'}`} />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">Version {v.versionNo} {v.current && <Badge tone="indigo">Current</Badge>} {v.restoredFrom && <Badge tone="amber">Restored from v{v.restoredFrom}</Badge>}</p>
                  <p className="text-sm text-slate-500">{formatDate(v.createdAt)} &middot; {v.uploadedBy?.name || 'Unknown'} &middot; {formatBytes(v.size)}</p>
                  {v.comment && <p className="text-sm text-slate-600">{v.comment}</p>}
                  <p className="font-mono text-xs text-slate-400" title="SHA-256 of the plaintext">sha256 {v.hash.slice(0, 16)}&hellip;</p>
                </div>
                <div className="flex gap-1">
                  <label className="flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" checked={pair.includes(v.versionNo)} onChange={() => togglePair(v.versionNo)} /> compare</label>
                  {a.download && <Button size="sm" variant="secondary" onClick={() => fetchFile(id, { version: v.versionNo, fallbackName: file.name }).catch((e) => setError(errMsg(e)))}>Download</Button>}
                  {a.owner && !v.current && <Button size="sm" variant="secondary" onClick={() => restore(v.versionNo)}>Restore</Button>}
                </div>
              </div>
            </li>))}
        </ol>
      )}
    </div>
  );
}

function Sharing({ id, file, setError }) {
  const [perms, setPerms] = useState(null);
  const [show, setShow] = useState(false);
  const load = useCallback(() => api.get(`/files/${id}/permissions`).then((r) => setPerms(r.data.permissions)).catch((e) => setError(errMsg(e))), [id, setError]);
  useEffect(() => { load(); }, [load]);
  const revoke = async (p) => {
    if (!window.confirm(`Revoke ${p.user.email}'s access?`)) return;
    try { await api.delete(`/files/${id}/permissions/${p._id}`); load(); } catch (err) { setError(errMsg(err)); }
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => setShow(true)}>+ Share</Button></div>
      {!perms ? <Spinner /> : perms.length === 0 ? <Empty>Not shared with anyone yet.</Empty> : (
        <div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-100">
          <thead><tr><th className="th">User</th><th className="th">Access</th><th className="th">Expires</th><th className="th">Granted by</th><th className="th" /></tr></thead>
          <tbody className="divide-y divide-slate-100">{perms.map((p) => (
            <tr key={p._id}>
              <td className="td"><span className="font-medium">{p.user.name}</span><br /><span className="text-xs text-slate-500">{p.user.email}</span></td>
              <td className="td"><AccessBadges a={p} /></td>
              <td className="td text-slate-600">{p.expiresAt ? formatDate(p.expiresAt) : 'Never'}</td>
              <td className="td text-slate-600">{p.grantedByName}</td>
              <td className="td text-right"><Button size="sm" variant="danger" onClick={() => revoke(p)}>Revoke</Button></td>
            </tr>))}</tbody></table></div>
      )}
      {show && <ShareDialog fileId={id} canGrant={file.access} onClose={() => setShow(false)} onDone={() => { setShow(false); load(); }} />}
    </div>
  );
}

function Activity({ id, setError }) {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  useEffect(() => { api.get(`/files/${id}/activity`, { params: { page } }).then((r) => setData(r.data)).catch((e) => setError(errMsg(e))); }, [id, page, setError]);
  if (!data) return <Spinner />;
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-100">
        <thead><tr><th className="th">When</th><th className="th">Who</th><th className="th">Action</th><th className="th">Result</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{data.items.map((e) => (
          <tr key={e._id}><td className="td whitespace-nowrap text-slate-600">{formatDate(e.timestamp)}</td><td className="td">{e.userEmail || '-'}{e.targetEmail && <span className="text-slate-500"> &rarr; {e.targetEmail}</span>}</td>
            <td className="td">{e.action}</td><td className="td"><Badge tone={e.outcome === 'success' ? 'green' : 'red'}>{e.outcome}</Badge></td></tr>))}</tbody></table></div>
      {data.pages > 1 && <div className="flex justify-between text-sm"><Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page} of {data.pages}</span><Button size="sm" variant="secondary" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</Button></div>}
    </div>
  );
}

export default function FileDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [tab, setTab] = useState('versions');
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);

  const reload = useCallback(() => api.get(`/files/${id}`).then((r) => setFile(r.data.file)).catch((e) => (e.response?.status === 404 || e.response?.status === 403 ? setNotFound(true) : setError(errMsg(e)))), [id]);
  useEffect(() => { reload(); }, [reload]);

  if (notFound) return <Card><Empty>This file does not exist, or you no longer have access. <Link className="text-brand-600 underline" to="/shared">Back to files</Link></Empty></Card>;
  if (!file) return error ? <Alert>{error}</Alert> : <Spinner />;
  const a = file.access;
  const tabs = [['versions', 'Versions'], ...(a.reshare ? [['sharing', 'Sharing']] : []), ...(a.owner ? [['activity', 'Activity']] : [])];

  const remove = async () => {
    if (!window.confirm(`Permanently delete "${file.name}" and all of its versions? This cannot be undone.`)) return;
    try { await api.delete(`/files/${id}`); navigate('/files'); } catch (err) { setError(errMsg(err)); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="break-all text-2xl font-bold">{file.name}</h1>
          <p className="mt-1 text-sm text-slate-500">v{file.currentVersion} &middot; {formatBytes(file.size)} &middot; owner {file.ownerName} &middot; updated {formatDate(file.updatedAt)}</p>
          <div className="mt-2"><AccessBadges a={a} />{file.expiresAt && <span className="ml-2 text-xs text-amber-600">Your access expires {formatDate(file.expiresAt)}</span>}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => fetchFile(id, { inline: true }).catch((e) => setError(errMsg(e)))}>View</Button>
          {a.download && <Button variant="secondary" onClick={() => fetchFile(id, { fallbackName: file.name }).catch((e) => setError(errMsg(e)))}>Download</Button>}
          {a.owner && <Button variant="danger" onClick={remove}>Delete</Button>}
        </div>
      </div>
      <Alert>{error}</Alert>
      <Card>
        <div className="mb-4 flex gap-1 border-b border-slate-200">
          {tabs.map(([k, label]) => <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === k ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>)}
        </div>
        {tab === 'versions' && <Versions id={id} file={file} reload={reload} setError={setError} />}
        {tab === 'sharing' && a.reshare && <Sharing id={id} file={file} setError={setError} />}
        {tab === 'activity' && a.owner && <Activity id={id} setError={setError} />}
      </Card>
    </div>
  );
}
