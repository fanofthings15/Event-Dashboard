import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { CropRect } from "../settingsTypes";
import { toEmbedUrl } from "../streamEmbed";

// The first stream on an event that can actually be framed — a YouTube
// channel's /live tab has no video id to embed, so it's skipped in favour
// of whatever comes next (usually Twitch).
export function embeddableStream(urls: string[]): { embed: string; source: string } | null {
  for (const url of urls) {
    const embed = toEmbedUrl(url, { muted: true });
    if (/^https:\/\/(www\.)?youtube\.com\/embed\//.test(embed)) return { embed, source: "YouTube" };
    if (embed.startsWith("https://player.twitch.tv/")) return { embed, source: "Twitch" };
  }
  return null;
}

// Plays a stream zoomed so only `crop` (fractions of the 16:9 frame) fills
// the container — the iframe itself is rendered large and positioned so the
// minimap lands in view, with everything else clipped by overflow: hidden.
// A browser can't read pixels out of a cross-origin player, so this is pure
// CSS: it can't tell when a replay or ad covers the minimap.
export default function StreamCrop({ embed, crop }: { embed: string; crop: CropRect | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  let style: CSSProperties = { inset: 0, width: "100%", height: "100%" };
  if (crop && size.w > 0) {
    const cw = crop.w;
    const ch = (crop.h * 9) / 16; // crop height in frame-width units
    const scale = Math.max(size.w / cw, size.h / ch); // px per frame width, covering the container
    const frameW = scale;
    const frameH = (scale * 9) / 16;
    style = {
      left: -crop.x * frameW + (size.w - cw * scale) / 2,
      top: -crop.y * frameH + (size.h - ch * scale) / 2,
      width: frameW,
      height: frameH,
    };
  }

  return (
    <div ref={ref} className="live-crop">
      <iframe src={embed} title="Live stream" allow="autoplay; encrypted-media" style={{ position: "absolute", border: 0, pointerEvents: "none", ...style }} />
    </div>
  );
}
