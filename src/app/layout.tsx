import type { Metadata, Viewport } from "next";
import { Karla, Playfair_Display } from "next/font/google";

import { copy } from "@/lib/copy";

import "./globals.css";

/**
 * A serif/sans menu pairing — the oldest convention in the business, and what
 * makes a list of dishes read as a menu rather than as a table of data.
 *
 * Playfair carries the voice: dish names, prices, headlines. Karla does
 * everything functional — labels, buttons, forms, the pass.
 *
 * Both load through `next/font`, which self-hosts the files and inlines the
 * `@font-face` rules: no render-blocking round trip to Google's CDN on cafe
 * wifi, and no layout shift when they land.
 */
const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-playfair",
  display: "swap",
});

const karla = Karla({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-karla",
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
  themeColor: "#fdf7f1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${karla.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
