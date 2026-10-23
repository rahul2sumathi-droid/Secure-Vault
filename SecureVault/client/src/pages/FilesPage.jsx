import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg, fetchFile } from '../api.js';
import { Alert, Badge, Button, Card, Empty, Field, Modal, Spinner, formatBytes, formatDate } from '../components/ui.jsx';

export const AccessBadges = ({ a }) => (
  <span className="flex flex-wrap gap-1">
    {a.owner ? <Badge tone="indigo">Owner</Badge> : (<>
      <Badge>View</Badge>{a.download && <Badge tone="green">Download</Badge>}{a.edit && <Badge tone="amber">Edit</Badge>}{a.reshare && <Badge tone="indigo">Reshare</Badge>}
    </>)}
  </span>
);

function UploadModal({ onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    const fd = new FormData();
    fd.append('file', file);
    try { await api.post('/files', fd); onDone(); } catch (err) { setError(errMsg(err)); setBusy(false); }
  };
  return (
    <Modal title="Upload & encrypt a file" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Alert>{error}</Alert>
        <Field label="File" hint="Encrypted with AES-256-GCM on the server before it is stored."><input className="input" type="file" required onChange={(e) => setFile(e.target.files[0])} /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={busy || !file}>{busy ? 'Encrypting...' : 'Upload'}</Button></div>
      </form>
    </Modal>
  );
}

export default function FilesPage({ scope }) {
  const [files, setFiles] = useState(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const mine = scope === 'mine';

  const load = useCallback(() => {
    api.get('/files', { params: { scope, q: q || undefined } }).then((r) => setFiles(r.data.files)).catch((e) => setError(errMsg(e)));
  }, [scope, q]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const open = (f, inline) => fetchFile(f._id, { inline, fallbackName: f.name }).catch((e) => setError(errMsg(e)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{mine ? 'My Files' : 'Shared with Me'}</h1>
        <div className="flex gap-2">
          <input className="input w-56" placeholder="Search files..." value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search files" />
          {mine && <Button onClick={() => setShowUpload(true)}>+ Upload</Button>}
        </div>
      </div>
      <Alert>{error}</Alert>
      <Card className="overflow-x-auto !p-0">
        {!files ? <Spinner /> : files.length === 0 ? <Empty>{mine ? 'No files yet. Click Upload to add one.' : 'Nothing has been shared with you yet.'}</Empty> : (
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50"><tr><th className="th">Name</th><th className="th">{mine ? 'Shared with' : 'Owner'}</th><th className="th">Access</th><th className="th">Size</th><th className="th">Modified</th><th className="th" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {files.map((f) => (
                <tr key={f._id} className="hover:bg-slate-50">
                  <td className="td"><Link className="font-medium text-brand-600 hover:underline" to={`/files/${f._id}`}>{f.name}</Link><span className="ml-2 text-xs text-slate-400">v{f.currentVersion}</span></td>
                  <td className="td text-slate-600">{mine ? (f.sharedWith ? `${f.sharedWith} user${f.sharedWith > 1 ? 's' : ''}` : 'Only me') : f.ownerName}</td>
                  <td className="td"><AccessBadges a={f.access} />{f.expiresAt && <p className="mt-1 text-xs text-amber-600">Expires {formatDate(f.expiresAt)}</p>}</td>
                  <td className="td text-slate-600">{formatBytes(f.size)}</td>
                  <td className="td text-slate-600">{formatDate(f.updatedAt)}</td>
                  <td className="td whitespace-nowrap text-right">
                    <Button size="sm" variant="ghost" onClick={() => open(f, true)}>View</Button>
                    {f.access.download && <Button size="sm" variant="ghost" onClick={() => open(f, false)}>Download</Button>}
                  </td>
                </tr>))}
            </tbody>
          </table>
        )}
      </Card>
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onDone={() => { setShowUpload(false); load(); }} />}
    </div>
  );
}
