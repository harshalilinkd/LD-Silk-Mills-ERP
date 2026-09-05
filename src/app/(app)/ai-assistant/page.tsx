import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { IconInfoCircle } from "@tabler/icons-react";

import { auth } from "@/auth";
import { Assistant } from "./assistant";

export const metadata: Metadata = {
  title: "AI Assistant — LD Silk Mills ERP",
};

/**
 * The assistant.
 *
 * No admin gate: it answers only from what the person asking is already
 * allowed to see. Every tool checks their access before touching a module, so
 * somebody without Goods Return is told they do not have it rather than being
 * shown the figures — the assistant must never be the one place in the app
 * where a permission leaks.
 *
 * The "not switched on" state is deliberately NOT rendered here. Whether the
 * key exists is a server fact, and hiding the screen behind it would mean an
 * administrator adding the key sees nothing change until a redeploy. The
 * screen always loads; the endpoint says, in a sentence, if it cannot answer.
 */
export default async function AiAssistantPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const firstName = (session.user.name ?? "there").split(" ")[0];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
          AI Assistant
        </h1>
        <p className="mt-1 hidden text-[13px] text-text-3 sm:block">
          Ask about anything in the ERP, or how to do something in it.
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-field border border-border bg-surface-2 px-3 py-2 text-[12.5px] leading-relaxed text-text-3">
        <IconInfoCircle className="mt-0.5 size-4 shrink-0" />
        <p>
          It can look things up but <strong className="font-semibold text-text-2">cannot change anything</strong> —
          no records are created, edited or deleted by asking. It only sees the
          systems you have been given, and it can be wrong, so check any figure
          you are about to act on.
        </p>
      </div>

      <Assistant firstName={firstName} />
    </div>
  );
}
