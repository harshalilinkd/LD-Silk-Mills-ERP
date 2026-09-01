import { getAllSystemsOrdered } from "@/lib/queries";
import { getSystemIcon } from "@/lib/system-icons";
import { SystemEditDialog } from "./system-edit-dialog";

const TH =
  "border-b border-border px-3.5 pb-2.5 pt-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-text-3";
const TD = "border-b border-border px-3.5 py-3";

export default async function SystemRegistryPage() {
  const allSystems = await getAllSystemsOrdered();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
          System Registry
        </h1>
        <p className="mt-1 text-[13px] text-text-3">
          Add or update a system here — the sidebar reads from this list
        </p>
      </div>

      <div className="rounded-[10px] border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <th className={TH}>System</th>
                <th className={TH}>Category</th>
                <th className={TH}>Status</th>
                <th className={TH}>Open mode</th>
                <th className={TH}>Application URL</th>
                <th className={`w-10 ${TH}`} />
              </tr>
            </thead>
            <tbody className="[&>tr:last-child>td]:border-b-0">
              {allSystems.map((system) => {
                const Icon = getSystemIcon(system.systemCode);
                return (
                  <tr key={system.id}>
                    <td className={TD}>
                      <div className="flex items-center gap-2.5">
                        <Icon className="size-4 text-text-3" />
                        <div>
                          <div className="font-semibold text-text-1">
                            {system.systemName}
                          </div>
                          <div className="font-mono text-[11px] text-text-3">
                            {system.systemCode}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className={`${TD} capitalize text-text-2`}>
                      {system.category}
                    </td>
                    <td className={TD}>
                      <span
                        className={
                          system.status === "active"
                            ? "rounded-full bg-status-green-dim px-2 py-0.5 text-[10.5px] font-semibold text-status-green"
                            : system.status === "maintenance"
                              ? "rounded-full bg-status-red-dim px-2 py-0.5 text-[10.5px] font-semibold text-status-red"
                              : "rounded-full bg-white/5 px-2 py-0.5 text-[10.5px] font-semibold text-text-3"
                        }
                      >
                        {system.status === "active"
                          ? "Active"
                          : system.status === "maintenance"
                            ? "Maintenance"
                            : "Coming soon"}
                      </span>
                    </td>
                    <td className={`${TD} capitalize text-text-2`}>
                      {system.openMode === "external"
                        ? "External link"
                        : "Internal"}
                    </td>
                    <td
                      className={`${TD} max-w-56 truncate font-mono text-text-2`}
                    >
                      {system.applicationUrl ?? "—"}
                    </td>
                    <td className={TD}>
                      <SystemEditDialog system={system} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
