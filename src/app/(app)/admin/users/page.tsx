import { IconUsers } from "@tabler/icons-react";
import { EmptyState } from "@/components/shell/empty-state";
import { requireErpAdmin } from "@/lib/admin";
import { getAllUsersOrdered } from "@/lib/queries";
import { UserEditDialog } from "./user-edit-dialog";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default async function UsersAdminPage() {
  // The layout above has already refused anybody who is not an admin, so this
  // cannot throw in practice. It is called for the ID, which the dialog needs
  // in order to disable the two controls an admin must not use on themselves.
  const admin = await requireErpAdmin();
  const allUsers = await getAllUsersOrdered();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
          Users
        </h1>
        <p className="mt-1 text-[13px] text-text-3">
          {allUsers.length} people in the LD Silk Mills workspace
        </p>
      </div>

      <div className="rounded-[10px] border border-border bg-surface">
        {allUsers.length === 0 ? (
          <EmptyState icon={IconUsers} title="No users yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className="border-b border-border px-3.5 pb-2.5 pt-3.5 text-left text-[11px] font-bold uppercase tracking-[0.04em] text-text-1">
                    Name
                  </th>
                  <th className="border-b border-border px-3.5 pb-2.5 pt-3.5 text-left text-[11px] font-bold uppercase tracking-[0.04em] text-text-1">
                    Email
                  </th>
                  <th className="border-b border-border px-3.5 pb-2.5 pt-3.5 text-left text-[11px] font-bold uppercase tracking-[0.04em] text-text-1">
                    Status
                  </th>
                  <th className="border-b border-border px-3.5 pb-2.5 pt-3.5 text-left text-[11px] font-bold uppercase tracking-[0.04em] text-text-1">
                    Joined
                  </th>
                  <th className="w-10 border-b border-border px-3.5 pb-2.5 pt-3.5" />
                </tr>
              </thead>
              <tbody className="[&>tr:last-child>td]:border-b-0">
                {allUsers.map((user) => (
                  <tr key={user.id}>
                    <td className="border-b border-border px-3.5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border-strong bg-surface-3 text-[10px] font-bold text-accent-text">
                          {user.avatar ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={user.avatar}
                              alt={user.name}
                              className="size-full object-cover"
                            />
                          ) : (
                            initials(user.name)
                          )}
                        </div>
                        <span className="font-semibold text-text-1">
                          {user.name}
                        </span>
                      </div>
                    </td>
                    <td className="border-b border-border px-3.5 py-3 font-mono text-text-2">
                      {user.email}
                    </td>
                    <td className="border-b border-border px-3.5 py-3">
                      <span
                        className={
                          user.status === "active"
                            ? "rounded-full bg-status-green-dim px-2 py-0.5 text-[10.5px] font-semibold capitalize text-status-green"
                            : "rounded-full bg-chip px-2 py-0.5 text-[10.5px] font-semibold capitalize text-text-3"
                        }
                      >
                        {user.status}
                      </span>
                    </td>
                    <td className="border-b border-border px-3.5 py-3 text-text-2">
                      {user.createdAt.toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="border-b border-border px-3.5 py-3">
                      <UserEditDialog user={user} isSelf={user.id === admin.id} />
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
