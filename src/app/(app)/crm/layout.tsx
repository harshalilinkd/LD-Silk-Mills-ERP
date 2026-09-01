import { redirect } from "next/navigation";
import { IconLock } from "@tabler/icons-react";
import { auth } from "@/auth";
import { resolveOrderEntryAuthz } from "@/lib/order-entry/authz";
import { OrderEntrySessionProvider } from "@/lib/order-entry/context";
import { CrmTabs } from "@/components/order-entry/crm-tabs";

// CRM is its own sidebar entry, but it reads/writes the same
// ld_order_entry schema and the same user/role/capability model as Order
// Entry (crm.view / crm.edit are capabilities defined in Order Entry's own
// rbac). So authorization here is identical to the Order Entry layout —
// same lookup, same "not provisioned" fallback — just a different tab set
// and a different top-level sidebar entry.
export default async function CrmLayout({
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
          Not provisioned for CRM
        </h1>
        <p className="max-w-sm text-sm text-text-3">
          CRM uses the same account as Order Entry, and your ERP account (
          {session.user.email}) isn&apos;t set up there yet. Ask an Order
          Entry admin to add you.
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
      <div className="flex flex-col gap-5">
        <CrmTabs role={authz.role} caps={authz.caps} />
        {children}
      </div>
    </OrderEntrySessionProvider>
  );
}
