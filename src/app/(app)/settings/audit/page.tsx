import { redirect } from "next/navigation";

import { isErpAdmin } from "@/lib/admin";
import { IconHistory } from "@tabler/icons-react";
import { EmptyState } from "@/components/shell/empty-state";
import { getRecentAuditLogs } from "@/lib/queries";

const TH =
  "border-b border-border px-3.5 pb-2.5 pt-3.5 text-left text-[11px] font-bold uppercase tracking-[0.04em] text-text-1";
const TD = "border-b border-border px-3.5 py-3";

export default async function AuditLogsPage() {
  // This tab guards itself — the settings layout cannot, because the profile
  // tab beside it is for everybody. Not the boundary either way: the actions
  // this screen calls each run requireErpAdmin() before reading their input.
  if (!(await isErpAdmin())) redirect("/settings");

  const logs = await getRecentAuditLogs();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-[15px] font-semibold text-text-1">Audit Logs</h2>
        <p className="mt-0.5 text-[13px] text-text-3">
          Read-only history of ERP-level events (logins, system opens, access
          changes).
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
          <>
            <div className="hidden overflow-x-auto lg:block">
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
                      <td className={`${TD} num text-text-2`}>
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

            <div className="flex flex-col gap-2 p-3 lg:hidden">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-card border border-border bg-surface-2 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-[13px] font-medium text-text-1">
                      {log.action}
                    </div>
                    <span className="shrink-0 text-[12px] text-text-3">
                      {log.systemCode ?? "—"}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[12px] text-text-3">
                    <span>{log.userId ?? "system"}</span>
                    <span className="num">
                      {log.createdAt.toLocaleString("en-US")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
