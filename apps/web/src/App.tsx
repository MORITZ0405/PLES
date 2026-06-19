import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Api } from './api';
import { Icon } from './icons';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Domains from './pages/Domains';

type Page = 'domains' | 'stats';

interface NavItem {
  key: string;
  label: string;
  icon: string;
  page?: Page;
  soon?: boolean;
}

const NAV: NavItem[] = [
  { key: 'domains', label: 'Websites & Domains', icon: 'globe', page: 'domains' },
  { key: 'mail', label: 'E-Mail', icon: 'mail', soon: true },
  { key: 'files', label: 'Dateien', icon: 'folder', soon: true },
  { key: 'db', label: 'Datenbanken', icon: 'database', soon: true },
  { key: 'stats', label: 'Statistiken', icon: 'chart', page: 'stats' },
  { key: 'tools', label: 'Tools & Einstellungen', icon: 'settings', soon: true },
  { key: 'users', label: 'Benutzer', icon: 'user', soon: true },
  { key: 'profile', label: 'Mein Profil', icon: 'user', soon: true },
];

export default function App() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: Api.me });
  const [page, setPage] = useState<Page>('domains');

  const logout = useMutation({
    mutationFn: Api.logout,
    onSuccess: () => qc.setQueryData(['me'], null),
  });

  if (me.isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-ink-400">Lädt…</div>;
  }
  if (me.error || !me.data) return <Login />;

  const initials = me.data.email.slice(0, 2).toUpperCase();

  return (
    <div className="flex min-h-screen bg-ink-100">
      {/* Dark sidebar */}
      <aside className="flex w-60 flex-col bg-navy-800 text-ink-300">
        <div className="flex h-14 items-center gap-2 px-5">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-brand-500 text-sm font-bold text-white">
            L
          </div>
          <span className="text-lg font-semibold lowercase tracking-tight text-white">lest</span>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3 text-sm">
          {NAV.map((item) => {
            const active = item.page && page === item.page;
            return (
              <button
                key={item.key}
                disabled={item.soon}
                onClick={() => item.page && setPage(item.page)}
                className={`flex w-full items-center gap-3 rounded border-l-2 px-3 py-2 text-left transition ${
                  active
                    ? 'border-brand-400 bg-navy-700 font-medium text-white'
                    : item.soon
                      ? 'cursor-not-allowed border-transparent text-ink-500'
                      : 'border-transparent text-ink-300 hover:bg-navy-700 hover:text-white'
                }`}
              >
                <Icon name={item.icon} size={18} />
                <span className="flex-1">{item.label}</span>
                {item.soon && <span className="text-[9px] uppercase text-ink-600">soon</span>}
              </button>
            );
          })}
        </nav>
        <div className="px-4 py-3 text-[11px] text-ink-600">LEST · preview</div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center gap-4 border-b border-ink-200 bg-white px-6">
          <div className="relative max-w-md flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400">
              <Icon name="search" size={16} />
            </span>
            <input
              placeholder="Suchen…"
              className="w-full rounded border border-ink-200 bg-ink-50 py-2 pl-9 pr-3 text-sm text-ink-700 outline-none focus:border-brand-400 focus:bg-white"
            />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-sm text-ink-600">
              <Icon name="user" size={16} />
              {me.data.email.split('@')[0]}
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
              {initials}
            </div>
            <button
              onClick={() => logout.mutate()}
              title="Abmelden"
              className="rounded p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
            >
              <Icon name="logout" size={18} />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">
          {page === 'domains' && <Domains />}
          {page === 'stats' && <Dashboard />}
        </main>
      </div>
    </div>
  );
}
