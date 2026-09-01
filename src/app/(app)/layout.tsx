import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getUserByEmail, getVisibleSystemsForUser } from "@/lib/queries";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const dbUser = await getUserByEmail(session.user.email);
  if (!dbUser) redirect("/not-registered");

  const visibleSystems = await getVisibleSystemsForUser(dbUser.id);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar visibleSystems={visibleSystems} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          name={dbUser.name}
          email={dbUser.email}
          avatar={dbUser.avatar}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
