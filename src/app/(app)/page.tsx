import { IconApps, IconUsers, IconActivity, IconServer2 } from "@tabler/icons-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shell/empty-state";
import { getDashboardCounts } from "@/lib/queries";

export default async function DashboardPage() {
  const { activeSystems, totalSystems, totalUsers, systems } =
    await getDashboardCounts();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overview of the LD Silk Mills ERP shell.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Systems
            </CardTitle>
            <IconApps className="size-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{activeSystems}</div>
            <p className="text-xs text-muted-foreground">
              of {totalSystems} registered
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Users
            </CardTitle>
            <IconUsers className="size-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{totalUsers}</div>
            <p className="text-xs text-muted-foreground">provisioned in ERP</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Recent Activity
            </CardTitle>
            <IconActivity className="size-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">No activity yet</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              System Status
            </CardTitle>
            <IconServer2 className="size-4 text-primary" />
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            {systems.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between text-xs"
              >
                <span className="truncate text-muted-foreground">
                  {s.systemName}
                </span>
                <span
                  className={
                    "size-1.5 shrink-0 rounded-full " +
                    (s.status === "active" ? "bg-primary" : "bg-muted-foreground/40")
                  }
                />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Activity Feed</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={IconActivity}
            title="No activity yet"
            description="Once systems start logging events (logins, module opens), they'll show up here."
          />
        </CardContent>
      </Card>
    </div>
  );
}
