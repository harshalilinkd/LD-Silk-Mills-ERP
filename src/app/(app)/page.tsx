import { IconApps, IconUsers, IconInbox, IconActivity } from "@tabler/icons-react";
import { EmptyState } from "@/components/shell/empty-state";
import { getDashboardCounts } from "@/lib/queries";

function KpiCard({
  icon: Icon,
  iconClass,
  value,
  label,
  sub,
  muted,
}: {
  icon: typeof IconApps;
  iconClass: string;
  value: string | number;
  label: string;
  sub: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-[10px] border border-border bg-surface p-[18px]">
      <div className="mb-3.5 flex items-center justify-between">
        <div
          className={`flex size-8 items-center justify-center rounded-lg ${iconClass}`}
        >
          <Icon className="size-[18px]" />
        </div>
      </div>
      <div
        className={
          muted
            ? "text-[15px] font-semibold text-text-3"
            : "font-mono text-[26px] font-bold tracking-[-0.02em] text-text-1"
        }
      >
        {value}
      </div>
      <div className="mt-[3px] text-xs text-text-3">
        {label} · {sub}
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const { activeSystems, totalSystems, totalUsers, systems } =
    await getDashboardCounts();
  const comingSoon = totalSystems - activeSystems;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
          Dashboard
        </h1>
        <p className="mt-1 text-[13px] text-text-3">
          Overview of LD Silk Mills ERP
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={IconApps}
          iconClass="bg-accent text-primary"
          value={activeSystems}
          label="Active systems"
          sub="Configured & live"
        />
        <KpiCard
          icon={IconUsers}
          iconClass="bg-status-blue-dim text-status-blue"
          value={totalUsers}
          label="Total users"
          sub="Across the workspace"
        />
        <KpiCard
          icon={IconInbox}
          iconClass="bg-status-amber-dim text-status-amber"
          value={comingSoon}
          label="Modules queued"
          sub="Registered, not connected"
        />
        <KpiCard
          icon={IconActivity}
          iconClass="bg-surface-2 text-text-3"
          value="No data yet"
          label="Audit events today"
          sub="Starts in Phase 2"
          muted
        />
      </div>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1.3fr_1fr]">
        <div className="rounded-[10px] border border-border bg-surface px-5 py-[18px]">
          <div className="mb-4">
            <h2 className="text-[14.5px] font-bold text-text-1">
              System status
            </h2>
            <p className="mt-0.5 text-[11.5px] text-text-3">
              From the live system registry
            </p>
          </div>
          <div>
            {systems.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 border-b border-border py-2.5 last:border-0"
              >
                <span
                  className={
                    s.status === "active"
                      ? "size-[7px] shrink-0 rounded-full bg-status-green shadow-[0_0_0_3px_var(--status-green-dim)]"
                      : "size-[7px] shrink-0 rounded-full bg-text-3"
                  }
                />
                <span className="flex-1 truncate text-[13px] font-semibold text-text-1">
                  {s.systemName}
                </span>
                <span className="text-[11px] capitalize text-text-3">
                  {s.category}
                </span>
                <span
                  className={
                    s.status === "active"
                      ? "rounded-full bg-status-green-dim px-2 py-0.5 text-[10.5px] font-semibold text-status-green"
                      : "rounded-full bg-white/5 px-2 py-0.5 text-[10.5px] font-semibold text-text-3"
                  }
                >
                  {s.status === "active" ? "Active" : "Coming soon"}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[10px] border border-border bg-surface px-5 py-[18px]">
          <div className="mb-4">
            <h2 className="text-[14.5px] font-bold text-text-1">
              Recent activity
            </h2>
            <p className="mt-0.5 text-[11.5px] text-text-3">
              Audit log feed
            </p>
          </div>
          <EmptyState
            icon={IconActivity}
            title="No activity yet"
            description="Login and access events will show up here once Phase 2 wires up authentication."
          />
        </div>
      </div>
    </div>
  );
}
