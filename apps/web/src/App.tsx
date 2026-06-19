import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Api } from './api';
import { Icon } from './icons';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Domains from './pages/Domains';

type Page = 'home' | 'domains';

interface NavItem {
  key: Page | string;
  label: string;
  icon: string;
  page?: Page;
  soon?: boolean;
}

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: '',
    items: [
      { key: 'home', label: 'Home', icon: 'home', page: 'home' },
      { key: 'domains', label: 'Websites & Domains', icon: 'globe', page: 'domains' },
    ],
  },
  {
    group: 'Services',
    items: [
      { key: 'db', label: 'Databases', icon: 'database', soon: true },
      { key: 'mail', label: 'Mail', icon: 'mail', soon: true },
      { key: 'files', label: 'Files', icon: 'folder', soon: true },
    ],
  },
  {
    group: 'Server',
    items: [
      { key: 'stats', label: 'Statistics', icon: 'chart', soon: true },
      { key: 'account', label: 'Account', icon: 'user', soon: true },
    ],
  },
];

const TITLES: Record<Page, string> = { home: 'Home', domains: 'Websites & Domains' };

export default function App() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: Api.me });
  const [page, setPage] = useState<Page>('home');

  const logout = useMutation({
    mutationFn: Api.logout,
    onSuccess: () => qc.setQueryData(['me'], null),
  });

  if (me.isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-ink-400">Loading…</div>;
  }
  if (me.error || !me.data) return <Login />;

  const initials = me.data.email.slice(0, 2).toUpperCase();

  return (
    <div className="flex min-h-screen bg-ink-100">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r border-ink-200 bg-white">
        <div className="flex h-14 items-center gap-2.5 border-b border-ink-200 px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-base font-bold text-white">
            L
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-ink-800">LEST</div>
            <div className="text-[10px] uppercase tracking-wider text-ink-400">Server Panel</div>
          </div>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {NAV.map((section, i) => (
            <div key={i}>
              {section.group && (
                <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
                  {section.group}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = item.page && page === item.page;
                  return (
                    <button
                      key={item.key}
                      disabled={item.soon}
                      onClick={() => item.page && setPage(item.page)}
                      className={`flex w-full items-center gap-3 rounded-md border-l-2 px-3 py-2 text-sm transition ${
                        active
                          ? 'border-brand-600 bg-brand-50 font-medium text-brand-700'
                          : item.soon
                            ? 'cursor-not-allowed border-transparent text-ink-300'
                            : 'border-transparent text-ink-600 hover:bg-ink-100'
                      }`}
                    >
                      <Icon name={item.icon} size={18} />
                      <span className="flex-1 text-left">{item.label}</span>
                      {item.soon && <span className="text-[9px] uppercase text-ink-300">soon</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-ink-200 bg-white px-6">
          <h1 className="text-base font-semibold text-ink-800">{TITLES[page]}</h1>
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <div className="text-sm text-ink-700">{me.data.email}</div>
              <div className="text-[11px] capitalize text-ink-400">{me.data.role}</div>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
              {initials}
            </div>
            <button
              onClick={() => logout.mutate()}
              title="Sign out"
              className="rounded-md p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
            >
              <Icon name="logout" size={18} />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-5xl">
            {page === 'home' && <Dashboard />}
            {page === 'domains' && <Domains />}
          </div>
        </main>
      </div>
    </div>
  );
}
