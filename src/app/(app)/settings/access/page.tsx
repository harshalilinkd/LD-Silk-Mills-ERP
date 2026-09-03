import { redirect } from "next/navigation";

import { isErpAdmin } from "@/lib/admin";
import { getSystemAccessMatrix } from "@/lib/queries";
import { getSystemIcon } from "@/lib/system-icons";
import { AccessCheckbox } from "./access-checkbox";

export default async function AccessControlPage() {
  // This tab guards itself — the settings layout cannot, because the profile
  // tab beside it is for everybody. Not the boundary either way: the actions
  // this screen calls each run requireErpAdmin() before reading their input.
  if (!(await isErpAdmin())) redirect("/settings");


  const { allUsers, allSystems, accessByPair } = await getSystemAccessMatrix();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-[15px] font-semibold text-text-1">
          Access Control
                </h2>
        <p className="mt-0.5 text-[13px] text-text-3">
          Toggle which systems each user can see in their sidebar. This
          controls visibility only — each system keeps its own in-app
          permissions.
                </p>
      </div>

      <div className="overflow-x-auto rounded-[10px] border border-border bg-surface">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="sticky left-0 border-b border-border bg-surface px-3.5 pb-2.5 pt-3.5 text-left text-[11px] font-bold uppercase tracking-[0.04em] text-text-1">
                User
              </th>
              {allSystems.map((system) => {
                const Icon = getSystemIcon(system.systemCode);
                return (
                  <th
                    key={system.id}
                    className="border-b border-border px-3 pb-2.5 pt-3.5 text-center text-[11px] font-semibold text-text-3"
                  >
                    <div className="flex flex-col items-center gap-1">
                      <Icon className="size-4" />
                      <span className="text-[11px] font-normal normal-case tracking-normal">
                        {system.systemName}
                      </span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="[&>tr:last-child>td]:border-b-0">
            {allUsers.map((user) => (
              <tr key={user.id}>
                <td className="sticky left-0 border-b border-border bg-surface px-3.5 py-3">
                  <div className="font-semibold text-text-1">
                    {user.name}
                  </div>
                  <div className="font-mono text-[11px] text-text-3">
                    {user.email}
                  </div>
                </td>
                {allSystems.map((system) => (
                  <td
                    key={system.id}
                    className="border-b border-border px-3 py-3 text-center"
                  >
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
