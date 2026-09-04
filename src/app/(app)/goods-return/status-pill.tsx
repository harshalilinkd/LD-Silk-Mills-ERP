import { cn } from "@/lib/utils";

/**
 * Pending / Received.
 *
 * The database calls them `posted` and `received`; every screen in the
 * standalone app calls the first one **Pending**, and so does this. The stored
 * word means "we have posted it to Bhiwandi"; the word a person needs is "it
 * has not arrived yet". Never print the raw enum.
 *
 * A dot as well as a colour, because colour alone is not a state anybody can
 * read at a glance in a list of sixty rows, and it is the only cue for a reader
 * who cannot distinguish amber from green.
 */
export function StatusPill({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  const received = status === "received";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill px-2 py-[3px] text-[10.5px] leading-none font-semibold whitespace-nowrap",
        received
          ? "bg-status-green-dim text-status-green"
          : "bg-status-amber-dim text-status-amber",
        className,
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          received ? "bg-status-green" : "bg-status-amber",
        )}
      />
      {received ? "Received" : "Pending"}
    </span>
  );
}
