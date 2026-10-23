import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { RoleBadge } from './ui.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', roles: ['admin', 'owner', 'collaborator', 'auditor'], end: true },
  { to: '/files', label: 'My Files', roles: ['owner'] },
  { to: '/shared', label: 'Shared with Me', roles: ['owner', 'collaborator'] },
  { to: '/audit', label: 'Audit Log', roles: ['admin', 'auditor'] },
  { to: '/admin', label: 'Users & Access', roles: ['admin'] },
  { to: '/security', label: 'Security', roles: ['admin', 'owner', 'collaborator', 'auditor'] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const link = ({ isActive }) => `block rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-brand-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`;

  return (
    <div className="min-h-screen md:flex">
      <aside className={`${open ? 'block' : 'hidden'} w-full shrink-0 bg-slate-900 p-4 md:block md:w-60`}>
        <div className="mb-6 flex items-center gap-2 px-2 text-lg font-bold text-white">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600">&#128274;</span> SecureVault
        </div>
        <nav className="space-y-1" onClick={() => setOpen(false)}>
          {NAV.filter((n) => n.roles.includes(user.role)).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={link}>{n.label}</NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <button className="rounded-lg border px-2 py-1 text-sm md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Toggle menu">&#9776; Menu</button>
          <div className="hidden md:block" />
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-right sm:block"><span className="block font-medium">{user.name}</span><span className="block text-xs text-slate-500">{user.email}</span></span>
            <RoleBadge role={user.role} />
            <button className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50" onClick={async () => { await logout(); navigate('/login'); }}>Sign out</button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8"><Outlet /></main>
      </div>
    </div>
  );
}
