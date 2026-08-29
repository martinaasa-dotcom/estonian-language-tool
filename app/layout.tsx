import type { Metadata, Viewport } from "next";
import { Archivo, Literata } from "next/font/google";
import { Sidebar } from "@/components/Sidebar";
import { OfflineProvider } from "@/components/OfflineProvider";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin", "latin-ext"], variable: "--font-archivo", display: "swap" });
const literata = Literata({ subsets: ["latin", "latin-ext"], variable: "--font-literata", display: "swap" });

export const metadata: Metadata = {
  title: "Kodukeel — Estonian study",
  description: "A personal Estonian learning dashboard: dictionary, flashcards and a grammar tutor.",
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Kodukeel", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#161513" },
  ],
  width: "device-width",
  initialScale: 1,
  // Review is thumb-driven on a phone; pinch-zoom must stay available.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${archivo.variable} ${literata.variable} min-h-screen`}
        style={{ fontFamily: "var(--font-archivo), system-ui, sans-serif" }}
      >
        <OfflineProvider>
          <div className="flex min-h-screen flex-col md:flex-row">
            <Sidebar />
            <main className="flex-1 pb-20 md:pb-0">{children}</main>
          </div>
        </OfflineProvider>
      </body>
    </html>
  );
}
