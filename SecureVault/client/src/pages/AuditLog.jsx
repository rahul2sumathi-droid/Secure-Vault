import { useCallback, useEffect, useState } from 'react';
import api, { errMsg, saveBlob } from '../api.js';
import { Alert, Badge, Button, Card, Empty, Field, Spinner, formatDate } from '../components/ui.jsx';

export default function AuditLog() {
  const [filters, setFilters] = useState({ action: '', outcome: '', email: '', from: '', to: '' });
  const [applied, setApplied] = useState(filters);
  const [actions, setActions] = useState([]);
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [verify, setVerify] = useState(null);
  const [error, setError] = useState('');

  const clean = (f) => Object.fromEntries(Object.entries(f).filter(([, v]) => v));
  const load = useCallback(() => api.get('/audit', { params: { ...clean(applied), page } }).then((r) => setData(r.data)).catch((e) => setError(errMsg(e))), [applied, page]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get('/audit/actions').then((r) => setActions(r.data.actions)).catch(() => {}); }, []);

  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  const exportCsv = () => saveBlob('/audit/export', clean(applied), 'audit-report.csv').catch((e) => setError(errMsg(e)));
  const runVerify = () => api.get('/audit/verify').then((r) => setVerify(r.data)).catch((e) => setError(errMsg(e)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <div className="flex gap-2"><Button variant="secondary" onClick={runVerify}>Verify integrity</Button><Button onClick={exportCsv}>Export CSV</Button></div>
      </div>
      <Alert>{error}</Alert>
      {verify && (verify.valid
        ? <Alert kind="success">Hash chain intact: {verify.checked} entries verified. Head hash <span className="font-mono text-xs">{verify.headHash.slice(0, 24)}&hellip;</span> (record it externally to detect truncation).</Alert>
        : <Alert>Integrity check FAILED at entry #{verify.brokenAtSeq}. Records may have been altered.</Alert>)}
      <Card>
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6" onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(filters); }}>
          <Field label="Action"><select className="input" value={filters.action} onChange={set('action')}><option value="">All</option>{actions.map((a) => <option key={a}>{a}</option>)}</select></Field>
          <Field label="Result"><select className="input" value={filters.outcome} onChange={set('outcome')}><option value="">All</option><option>success</option><option>failure</option><option>denied</option></select></Field>
          <Field label="User email starts with"><input className="input" value={filters.email} onChange={set('email')} /></Field>
          <Field label="From"><input className="input" type="date" value={filters.from} onChange={set('from')} /></Field>
          <Field label="To"><input className="input" type="date" value={filters.to} onChange={set('to')} /></Field>
          <div className="flex items-end gap-2"><Button>Filter</Button><Button type="button" variant="ghost" onClick={() => { const e = { action: '', outcome: '', email: '', from: '', to: '' }; setFilters(e); setApplied(e); setPage(1); }}>Reset</Button></div>
        </form>
      </Card>
      <Card className="overflow-x-auto !p-0">
        {!data ? <Spinner /> : data.items.length === 0 ? <Empty>No matching records.</Empty> : (
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50"><tr><th className="th">#</th><th className="th">Time</th><th className="th">User</th><th className="th">Action</th><th className="th">Result</th><th className="th">File / target</th><th className="th">IP</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{data.items.map((e) => (
              <tr key={e._id} className="align-top hover:bg-slate-50">
                <td className="td text-slate-400">{e.seq}</td><td className="td whitespace-nowrap text-slate-600">{formatDate(e.timestamp)}</td>
                <td className="td">{e.userEmail || '-'}<br /><span className="text-xs text-slate-400">{e.userRole}</span></td>
                <td className="td">{e.action}{e.details && Object.keys(e.details).length > 0 && <p className="max-w-xs break-all font-mono text-xs text-slate-400">{JSON.stringify(e.details)}</p>}</td>
                <td className="td"><Badge tone={e.outcome === 'success' ? 'green' : 'red'}>{e.outcome}</Badge></td>
                <td className="td">{e.fileName || ''}{e.targetEmail && <span className="text-slate-500"> {e.fileName ? '\u2192 ' : ''}{e.targetEmail}</span>}</td>
                <td className="td text-slate-500">{e.ip}</td>
              </tr>))}</tbody>
          </table>
        )}
      </Card>
      {data && data.pages > 1 && <div className="flex items-center justify-between text-sm"><Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page} of {data.pages} ({data.total} records)</span><Button size="sm" variant="secondary" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</Button></div>}
    </div>
  );
}
