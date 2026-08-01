"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * A dish photograph in its rounded frame.
 *
 * The frame is drawn whether or not the image arrives. Photography is often
 * hosted off-site, cafe wifi is unreliable, and an item rendering a broken
 * image icon reads as a broken menu — where an empty warm tile just reads as
 * an item without a photo, which half of them will be.
 *
 * The old system printed every photograph in pure black and white. That was
 * the single most appetite-suppressing thing about it, so images now take a
 * light warm grade instead: coherent, still food.
 */
export function Thumb({
  src,
  alt = "",
  size,
  radius = "var(--radius-md)",
  priority = false,
}: {
  src: string | null;
  alt?: string;
  size: number;
  radius?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <span
      className="relative block shrink-0 overflow-hidden"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: "linear-gradient(140deg, var(--color-gold-100), var(--color-primary-100))",
        boxShadow: "inset 0 0 0 1px var(--color-border)",
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
          // optimizer for our own ~1KB vectors keeps that flag off.
          unoptimized={src.endsWith(".svg")}
          className="photo-warm object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
