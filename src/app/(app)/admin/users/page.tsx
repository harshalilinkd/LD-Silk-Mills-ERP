import { IconUsers } from "@tabler/icons-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { EmptyState } from "@/components/shell/empty-state";
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
  const allUsers = await getAllUsersOrdered();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">
          {allUsers.length} user{allUsers.length === 1 ? "" : "s"} provisioned
          in the ERP.
        </p>
      </div>

      <div className="rounded-lg border border-border">
        {allUsers.length === 0 ? (
          <EmptyState icon={IconUsers} title="No users yet" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {allUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Avatar className="size-7">
                        {user.avatar && (
                          <AvatarImage src={user.avatar} alt={user.name} />
                        )}
                        <AvatarFallback className="bg-accent text-[10px] text-accent-foreground">
                          {initials(user.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{user.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.email}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={user.status === "active" ? "default" : "secondary"}
                      className="capitalize"
                    >
                      {user.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.createdAt.toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </TableCell>
                  <TableCell>
                    <UserEditDialog user={user} />
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
