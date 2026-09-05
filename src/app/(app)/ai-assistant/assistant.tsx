"use client";

import * as React from "react";
import {
  IconArrowUp,
  IconLoader2,
  IconSparkles,
} from "@tabler/icons-react";

import { cn } from "@/lib/utils";

/**
 * The assistant screen.
 *
 * ── WHY IT SHOWS THE LOOKUPS ─────────────────────────────────────────────
 *
 * A question that needs two or three lookups takes ten to thirty seconds. Each
 * one is announced as it starts — "Looking up goods returns…" — because a
 * silent pause of that length reads as a hang, and people press the button
 * again. It also does something more useful than reassurance: it shows WHICH
 * part of the business the answer is coming from, so a wrong answer is
 * traceable to a wrong lookup rather than being a black box.
 *
 * ── NO MARKDOWN RENDERER ─────────────────────────────────────────────────
 *
 * The answers are short business prose, not documents. A markdown library for
 * the occasional bold word is weight every page would carry, and the shell has
 * refused a dependency for less. `**bold**` is handled inline; everything else
 * renders as written, with line breaks preserved.
 */

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "What needs my attention today?",
  "How many goods returns are still waiting at Bhiwandi?",
  "How do I record a new goods return?",
  "Show me everything for KAMAL BROTHERS",
];

/** `**bold**` only — see the note above. */
function renderText(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-text-1">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );
}

export function Assistant({ firstName }: { firstName: string }) {
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [activity, setActivity] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, activity]);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;

    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    setError(null);
    setActivity("Thinking…");

    try {
      const res = await fetch("/api/ai-assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "The assistant is not available right now.");
        setActivity(null);
        setBusy(false);
        return;
      }

      // One JSON object per line. A chunk can split a line in half, so the
      // tail is carried over rather than parsed — dropping it loses whole
      // sentences at random and looks like the model stuttering.
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";
      let started = false;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let ev: { type: string; text?: string; name?: string; message?: string };
          try {
            ev = JSON.parse(line);
          } catch {
            continue;
          }

          if (ev.type === "text" && ev.text) {
            answer += ev.text;
            setActivity(null);
            setMessages((m) => {
              const copy = [...m];
              if (started) copy[copy.length - 1] = { role: "assistant", content: answer };
              else copy.push({ role: "assistant", content: answer });
              return copy;
            });
            started = true;
          } else if (ev.type === "tool") {
            setActivity(labelFor(ev.name ?? ""));
          } else if (ev.type === "error") {
            setError(ev.message ?? "Something went wrong.");
          }
        }
      }
    } catch {
      setError("Lost connection to the assistant. Please try again.");
    } finally {
      setBusy(false);
      setActivity(null);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-190px)] flex-col gap-4">
      {messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 py-10 text-center">
          <span className="grid size-12 place-items-center rounded-[14px] bg-accent text-accent-text ring-1 ring-accent-text/15 ring-inset">
            <IconSparkles className="size-6" />
          </span>
          <div>
            <h2 className="text-[17px] font-bold text-text-1">
              Ask me anything about the business, {firstName}
            </h2>
            <p className="mx-auto mt-1 max-w-md text-[13px] text-text-3">
              I can look across orders, customers, complaints and goods returns,
              and walk you through any screen. I can look things up, but I
              cannot change them.
            </p>
          </div>
          <div className="flex w-full max-w-xl flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void ask(s)}
                className="cursor-pointer rounded-pill border border-border bg-surface px-3 py-1.5 text-[12.5px] text-text-2 transition-colors hover:border-primary/40 hover:text-text-1"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-4">
          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "flex",
                m.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[min(680px,88%)] rounded-card px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap",
                  m.role === "user"
                    ? "bg-accent text-accent-text"
                    : "border border-border bg-surface text-text-2",
                )}
              >
                {renderText(m.content)}
              </div>
            </div>
          ))}

          {activity && (
            <div className="flex items-center gap-2 text-[12.5px] text-text-3">
              <IconLoader2 className="size-3.5 animate-spin" />
              {activity}
            </div>
          )}
          <div ref={endRef} />
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-field border border-status-red/30 bg-status-red-dim px-3 py-2 text-[12.5px] text-status-red"
        >
          {error}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
        className="sticky bottom-0 flex items-end gap-2 rounded-card border border-border bg-surface p-2"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter is a new line — the shape people expect
            // from every chat they already use.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask(input);
            }
          }}
          rows={1}
          placeholder="Ask about orders, customers, returns or how to do something…"
          disabled={busy}
          className="max-h-40 min-h-[38px] flex-1 resize-none bg-transparent px-2 py-2 text-[13.5px] text-text-1 outline-none placeholder:text-text-placeholder disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          aria-label="Send"
          className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-field bg-primary text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? (
            <IconLoader2 className="size-4 animate-spin" />
          ) : (
            <IconArrowUp className="size-4" />
          )}
        </button>
      </form>
    </div>
  );
}

/** Tool names are for the log; these are for the person waiting. */
function labelFor(tool: string): string {
  switch (tool) {
    case "search_orders":
      return "Looking through orders…";
    case "search_goods_returns":
      return "Looking up goods returns…";
    case "goods_returns_summary":
      return "Adding up goods returns…";
    case "find_customer":
      return "Searching every customer list…";
    case "whats_waiting":
      return "Checking what is outstanding…";
    default:
      return "Looking that up…";
  }
}
