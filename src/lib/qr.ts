import { headers } from "next/headers";
import QRCode from "qrcode";

/**
 * QR codes for the table stickers.
 *
 * Generated on the server as data URLs so the print sheet is a single HTML
 * document with nothing to fetch — the owner opens it, hits Cmd-P, and every
 * code is already there. A sheet that renders half its codes because an image
 * request was slow is a sheet that gets printed anyway and taped to tables.
 */

/**
 * Error correction level H — 30% of the symbol can be damaged and still
 * scan. These get spilled on, wiped down, and scratched by chair backs, so
 * the redundancy is the whole point.
 */
const OPTIONS = {
  errorCorrectionLevel: "H",
  margin: 1,
  color: {
    dark: "#201e1d",
    light: "#ffffff",
  },
} as const;

export async function qrDataUrl(url: string, width = 512): Promise<string> {
  return QRCode.toDataURL(url, { ...OPTIONS, width, type: "image/png" });
}

/**
 * The public origin, for building the URL that goes into the code.
 *
 * `TABLEKIT_PUBLIC_ORIGIN` wins when set — behind a proxy the request's own
 * host header can be an internal name, and a sticker printed with
 * `http://10.0.0.4:3000` on it is scrap paper. The request host is the
 * fallback so local development needs no configuration.
 */
export async function publicOrigin(): Promise<string> {
  const configured = process.env.TABLEKIT_PUBLIC_ORIGIN;
  if (configured) return configured.replace(/\/$/, "");

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const protocol =
    headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  return `${protocol}://${host}`;
}
