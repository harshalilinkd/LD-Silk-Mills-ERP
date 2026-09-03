import type { Metadata } from "next";
import { Manrope, IBM_Plex_Mono, Fraunces } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

/**
 * The DISPLAY serif, used on the login screen's headline and nowhere else.
 *
 * The ERP itself is Manrope throughout — a serif inside a data table would be
 * a mistake. But the sign-in screen is the one marketing surface this product
 * has, and the approved design sets its headline in an elegant serif over the
 * fabric photograph. Fraunces at low softness and low wonk is the closest
 * Google face: a warm transitional serif with the right proportions and none
 * of Playfair's brittle high contrast.
 *
 * Loaded with `display: "swap"` and only ever applied to two lines, so it
 * cannot hold up first paint of anything that matters.
 */
const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  // NO `weight` here, deliberately. Fraunces is a variable font, and next/font
  // refuses `axes` alongside a fixed weight list — "Axes can only be defined
  // for variable fonts when the weight property is nonexistent". Omitting it
  // loads the whole variable range, so any font-weight works and the optical
  // size axis tracks the (very large) display size on its own.
  axes: ["SOFT", "WONK", "opsz"],
  display: "swap",
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
      className={`dark ${manrope.variable} ${fraunces.variable} ${ibmPlexMono.variable} h-full antialiased`}
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
