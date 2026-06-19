import { useQuery } from '@tanstack/react-query';
import { Api } from '../api';
import { Badge, Card } from '../ui';
import { Icon } from '../icons';

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const unlimited = limit < 0;
  const pct = unlimited || limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="text-ink-600">{label}</span>
        <span className="font-medium text-ink-800">
          {used} {unlimited ? '' : `/ ${limit}`}
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-ink-100">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const subs = useQuery({ queryKey: ['subscriptions'], queryFn: Api.subscriptions });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <Card className="p-5 md:col-span-1">
          <div className="mb-3 flex items-center gap-2 text-ink-700">
            <Icon name="server" size={18} />
            <span className="font-medium">Server</span>
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-500">Hostname</dt>
              <dd className="text-ink-800">localhost</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">Status</dt>
              <dd>
                <Badge tone="green">online</Badge>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">Mode</dt>
              <dd>
                <Badge tone="amber">preview</Badge>
              </dd>
            </div>
          </dl>
        </Card>

        <Card className="p-5 md:col-span-2">
          <div className="mb-3 flex items-center gap-2 text-ink-700">
            <Icon name="shield" size={18} />
            <span className="font-medium">Welcome</span>
          </div>
          <p className="text-sm leading-relaxed text-ink-600">
            This is your LEST control panel. Manage your websites and domains, databases and
            certificates from one place. Head to <span className="font-medium text-ink-800">Websites
            &amp; Domains</span> to add your first site — LEST generates the nginx configuration for you.
          </p>
        </Card>
      </div>

      {subs.isLoading && <p className="text-ink-400">Loading…</p>}
      {subs.error && <p className="text-red-600">Failed to load subscriptions.</p>}

      {subs.data?.map((s) => {
        const limits = s.effectiveLimits as {
          maxDomains: number;
          maxDbs: number;
          diskMb: number;
        };
        return (
          <Card key={s.id} className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium text-ink-800">Subscription</span>
                <span className="font-mono text-xs text-ink-400">{s.id.slice(0, 8)}</span>
              </div>
              <Badge tone={s.state === 'active' ? 'green' : 'amber'}>{s.state}</Badge>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Meter label="Domains" used={s.domainCount} limit={limits.maxDomains} />
              <Meter label="Databases" used={0} limit={limits.maxDbs} />
              <Meter label="Disk (MB)" used={0} limit={limits.diskMb} />
            </div>
          </Card>
        );
      })}
    </div>
  );
}
