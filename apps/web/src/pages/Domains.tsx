import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Api, ApiClientError } from '../api';
import { Button, Card, Field, Input, Select, StatusDot } from '../ui';
import { Icon } from '../icons';

const STATUS: Record<string, { label: string; tone: 'green' | 'amber' | 'red' }> = {
  live: { label: 'Aktiv', tone: 'green' },
  pending: { label: 'Ausstehend', tone: 'amber' },
  disabled: { label: 'Gesperrt', tone: 'red' },
};

const ROW_ACTIONS = [
  { icon: 'folder', title: 'Dateien' },
  { icon: 'mail', title: 'E-Mail' },
  { icon: 'database', title: 'Datenbanken' },
  { icon: 'sliders', title: 'Hosting-Einstellungen' },
  { icon: 'dots', title: 'Mehr' },
];

export default function Domains() {
  const qc = useQueryClient();
  const subs = useQuery({ queryKey: ['subscriptions'], queryFn: Api.subscriptions });
  const [subId, setSubId] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!subId && subs.data && subs.data.length > 0) setSubId(subs.data[0]!.id);
  }, [subs.data, subId]);

  const domains = useQuery({
    queryKey: ['domains', subId],
    queryFn: () => Api.domains(subId),
    enabled: Boolean(subId),
  });

  const [fqdn, setFqdn] = useState('');
  const [phpVersion, setPhpVersion] = useState('8.2');
  const [httpsMode, setHttpsMode] = useState<'off' | 'redirect' | 'only'>('off');

  const create = useMutation({
    mutationFn: () => Api.createDomain(subId, { fqdn, phpVersion: phpVersion || null, httpsMode }),
    onSuccess: () => {
      setFqdn('');
      setShowAdd(false);
      qc.invalidateQueries({ queryKey: ['domains', subId] });
      qc.invalidateQueries({ queryKey: ['subscriptions'] });
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (subId && fqdn) create.mutate();
  };

  const createError = create.error instanceof ApiClientError ? create.error.message : null;
  const list = (domains.data ?? []).filter((d) => d.fqdn.includes(search.toLowerCase()));

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink-800">Websites &amp; Domains</h1>
        {(subs.data?.length ?? 0) > 1 && (
          <Select value={subId} onChange={(e) => setSubId(e.target.value)}>
            {subs.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id.slice(0, 8)}…
              </option>
            ))}
          </Select>
        )}
      </div>
      <p className="mb-4 text-sm text-ink-500">{domains.data?.length ?? 0} Elemente insgesamt</p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button onClick={() => setShowAdd((v) => !v)}>
          <Icon name="plus" size={16} /> Domain hinzufügen
        </Button>
        <Button variant="secondary" disabled title="Bald verfügbar">
          Subdomain hinzufügen
        </Button>
        <Button variant="secondary" disabled title="Bald verfügbar">
          Domain-Alias hinzufügen
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <button className="rounded border border-ink-300 bg-white p-2 text-ink-500 hover:bg-ink-100" title="Filter">
            <Icon name="filter" size={16} />
          </button>
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400">
              <Icon name="search" size={15} />
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Domain suchen…"
              className="w-48 rounded border border-ink-300 bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-brand-500"
            />
          </div>
        </div>
      </div>

      {showAdd && (
        <Card className="mb-4 p-5">
          <form
            onSubmit={onSubmit}
            className="grid grid-cols-1 gap-4 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end"
          >
            <Field label="Domainname">
              <Input placeholder="example.com" value={fqdn} onChange={(e) => setFqdn(e.target.value)} required />
            </Field>
            <Field label="PHP-Version">
              <Select className="w-full" value={phpVersion} onChange={(e) => setPhpVersion(e.target.value)}>
                <option value="">Keine</option>
                <option value="8.3">8.3</option>
                <option value="8.2">8.2</option>
                <option value="8.1">8.1</option>
                <option value="7.4">7.4</option>
              </Select>
            </Field>
            <Field label="HTTPS">
              <Select className="w-full" value={httpsMode} onChange={(e) => setHttpsMode(e.target.value as typeof httpsMode)}>
                <option value="off">Aus</option>
                <option value="redirect">Weiterleitung</option>
                <option value="only">Nur HTTPS</option>
              </Select>
            </Field>
            <Button type="submit" disabled={create.isPending || !subId}>
              {create.isPending ? 'Erstelle…' : 'Erstellen'}
            </Button>
          </form>
          {createError && <p className="mt-3 text-sm text-red-600">{createError}</p>}
        </Card>
      )}

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-200 text-left text-xs font-medium uppercase tracking-wide text-ink-400">
              <th className="px-4 py-3">Domainname</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Speicherplatzbelegung</th>
              <th className="px-4 py-3">Verkehr</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {list.map((d) => {
              const st = STATUS[d.vhostState] ?? STATUS.pending!;
              return (
                <tr key={d.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-50 text-[10px] font-semibold uppercase text-brand-600">
                        {d.fqdn.slice(0, 1)}
                      </span>
                      <a
                        href={`http://${d.fqdn}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-brand-600 hover:underline"
                      >
                        {d.fqdn}
                      </a>
                      {d.phpVersion && (
                        <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[11px] text-ink-500">
                          PHP {d.phpVersion}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-ink-600">
                      <StatusDot tone={st.tone} /> {st.label}
                      <Icon name="chevron" size={14} className="text-ink-400" />
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink-500">— MB</td>
                  <td className="px-4 py-3 text-ink-500">— MB/Monat</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1 text-ink-400">
                      {ROW_ACTIONS.map((a) => (
                        <button
                          key={a.icon}
                          title={a.title}
                          className="rounded p-1.5 hover:bg-ink-100 hover:text-ink-700"
                        >
                          <Icon name={a.icon} size={17} />
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
            {list.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-ink-400">
                  {domains.isLoading ? 'Lädt…' : 'Keine Domains. Klick „Domain hinzufügen“.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
