"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * A food photograph in its bordered box.
 *
 * The box is drawn whether or not the image arrives. Menu photography is
 * hosted off-site, cafe wifi is unreliable, and an item that renders a broken
 * image icon reads as a broken menu — where an empty framed square just reads
 * as an item without a photo, which half of them are anyway.
 *
 * Every photograph goes through the system's grayscale treatment: the design
 * prints imagery in pure black and white, and that is a rule of the system
 * rather than a choice made per screen.
 */
export function Thumb({
  src,
  alt = "",
  size,
  borderWidth = 2,
  contrast = true,
  priority = false,
}: {
  src: string | null;
  alt?: string;
  size: number;
  borderWidth?: number;
  /** The hero and menu rows carry the extra contrast bump; small chips do not. */
  contrast?: boolean;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <span
      className="relative block shrink-0 overflow-hidden"
      style={{
        width: size,
        height: size,
        border: `${borderWidth}px solid var(--color-text)`,
        background: "var(--color-neutral-300)",
      }}
    >
      {src && !failed && (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={`${size}px`}
          priority={priority}
          // The bundled menu artwork is SVG. Next's optimizer refuses SVG
          // unless `dangerouslyAllowSVG` is on — which would also apply to
          // remote SVG, and remote SVG can carry script. Bypassing the
          // optimizer for our own files keeps that flag off: these are already
          // ~1KB vectors that need no resizing.
          unoptimized={src.endsWith(".svg")}
          className="object-cover"
          style={{ filter: contrast ? "grayscale(1) contrast(1.08)" : "grayscale(1)" }}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
