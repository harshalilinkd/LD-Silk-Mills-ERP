import type { Metadata } from "next";
import { Manrope, IBM_Plex_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "LD Silk Mills ERP",
  description: "Central entry point for LD Silk Mills internal systems",
};

// Applies the saved theme before first paint so there's no flash of the
// wrong theme. Runs as a blocking inline script (not a React effect, which
// would only run after hydration — too late to avoid a flash) and mutates
// the DOM directly, which is exactly the case `suppressHydrationWarning`
// below exists for: React is told not to complain that <html>'s className
// no longer matches what it server-rendered.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("ld-erp-theme");
    var dark = stored ? stored === "dark" : true;
    document.documentElement.classList.toggle("dark", dark);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`dark ${manrope.variable} ${ibmPlexMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
