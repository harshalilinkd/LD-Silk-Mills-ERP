import { IconHistory } from "@tabler/icons-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shell/empty-state";
import { getRecentAuditLogs } from "@/lib/queries";

export default async function AuditLogsPage() {
  const logs = await getRecentAuditLogs();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Audit Logs</h1>
        <p className="text-sm text-muted-foreground">
          Read-only history of ERP-level events (logins, system opens,
          access changes).
        </p>
      </div>

      <div className="rounded-lg border border-border">
        {logs.length === 0 ? (
          <EmptyState
            icon={IconHistory}
            title="No activity logged yet"
            description="Login and system-open events will start appearing here once Phase 2 wires up event logging."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>System</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-muted-foreground">
                    {log.createdAt.toLocaleString("en-US")}
                  </TableCell>
                  <TableCell>{log.userId ?? "system"}</TableCell>
                  <TableCell>{log.action}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {log.systemCode ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
