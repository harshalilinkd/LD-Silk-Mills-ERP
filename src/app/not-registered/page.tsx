import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotRegisteredPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-[10px] border border-border bg-surface p-8 text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-lg bg-status-amber-dim text-status-amber">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="size-6"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m0 3.75h.008v.008H12v-.008ZM12 3.75c-4.556 0-8.25 3.694-8.25 8.25s3.694 8.25 8.25 8.25 8.25-3.694 8.25-8.25-3.694-8.25-8.25-8.25Z"
            />
          </svg>
        </div>
        <h1 className="text-lg font-bold tracking-[-0.01em] text-text-1">
          Your account isn&apos;t set up yet
        </h1>
        <p className="mt-2 text-[13px] text-text-3">
          We couldn&apos;t find an ERP account for the Google account you
          just signed in with. Contact an administrator to have your access
          set up before trying again.
        </p>
        <Button
          variant="outline"
          nativeButton={false}
          className="mt-6 w-full"
          render={<Link href="/login">Back to sign in</Link>}
        />
      </div>
    </div>
  );
}
