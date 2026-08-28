import type { Metadata, Viewport } from "next";
import { Archivo, Literata } from "next/font/google";
import { CommandPalette } from "@/components/CommandPalette";
import { InstallPrompt } from "@/components/InstallPrompt";
import { OfflineStatus } from "@/components/OfflineStatus";
import { Sidebar } from "@/components/Sidebar";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin", "latin-ext"], variable: "--font-archivo", display: "swap" });
const literata = Literata({ subsets: ["latin", "latin-ext"], variable: "--font-literata", display: "swap" });

export const metadata: Metadata = {
  title: "Kodukeel — Estonian study",
  description:
    "Learn Estonian by its cases: a dictionary with full paradigms, spaced-repetition flashcards, " +
    "speed rounds and a grammar tutor that never invents a form.",
  icons: { icon: "/icon.svg" },
  applicationName: "Kodukeel",
  appleWebApp: { capable: true, title: "Kodukeel", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1218" },
  ],
  // The review screen is thumb-driven; zoom stays enabled because disabling it
  // is an accessibility failure, not a polish detail.
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${archivo.variable} ${literata.variable} min-h-screen`}
        style={{ fontFamily: "var(--font-archivo), system-ui, sans-serif" }}
      >
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[200] focus:rounded-md focus:border focus:px-3 focus:py-2"
          style={{ background: "var(--surface)", borderColor: "var(--rule)", color: "var(--ink)" }}
        >
          Skip to content
        </a>
        <div className="flex min-h-screen flex-col md:flex-row">
          <Sidebar />
          <main id="main" className="flex-1 pb-20 md:pb-0">{children}</main>
        </div>
        <CommandPalette />
        <OfflineStatus />
        <InstallPrompt />
      </body>
    </html>
  );
}
