import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Api } from './api';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Domains from './pages/Domains';

type Page = 'dashboard' | 'domains';

const NAV: Array<{ key: Page; label: string; icon: string; soon?: boolean }> = [
  { key: 'dashboard', label: 'Dashboard', icon: '▦' },
  { key: 'domains', label: 'Domains', icon: '🌐' },
];

const SOON = ['Databases', 'SSL / Certificates', 'Customers', 'SFTP', 'Audit log'];

export default function App() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: Api.me });
  const [page, setPage] = useState<Page>('dashboard');

  const logout = useMutation({
    mutationFn: Api.logout,
    onSuccess: () => {
      qc.setQueryData(['me'], null);
    },
  });

  if (me.isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Loading…</div>;
  }
  if (me.error || !me.data) {
    return <Login />;
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 flex-col border-r border-slate-800 bg-slate-900/40 p-4">
        <div className="mb-6 flex items-center gap-2 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 font-black text-slate-950">
            L
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-100">LEST</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Control Panel</p>
          </div>
        </div>

        <nav className="space-y-1">
          {NAV.map((item) => (
            <button
              key={item.key}
              onClick={() => setPage(item.key)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                page === item.key
                  ? 'bg-brand-500/15 text-brand-300'
                  : 'text-slate-300 hover:bg-slate-800/60'
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
          <p className="px-3 pb-1 pt-4 text-[10px] uppercase tracking-wider text-slate-600">Coming soon</p>
          {SOON.map((label) => (
            <span
              key={label}
              className="flex w-full cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600"
            >
              <span>○</span>
              {label}
            </span>
          ))}
        </nav>

        <div className="mt-auto rounded-lg bg-slate-800/40 p-3 text-xs">
          <p className="truncate text-slate-300">{me.data.email}</p>
          <p className="mb-2 text-slate-500">{me.data.role}</p>
          <button
            onClick={() => logout.mutate()}
            className="text-brand-400 hover:text-brand-300"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto p-8">
        <div className="mx-auto max-w-5xl">
          {page === 'dashboard' && <Dashboard />}
          {page === 'domains' && <Domains />}
        </div>
      </main>
    </div>
  );
}
