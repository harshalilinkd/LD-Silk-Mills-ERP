import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signInWithGoogle, signInWithPassword } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  if (session) redirect("/");

  const { callbackUrl, error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-[10px] border border-border bg-surface p-8">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div
            className="flex size-12 items-center justify-center rounded-lg text-lg font-bold text-[#04211d]"
            style={{
              background: "linear-gradient(155deg, var(--primary), #0d9488)",
            }}
          >
            LD
          </div>
          <h1 className="text-xl font-bold tracking-[-0.01em] text-text-1">
            LD Silk Mills ERP
          </h1>
          <p className="text-[13px] text-text-3">
            Sign in with Google, or with your email and password.
          </p>
        </div>

        {error === "invalid_credentials" && (
          <p className="mb-4 rounded-lg border border-status-red/30 bg-status-red-dim px-3 py-2 text-center text-[12.5px] text-status-red">
            That email and password didn&apos;t work. If you have never set
            one, sign in with Google instead.
          </p>
        )}

        <form
          action={async () => {
            "use server";
            await signInWithGoogle(callbackUrl);
          }}
        >
          <Button type="submit" className="w-full" size="lg">
            <GoogleIcon className="mr-2 size-4" />
            Continue with Google
          </Button>
        </form>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[10.5px] font-semibold tracking-[0.04em] text-text-3 uppercase">
            or
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* Shown to everybody, always. Whether a given person HAS a password is
            not something this form may reveal — an input that appeared only for
            accounts with one would answer "does this person work here?" to
            anybody who typed an address. */}
        <form
          action={async (formData: FormData) => {
            "use server";
            await signInWithPassword(
              String(formData.get("email") ?? ""),
              String(formData.get("password") ?? ""),
              callbackUrl,
            );
          }}
          className="flex flex-col gap-2.5"
        >
          <Input
            name="email"
            type="email"
            autoComplete="username"
            placeholder="you@example.com"
            required
            aria-label="Email"
            className="text-[13px]"
          />
          <Input
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            required
            aria-label="Password"
            className="text-[13px]"
          />
          <Button type="submit" variant="outline" className="w-full">
            Sign in
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-text-3">
          Access is restricted to accounts an administrator has already set
          up.
        </p>
      </div>
    </div>
  );
}

function GoogleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.37-2.28V6.63H1.29A11.98 11.98 0 0 0 0 12c0 1.94.46 3.77 1.29 5.37l3.98-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.94 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.63l3.98 3.09C6.22 6.88 8.87 4.77 12 4.77Z"
      />
    </svg>
  );
}
