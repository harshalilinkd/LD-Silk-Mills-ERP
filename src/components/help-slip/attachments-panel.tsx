"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconCamera, IconPhoto, IconTrash, IconX } from "@tabler/icons-react";

import { helpSlipGet } from "@/lib/help-slip/api-client";
import { SectionCard } from "./page-parts";
import { T } from "./type-scale";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Photographs on a concern
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The point of the whole feature: somebody stands in front of a jammed loom,
 * photographs it, and the coordinator sees the actual machine instead of a
 * paragraph describing it.
 *
 * ── COMPRESSION HAPPENS HERE, ON THE DEVICE ───────────────────────────────
 *
 * A photo off a mid-range Android is 4-6MB. Uploading that from the Bhiwandi
 * floor over mobile data takes long enough that people background the app,
 * which suspends the request, which fails the upload. So the file is resized
 * to fit 1600px and re-encoded before the network sees it, and what actually
 * goes up is a few hundred kilobytes.
 *
 * A <canvas> does this with no dependency. The standalone app pulls in
 * `browser-image-compression` for the same job; that library's real advantage
 * is a web worker, which matters when you are compressing several at once, and
 * three photos one at a time does not justify a dependency here.
 *
 * HEIC is the exception and is handled by NOT handling it: `createImageBitmap`
 * throws on HEIC in every browser without a decoder, and the catch sends the
 * original bytes instead. An iPhone photo therefore arrives full-size, which
 * is why the server ceiling is 4MB rather than something tighter
 * (and 4MB is itself Vercel's own request-body ceiling — see
 * `lib/help-slip/attachments.ts`).
 *
 * ── WHY THE IMAGES ARE NOT <img src={storageUrl}> ─────────────────────────
 *
 * Every thumbnail points at `/api/help-slip/attachments/{id}`, which
 * re-authorises against the database on each request. A Supabase signed URL
 * would be a bearer token in a query string — it keeps working for anyone
 * holding it, and these photographs can hang off `hr_only` concerns.
 */

const MAX_ATTACHMENTS = 3;
const MAX_DIMENSION = 1600;
const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif";

export type Attachment = {
  id: string;
  fileName: string;
  fileSizeBytes: number | null;
  mimeType: string | null;
  createdAt: string;
  url: string;
  /** Server-computed, mirroring the RLS delete policy. */
  canRemove: boolean;
};

/**
 * Shrink to fit MAX_DIMENSION and re-encode as JPEG.
 *
 * Returns the ORIGINAL whenever compression would not help — an already-small
 * file, a format the browser cannot decode, or a result that came out bigger,
 * which genuinely happens with small PNGs. The goal is fewer bytes on the
 * wire, not having run the compressor.
 */
async function compress(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // HEIC on a browser with no decoder lands here.
  }
  try {
    const scale = Math.min(
      1,
      MAX_DIMENSION / Math.max(bitmap.width, bitmap.height),
    );
    if (scale === 1 && file.size < 600_000) return file;

    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82),
    );
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
    });
  } finally {
    bitmap.close();
  }
}

function prettyBytes(n: number | null): string {
  if (n == null) return "";
  return n < 1024 * 1024
    ? `${Math.round(n / 1024)} KB`
    : `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentsPanel({
  concernId,
  canAdd,
}: {
  concernId: string;
  /** False on a closed concern, or for an employee on someone else's. */
  canAdd: boolean;
}) {
  const queryClient = useQueryClient();
  const queryKey = React.useMemo(
    () => ["help-slip", "attachments", concernId],
    [concernId],
  );
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [viewing, setViewing] = React.useState<Attachment | null>(null);

  const q = useQuery({
    queryKey,
    queryFn: () =>
      helpSlipGet<Attachment[]>(
        `/api/help-slip/concerns/${concernId}/attachments`,
      ),
    staleTime: 30_000,
  });

  const items = q.data ?? [];
  const full = items.length >= MAX_ATTACHMENTS;

  const upload = useMutation({
    mutationFn: async (file: File) => {
      setBusy("Preparing photo…");
      const small = await compress(file);
      setBusy(`Uploading ${prettyBytes(small.size)}…`);
      const body = new FormData();
      body.append("file", small);
      // FormData, so no Content-Type header — the browser must set the
      // multipart boundary itself, and naming it here breaks the parse.
      const res = await fetch(
        `/api/help-slip/concerns/${concernId}/attachments`,
        { method: "POST", body },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "That photo didn't upload.");
      return json.data as Attachment[];
    },
    onSuccess: (list) => {
      queryClient.setQueryData(queryKey, list);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
    onSettled: () => setBusy(null),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/help-slip/attachments/${id}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok)
        throw new Error(json?.error ?? "Couldn't remove that photo.");
      return id;
    },
    onSuccess: (id) => {
      queryClient.setQueryData<Attachment[]>(queryKey, (old) =>
        (old ?? []).filter((a) => a.id !== id),
      );
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    // Reset immediately so picking the same file twice still fires onChange.
    e.target.value = "";
    const room = MAX_ATTACHMENTS - items.length;
    if (files.length > room) {
      setError(
        `Room for ${room} more photo${room === 1 ? "" : "s"} on this concern.`,
      );
    }
    // Sequential, not Promise.all: each upload re-reads the list on the server
    // and the cap is checked per request, so parallel ones race that count and
    // a fourth photo can slip past a limit of three.
    void (async () => {
      for (const f of files.slice(0, room)) {
        try {
          await upload.mutateAsync(f);
        } catch {
          // Already surfaced by `onError`. Stop the run rather than pushing the
          // rest, so one failure does not produce three identical banners.
          break;
        }
      }
    })();
  };

  if (!canAdd && items.length === 0 && !q.isLoading) return null;

  return (
    <SectionCard title="Photos" icon={<IconPhoto />}>
      {items.length > 0 ? (
        <ul className="flex flex-wrap gap-2.5">
          {items.map((a) => (
            <li key={a.id} className="group relative">
              <button
                type="button"
                onClick={() => setViewing(a)}
                className="block size-[92px] overflow-hidden rounded-field border border-border bg-surface-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
                aria-label={`Open ${a.fileName}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element --
                    next/image cannot optimise an authenticated route: it would
                    fetch this server-side, without the caller's session, and
                    every thumbnail would 404. */}
                <img
                  src={a.url}
                  alt={a.fileName}
                  loading="lazy"
                  className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </button>
              {a.canRemove ? (
                <button
                  type="button"
                  onClick={() => remove.mutate(a.id)}
                  disabled={remove.isPending}
                  aria-label={`Remove ${a.fileName}`}
                  className="absolute -top-1.5 -right-1.5 grid size-6 cursor-pointer place-items-center rounded-full border border-border bg-surface text-text-3 shadow-sm transition-colors hover:bg-status-red-dim hover:text-status-red disabled:opacity-40"
                >
                  <IconTrash className="size-3.5" stroke={1.8} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {canAdd ? (
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="sr-only"
            onChange={onPick}
            // `capture` is deliberately NOT set. On a phone it forces the
            // camera and removes the gallery, and half of these photos were
            // taken minutes earlier on the floor.
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={full || upload.isPending}
            className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-field border border-border bg-surface-2 px-3 text-[13px] font-medium text-text-1 transition-colors hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <IconCamera className="size-4" stroke={1.7} />
            {items.length === 0 ? "Add a photo" : "Add another"}
          </button>
          <span className="text-[12px] text-text-3">
            {busy
              ? busy
              : full
                ? `${MAX_ATTACHMENTS} photos is the limit.`
                : `Up to ${MAX_ATTACHMENTS}. Large photos are shrunk before upload.`}
          </span>
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-field border border-status-red/30 bg-status-red-dim px-3 py-2 text-[12.5px] text-status-red"
        >
          {error}
        </p>
      ) : null}

      {viewing ? (
        <Lightbox item={viewing} onClose={() => setViewing(null)} />
      ) : null}
    </SectionCard>
  );
}

/**
 * Full-size view.
 *
 * A plain fixed overlay rather than the app's dialog primitive: this needs to
 * fill the screen edge to edge on a phone, and every escape route out of it
 * (backdrop, Escape, the button) does the same one thing.
 */
function Lightbox({
  item,
  onClose,
}: {
  item: Attachment;
  onClose: () => void;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Stop the page behind scrolling under the overlay on touch.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item.fileName}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 grid size-10 cursor-pointer place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
      >
        <IconX className="size-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element -- authenticated route */}
      <img
        src={item.url}
        alt={item.fileName}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full rounded-card object-contain shadow-2xl"
      />
      <p
        className={`absolute bottom-4 left-1/2 -translate-x-1/2 rounded-pill bg-black/60 px-3 py-1 text-white ${T.caption}`}
      >
        {item.fileName}
        {item.fileSizeBytes ? ` · ${prettyBytes(item.fileSizeBytes)}` : ""}
      </p>
    </div>
  );
}
