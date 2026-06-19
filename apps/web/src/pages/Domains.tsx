import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Api, ApiClientError } from '../api';
import { Badge, Button, Card, Field, Input, Select } from '../ui';
import { Icon } from '../icons';

const TOOLS: { icon: string; label: string }[] = [
  { icon: 'settings', label: 'Hosting Settings' },
  { icon: 'folder', label: 'File Manager' },
  { icon: 'database', label: 'Databases' },
  { icon: 'lock', label: 'SSL/TLS' },
  { icon: 'code', label: 'PHP' },
  { icon: 'chart', label: 'Logs' },
];

export default function Domains() {
  const qc = useQueryClient();
  const subs = useQuery({ queryKey: ['subscriptions'], queryFn: Api.subscriptions });
  const [subId, setSubId] = useState('');
  const [showAdd, setShowAdd] = useState(false);

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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-ink-500">
          <span>Subscription</span>
          <Select value={subId} onChange={(e) => setSubId(e.target.value)} style={{ width: 'auto' }}>
            {subs.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id.slice(0, 8)}…
              </option>
            ))}
          </Select>
        </div>
        <Button onClick={() => setShowAdd((v) => !v)}>
          <Icon name="plus" size={16} /> Add Domain
        </Button>
      </div>

      {showAdd && (
        <Card className="p-5">
          <form
            onSubmit={onSubmit}
            className="grid grid-cols-1 gap-4 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end"
          >
            <Field label="Domain name">
              <Input placeholder="example.com" value={fqdn} onChange={(e) => setFqdn(e.target.value)} required />
            </Field>
            <Field label="PHP version">
              <Select value={phpVersion} onChange={(e) => setPhpVersion(e.target.value)}>
                <option value="">None</option>
                <option value="8.3">8.3</option>
                <option value="8.2">8.2</option>
                <option value="8.1">8.1</option>
                <option value="7.4">7.4</option>
              </Select>
            </Field>
            <Field label="HTTPS">
              <Select value={httpsMode} onChange={(e) => setHttpsMode(e.target.value as typeof httpsMode)}>
                <option value="off">Off</option>
                <option value="redirect">Redirect</option>
                <option value="only">Only</option>
              </Select>
            </Field>
            <Button type="submit" disabled={create.isPending || !subId}>
              {create.isPending ? 'Creating…' : 'Create'}
            </Button>
          </form>
          {createError && <p className="mt-3 text-sm text-red-600">{createError}</p>}
        </Card>
      )}

      {domains.data?.length === 0 && (
        <Card className="p-10 text-center">
          <p className="text-ink-500">No websites yet.</p>
          <p className="mt-1 text-sm text-ink-400">Click “Add Domain” to create your first site.</p>
        </Card>
      )}

      {domains.data?.map((d) => (
        <Card key={d.id} className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <Icon name="globe" size={20} />
              </div>
              <div>
                <a
                  href={`http://${d.fqdn}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-brand-700 hover:underline"
                >
                  {d.fqdn}
                </a>
                <div className="mt-0.5 flex items-center gap-2">
                  <Badge tone={d.vhostState === 'live' ? 'green' : d.vhostState === 'pending' ? 'amber' : 'ink'}>
                    {d.vhostState}
                  </Badge>
                  {d.phpVersion && <Badge tone="ink">PHP {d.phpVersion}</Badge>}
                  <Badge tone={d.httpsMode === 'off' ? 'ink' : 'green'}>
                    HTTPS {d.httpsMode}
                  </Badge>
                </div>
              </div>
            </div>
            <a
              href={`http://${d.fqdn}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-800"
            >
              <Icon name="external" size={16} /> Open
            </a>
          </div>

          <div className="flex flex-wrap gap-2 p-4">
            {TOOLS.map((t) => (
              <span
                key={t.label}
                title="Coming soon"
                className="inline-flex cursor-default items-center gap-2 rounded-md border border-ink-200 bg-white px-3 py-2 text-sm text-ink-600"
              >
                <Icon name={t.icon} size={16} />
                {t.label}
              </span>
            ))}
          </div>

          <div className="border-t border-ink-100 bg-ink-50 px-4 py-2 font-mono text-xs text-ink-400">
            {d.docRoot}
          </div>
        </Card>
      ))}
    </div>
  );
}
