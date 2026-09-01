import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getAllSystemsOrdered } from "@/lib/queries";
import { getSystemIcon } from "@/lib/system-icons";
import { SystemEditDialog } from "./system-edit-dialog";

const STATUS_VARIANT = {
  active: "default",
  coming_soon: "secondary",
  maintenance: "destructive",
} as const;

export default async function SystemRegistryPage() {
  const allSystems = await getAllSystemsOrdered();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">
          System Registry
        </h1>
        <p className="text-sm text-muted-foreground">
          Turn systems on, update their live URL, or reorder the sidebar —
          no redeploy needed.
        </p>
      </div>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>System</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Open mode</TableHead>
              <TableHead>Application URL</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {allSystems.map((system) => {
              const Icon = getSystemIcon(system.systemCode);
              return (
                <TableRow key={system.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Icon className="size-4 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{system.systemName}</div>
                        <div className="text-xs text-muted-foreground">
                          {system.systemCode}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="capitalize text-muted-foreground">
                    {system.category}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={STATUS_VARIANT[system.status]}
                      className="capitalize"
                    >
                      {system.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="capitalize text-muted-foreground">
                    {system.openMode}
                  </TableCell>
                  <TableCell className="max-w-56 truncate text-muted-foreground">
                    {system.applicationUrl ?? "—"}
                  </TableCell>
                  <TableCell>
                    <SystemEditDialog system={system} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
