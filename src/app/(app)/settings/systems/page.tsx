import { redirect } from "next/navigation";

import Link from "next/link";

import { isErpAdmin } from "@/lib/admin";
import { getAllSystemsOrdered, getSystemViewerCounts } from "@/lib/queries";
import { getSystemIcon } from "@/lib/system-icons";
import { SystemEditDialog } from "./system-edit-dialog";

const TH =
  "border-b border-border px-3.5 pb-2.5 pt-3.5 text-left text-[11px] font-bold uppercase tracking-[0.04em] text-text-1";
const TD = "border-b border-border px-3.5 py-3";

export default async function SystemRegistryPage() {
  // This tab guards itself — the settings layout cannot, because the profile
  // tab beside it is for everybody. Not the boundary either way: the actions
  // this screen calls each run requireErpAdmin() before reading their input.
  if (!(await isErpAdmin())) redirect("/settings");


  const [allSystems, viewerCounts] = await Promise.all([
    getAllSystemsOrdered(),
    getSystemViewerCounts(),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-[15px] font-semibold text-text-1">
          System Registry
                </h2>
        <p className="mt-0.5 text-[13px] text-text-3">
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

                // TWO WAYS A SYSTEM CAN READ "Active" AND STILL GO NOWHERE,
                // both of which happened to `crr` and neither of which this
                // screen used to mention.
                //
                //  1. Nobody is ticked in Access. A coming_soon system is
                //     shown to everyone as a preview; an active one only to
                //     people granted it. So switching a system ON removes it
                //     from the sidebar of anybody who was not ticked — which
                //     looks exactly like the switch having failed.
                //  2. The open mode has nothing to open. "Internal" means a
                //     page inside this ERP and needs a route; "External link"
                //     needs an Application URL. Without one the sidebar guesses
                //     `/<code>`, and for a system that lives on another domain
                //     that guess is a 404.
                const live = system.status === "active";
                const viewers = viewerCounts.get(system.id) ?? 0;
                const noViewers = live && viewers === 0;
                const noDestination =
                  live &&
                  (system.openMode === "external"
                    ? !system.applicationUrl
                    : !system.route);

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
                              : "rounded-full bg-chip px-2 py-0.5 text-[10.5px] font-semibold text-text-3"
                        }
                      >
                        {system.status === "active"
                          ? "Active"
                          : system.status === "maintenance"
                            ? "Maintenance"
                            : "Coming soon"}
                      </span>
                      {noViewers ? (
                        <div className="mt-1 text-[11px] leading-snug text-status-amber">
                          Nobody can see it —{" "}
                          <Link
                            href="/settings/access"
                            className="font-semibold underline underline-offset-2"
                          >
                            grant access
                          </Link>
                        </div>
                      ) : live ? (
                        <div className="mt-1 text-[11px] text-text-3">
                          {viewers} {viewers === 1 ? "person" : "people"}
                        </div>
                      ) : null}
                    </td>
                    <td className={`${TD} text-text-2`}>
                      {system.openMode === "external"
                        ? "External link"
                        : "Internal"}
                      {noDestination ? (
                        <div className="mt-1 text-[11px] leading-snug text-status-amber">
                          {system.openMode === "external"
                            ? "No Application URL set"
                            : "No page here — set an Application URL and use External link"}
                        </div>
                      ) : null}
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
