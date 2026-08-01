"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * The dining-room photograph across the top of the menu.
 *
 * Same reasoning as `Thumb`: the band keeps its height and its neutral fill
 * whether or not the image arrives, so a slow or missing hero costs the guest
 * nothing but a plain grey strip — never a broken-image icon at the very top
 * of the page, which is the worst possible first impression for a menu that
 * is part of the room.
 */
export function HeroImage({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) return null;

  return (
    <Image
      src={src}
      alt={alt}
      fill
      priority
      sizes="480px"
      // See the note in `Thumb` — the bundled hero is SVG, and turning on
      // `dangerouslyAllowSVG` for it would also permit remote SVG.
      unoptimized={src.endsWith(".svg")}
      className="object-cover"
      style={{ filter: "grayscale(1) contrast(1.05)" }}
      onError={() => setFailed(true)}
    />
  );
}
