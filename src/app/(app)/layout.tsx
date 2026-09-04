import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getUserByEmail, getVisibleSystemsForUser } from "@/lib/queries";
import { Sidebar } from "@/components/shell/sidebar";
import {
  MobileNavPanel,
  MobileNavProvider,
} from "@/components/shell/mobile-nav";
import { Topbar } from "@/components/shell/topbar";
import { QueryProvider } from "@/components/providers/query-provider";

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
    <QueryProvider>
      <MobileNavProvider>
        <div className="flex h-dvh w-full overflow-hidden bg-background">
          {/* The sidebar is rendered ONCE and passed through as children, so
            there is a single navigation tree for every screen size. The panel
            only decides where it sits. */}
          <MobileNavPanel>
            <Sidebar
              visibleSystems={visibleSystems}
              name={dbUser.name}
              email={dbUser.email}
              avatar={dbUser.avatar}
            />
          </MobileNavPanel>
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar
              name={dbUser.name}
              email={dbUser.email}
              avatar={dbUser.avatar}
            />
            <main className="flex-1 overflow-y-auto p-4 md:p-6">
              {children}
            </main>
          </div>
        </div>
      </MobileNavProvider>
    </QueryProvider>
  );
}
