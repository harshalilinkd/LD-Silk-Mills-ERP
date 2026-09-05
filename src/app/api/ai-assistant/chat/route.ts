import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { SYSTEM_KNOWLEDGE } from "@/lib/ai/knowledge";
import { buildTools } from "@/lib/ai/tools";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The assistant's one endpoint
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── STREAMING, BECAUSE THE ALTERNATIVE LOOKS BROKEN ──────────────────────
 *
 * A question that needs two or three lookups takes ten to thirty seconds to
 * answer. Held until complete, that is half a minute of a blank screen with no
 * sign anything is happening, and people press the button again. Text is
 * pushed out as it is produced, and each tool call is announced as it starts
 * ("Looking up goods returns…"), so the wait is legible.
 *
 * The wire format is newline-delimited JSON rather than SSE — one JSON object
 * per line, `{type,...}`. It needs no EventSource on the client (which cannot
 * POST anyway), survives Next's streaming without special headers, and is
 * trivial to parse from a `fetch` body reader.
 *
 * ── WHAT KEEPS IT HONEST ─────────────────────────────────────────────────
 *
 *   · Every tool is read-only and scoped to the caller — see lib/ai/tools.ts.
 *   · The knowledge prompt is CACHED, so its length costs full price once and
 *     roughly a tenth of that on every later turn. It is the stable prefix, so
 *     it is placed first and never has anything volatile appended to it.
 *   · `max_iterations` caps the tool loop. Without it a confused model can
 *     search the same thing repeatedly until the request times out, and every
 *     lap is billed.
 */

// The assistant reasons over live business data and calls several tools per
// question; this is exactly the "remotely complicated" case that wants the
// most capable model. Cost is roughly a rupee or two per question.
const MODEL = "claude-opus-5";
const MAX_ITERATIONS = 8;

type Incoming = {
  messages: { role: "user" | "assistant"; content: string }[];
};

export async function POST(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return new NextResponse("Sign in first", { status: 401 });

  const [me] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!me) return new NextResponse("No ERP account", { status: 403 });

  if (!process.env.ANTHROPIC_API_KEY) {
    // A specific sentence, not a 500. This is the one failure an owner can fix
    // themselves, and "something went wrong" would send them to us instead.
    return NextResponse.json(
      {
        error:
          "The assistant is not switched on yet. An ANTHROPIC_API_KEY needs adding to the environment — see CLAUDE.md.",
      },
      { status: 503 },
    );
  }

  let body: Incoming;
  try {
    body = (await req.json()) as Incoming;
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  const history = (body.messages ?? [])
    .filter((m) => typeof m.content === "string" && m.content.trim())
    // Keep the last 20 turns. Older context is rarely load-bearing for a
    // lookup question and every turn is re-sent, so this is the difference
    // between a cheap conversation and one that grows without limit.
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content }));

  if (history.length === 0) return new NextResponse("Nothing to answer", { status: 400 });

  const client = new Anthropic();
  const tools = buildTools({ userId: me.id, name: me.name, email: me.email });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      try {
        const runner = client.beta.messages.toolRunner({
          model: MODEL,
          max_tokens: 8000,
          // Adaptive thinking: the assistant has to decide which of several
          // lookups actually answers the question, which is not a one-shot.
          thinking: { type: "adaptive" },
          system: [
            {
              type: "text",
              text: SYSTEM_KNOWLEDGE,
              cache_control: { type: "ephemeral" },
            },
            {
              type: "text",
              text: `You are speaking to ${me.name}. Today is ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}.`,
            },
          ],
          tools,
          messages: history as Anthropic.MessageParam[],
          max_iterations: MAX_ITERATIONS,
          stream: true,
        });

        for await (const messageStream of runner) {
          for await (const event of messageStream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              send({ type: "text", text: event.delta.text });
            }
            // Announce a lookup as it starts, so a long pause has a reason
            // attached to it rather than being dead air.
            if (
              event.type === "content_block_start" &&
              event.content_block.type === "tool_use"
            ) {
              send({ type: "tool", name: event.content_block.name });
            }
          }

          const message = await messageStream.finalMessage();
          // The runner does not auto-resume a paused turn; without this a long
          // lookup ends the loop and returns a silently truncated answer.
          if (message.stop_reason === "pause_turn") {
            runner.pushMessages({ role: "assistant", content: message.content });
          }
        }

        send({ type: "done" });
      } catch (e) {
        console.error("ai-assistant failed", e);
        const msg =
          e instanceof Anthropic.RateLimitError
            ? "The assistant is busy right now. Try again in a moment."
            : e instanceof Anthropic.AuthenticationError
              ? "The assistant's key was rejected. An administrator needs to check it."
              : "The assistant could not finish that. Please try again.";
        send({ type: "error", message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      // Vercel and some proxies buffer a streamed response without this, which
      // turns streaming back into a long silence followed by everything at once.
      "X-Accel-Buffering": "no",
    },
  });
}
