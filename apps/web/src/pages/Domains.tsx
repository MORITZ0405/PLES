import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Api, ApiClientError } from '../api';
import { Badge, Button, Card, Field, Input, Select } from '../ui';

export default function Domains() {
  const qc = useQueryClient();
  const subs = useQuery({ queryKey: ['subscriptions'], queryFn: Api.subscriptions });
  const [subId, setSubId] = useState<string>('');

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
    mutationFn: () =>
      Api.createDomain(subId, {
        fqdn,
        phpVersion: phpVersion || null,
        httpsMode,
      }),
    onSuccess: () => {
      setFqdn('');
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
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-100">Domains &amp; Websites</h2>
          <p className="text-sm text-slate-400">
            Create domains; LEST generates the nginx vhost and php-fpm pool.
          </p>
        </div>
        <div className="w-72">
          <Field label="Subscription">
            <Select value={subId} onChange={(e) => setSubId(e.target.value)}>
              {subs.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      <Card>
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end">
          <Field label="Domain (FQDN)">
            <Input
              placeholder="example.com"
              value={fqdn}
              onChange={(e) => setFqdn(e.target.value)}
              required
            />
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
            {create.isPending ? 'Creating…' : 'Add domain'}
          </Button>
        </form>
        {createError && <p className="mt-3 text-sm text-red-400">{createError}</p>}
      </Card>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-slate-400">
              <th className="px-5 py-3 font-medium">Domain</th>
              <th className="px-5 py-3 font-medium">PHP</th>
              <th className="px-5 py-3 font-medium">HTTPS</th>
              <th className="px-5 py-3 font-medium">vhost</th>
              <th className="px-5 py-3 font-medium">Document root</th>
            </tr>
          </thead>
          <tbody>
            {domains.data?.map((d) => (
              <tr key={d.id} className="border-b border-slate-800/60 last:border-0">
                <td className="px-5 py-3 font-medium text-slate-100">{d.fqdn}</td>
                <td className="px-5 py-3 text-slate-300">{d.phpVersion ?? '—'}</td>
                <td className="px-5 py-3 text-slate-300">{d.httpsMode}</td>
                <td className="px-5 py-3">
                  <Badge tone={d.vhostState === 'live' ? 'green' : d.vhostState === 'pending' ? 'amber' : 'slate'}>
                    {d.vhostState}
                  </Badge>
                </td>
                <td className="px-5 py-3 font-mono text-xs text-slate-500">{d.docRoot}</td>
              </tr>
            ))}
            {domains.data && domains.data.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-slate-500">
                  No domains yet. Add your first one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
