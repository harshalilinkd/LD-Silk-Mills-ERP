import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { resolveOrderEntryAuthz } from "@/lib/order-entry/authz";
import { OrderEntrySessionProvider } from "@/lib/order-entry/context";
import { IconLock } from "@tabler/icons-react";

export default async function OrderEntryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const authz = await resolveOrderEntryAuthz(session.user.email);

  if (!authz) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-status-amber-dim">
          <IconLock className="size-6 text-status-amber" />
        </div>
        <h1 className="text-lg font-semibold tracking-[-0.01em] text-text-1">
          Not provisioned for Order Entry
        </h1>
        <p className="max-w-sm text-sm text-text-3">
          Your ERP account ({session.user.email}) isn&apos;t set up in Order
          Entry yet. Ask an Order Entry admin to add you (Order Entry has its
          own user list, separate from the ERP shell).
        </p>
      </div>
    );
  }

  return (
    <OrderEntrySessionProvider
      value={{
        userId: authz.userId,
        name: authz.name,
        email: session.user.email,
        role: authz.role,
        caps: authz.caps,
      }}
    >
      {children}
    </OrderEntrySessionProvider>
  );
}
