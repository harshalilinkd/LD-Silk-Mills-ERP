import { getSystemAccessMatrix } from "@/lib/queries";
import { getSystemIcon } from "@/lib/system-icons";
import { AccessCheckbox } from "./access-checkbox";

export default async function AccessControlPage() {
  const { allUsers, allSystems, accessByPair } = await getSystemAccessMatrix();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">
          Access Control
        </h1>
        <p className="text-sm text-muted-foreground">
          Toggle which systems each user can see in their sidebar. This
          controls visibility only — each system keeps its own in-app
          permissions.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="sticky left-0 bg-muted/40 px-4 py-2.5 text-left font-medium text-muted-foreground">
                User
              </th>
              {allSystems.map((system) => {
                const Icon = getSystemIcon(system.systemCode);
                return (
                  <th
                    key={system.id}
                    className="px-3 py-2.5 text-center font-medium text-muted-foreground"
                  >
                    <div className="flex flex-col items-center gap-1">
                      <Icon className="size-4" />
                      <span className="text-[11px]">{system.systemName}</span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {allUsers.map((user) => (
              <tr key={user.id} className="border-b border-border last:border-0">
                <td className="sticky left-0 bg-background px-4 py-2.5">
                  <div className="font-medium">{user.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {user.email}
                  </div>
                </td>
                {allSystems.map((system) => (
                  <td key={system.id} className="px-3 py-2.5 text-center">
                    <div className="flex justify-center">
                      <AccessCheckbox
                        userId={user.id}
                        systemId={system.id}
                        initialValue={
                          accessByPair.get(`${user.id}:${system.id}`) ?? false
                        }
                      />
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
