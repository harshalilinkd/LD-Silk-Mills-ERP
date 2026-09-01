import { IconHistory } from "@tabler/icons-react";
import { EmptyState } from "@/components/shell/empty-state";
import { getRecentAuditLogs } from "@/lib/queries";

const TH =
  "border-b border-border px-3.5 pb-2.5 pt-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-text-3";
const TD = "border-b border-border px-3.5 py-3";

export default async function AuditLogsPage() {
  const logs = await getRecentAuditLogs();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
          Audit Logs
        </h1>
        <p className="mt-1 text-[13px] text-text-3">
          Read-only history of ERP-level events (logins, system opens,
          access changes).
        </p>
      </div>

      <div className="rounded-[10px] border border-border bg-surface">
        {logs.length === 0 ? (
          <EmptyState
            icon={IconHistory}
            title="No audit events yet"
            description="Events will appear here once Phase 2 login tracking is live."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className={TH}>When</th>
                  <th className={TH}>User</th>
                  <th className={TH}>Action</th>
                  <th className={TH}>System</th>
                </tr>
              </thead>
              <tbody className="[&>tr:last-child>td]:border-b-0">
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className={`${TD} font-mono text-text-2`}>
                      {log.createdAt.toLocaleString("en-US")}
                    </td>
                    <td className={`${TD} text-text-2`}>
                      {log.userId ?? "system"}
                    </td>
                    <td className={`${TD} text-text-1`}>{log.action}</td>
                    <td className={`${TD} text-text-2`}>
                      {log.systemCode ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
