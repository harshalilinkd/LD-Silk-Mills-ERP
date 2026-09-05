import type { NextConfig } from "next";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  How big a file may be POSTed to a Server Action
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Next's default is **1 MB**, and it is the reason the first real Petty Cash
 * receipt failed with `Body exceeded 1 MB limit`. Two things are worth knowing
 * before anybody raises this number again:
 *
 *   · **Vercel refuses any request body over 4.5 MB** at the platform, before
 *     our code runs. So this can never usefully go above that, whatever Next
 *     will accept locally. A module that promises 10 MB through a Server
 *     Action is promising something production cannot deliver.
 *   · The way to actually carry a 10 MB file is not to send it through a
 *     function at all. Petty Cash issues a one-use SIGNED UPLOAD URL and the
 *     browser PUTs the bytes straight to Supabase Storage — see the header of
 *     `src/lib/petty-cash/attachments.ts`. Goods Return and Help Slip still
 *     upload through the server and are capped at 4 MB to match this limit;
 *     that pattern is where they should go if the cap ever bites.
 */
const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
