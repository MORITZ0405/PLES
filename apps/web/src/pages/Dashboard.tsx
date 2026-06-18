import { useQuery } from '@tanstack/react-query';
import { Api } from '../api';
import { Badge, Card } from '../ui';

function UsageBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit <= 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
  return (
    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-800">
      <div className="h-full bg-brand-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function Dashboard() {
  const subs = useQuery({ queryKey: ['subscriptions'], queryFn: Api.subscriptions });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-100">Dashboard</h2>
        <p className="text-sm text-slate-400">Overview of your subscriptions and resource usage.</p>
      </div>

      {subs.isLoading && <p className="text-slate-400">Loading…</p>}
      {subs.error && <p className="text-red-400">Failed to load subscriptions.</p>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {subs.data?.map((s) => {
          const limits = s.effectiveLimits as {
            maxDomains: number;
            maxDbs: number;
            maxSftpUsers: number;
          };
          return (
            <Card key={s.id}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-100">Subscription</p>
                  <p className="font-mono text-xs text-slate-500">{s.id}</p>
                </div>
                <Badge tone={s.state === 'active' ? 'green' : 'amber'}>{s.state}</Badge>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                <div>
                  <div className="flex justify-between text-slate-300">
                    <span>Domains</span>
                    <span>
                      {s.domainCount} / {limits.maxDomains}
                    </span>
                  </div>
                  <UsageBar used={s.domainCount} limit={limits.maxDomains} />
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Databases</span>
                  <span>0 / {limits.maxDbs}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>SFTP users</span>
                  <span>0 / {limits.maxSftpUsers}</span>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {subs.data && subs.data.length === 0 && (
        <Card>
          <p className="text-slate-400">No subscriptions yet.</p>
        </Card>
      )}
    </div>
  );
}
