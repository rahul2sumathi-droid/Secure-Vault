import { useEffect } from 'react';

export const formatBytes = (n = 0) => {
  if (n < 1024) return `${n} B`;
  const u = ['KB', 'MB', 'GB'];
  let i = -1;
  do { n /= 1024; i += 1; } while (n >= 1024 && i < u.length - 1);
  return `${n.toFixed(n < 10 ? 1 : 0)} ${u[i]}`;
};
export const formatDate = (d) => (d ? new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '-');
export const timeAgo = (d) => {
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
};

const variants = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-500/50',
  secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:opacity-50',
  ghost: 'text-slate-600 hover:bg-slate-100 disabled:opacity-50',
};
export function Button({ variant = 'primary', size = 'md', className = '', ...props }) {
  const sz = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-4 py-2 text-sm';
  return <button {...props} className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:cursor-not-allowed ${sz} ${variants[variant]} ${className}`} />;
}

export const Card = ({ title, action, children, className = '' }) => (
  <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
    {(title || action) && (
      <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <h2 className="font-semibold text-slate-800">{title}</h2>
        {action}
      </header>
    )}
    <div className="p-5">{children}</div>
  </section>
);

const tones = { slate: 'bg-slate-100 text-slate-700', green: 'bg-emerald-100 text-emerald-700', red: 'bg-red-100 text-red-700', amber: 'bg-amber-100 text-amber-700', indigo: 'bg-brand-100 text-brand-700' };
export const Badge = ({ tone = 'slate', children }) => <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;

export function Alert({ kind = 'error', children }) {
  if (!children) return null;
  const c = kind === 'error' ? 'border-red-200 bg-red-50 text-red-700' : kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800';
  return <div role="alert" className={`rounded-lg border px-3 py-2 text-sm ${c}`}>{children}</div>;
}

export const Spinner = ({ label = 'Loading...' }) => <p className="py-8 text-center text-sm text-slate-500">{label}</p>;
export const Empty = ({ children }) => <p className="py-8 text-center text-sm text-slate-500">{children}</p>;

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`max-h-[90vh] w-full overflow-y-auto rounded-xl bg-white shadow-xl ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="text-xl leading-none text-slate-400 hover:text-slate-700">&times;</button>
        </header>
        <div className="space-y-4 p-5">{children}</div>
      </div>
    </div>
  );
}

export const Field = ({ label, children, hint }) => (
  <div>
    <label className="label">{label}</label>
    {children}
    {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
  </div>
);

export const roleLabel = { admin: 'Admin', owner: 'File Owner', collaborator: 'Collaborator', auditor: 'Auditor' };
export const RoleBadge = ({ role }) => <Badge tone={{ admin: 'red', owner: 'indigo', collaborator: 'green', auditor: 'amber' }[role]}>{roleLabel[role] || role}</Badge>;
