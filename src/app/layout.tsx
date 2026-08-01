import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";

import { copy } from "@/lib/copy";

import "./globals.css";

/**
 * Archivo carries the whole system — headings and body both. Loading it
 * through `next/font` self-hosts the files and inlines the `@font-face`
 * rules, so there is no render-blocking round trip to Google's CDN on cafe
 * wifi and no layout shift when it lands.
 */
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: `${copy.brand.product} — ${copy.brand.tagline}`,
    template: `%s · ${copy.brand.product}`,
  },
  description:
    "Scan the QR on your table, order from the menu, and watch it land on the kitchen pass. No app, no login.",
  robots: {
    // A menu bound to a specific table has no business in search results, and
    // an indexed /t/<code> would defeat the point of unguessable codes.
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The guest surface is a menu people pinch to read prices. Locking zoom
  // would fail WCAG 1.4.4 and annoy everyone over forty.
  maximumScale: 5,
  themeColor: "#f3f2f2",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
