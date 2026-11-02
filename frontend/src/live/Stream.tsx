import { useEffect, useRef, useState } from "react";
import { toEmbedUrl } from "../streamEmbed";

// The first link that can actually be framed — a YouTube channel's /live
// tab has no video id to embed, so it's skipped in favour of whatever comes
// next (Kick, then Twitch, in the backend's ranking).
// Muted unless asked otherwise: browsers block unmuted autoplay, and only
// the multi-game display's big spot plays with sound.
export function embeddableStream(urls: string[], muted = true): { embed: string; source: string } | null {
  for (const url of urls) {
    const embed = toEmbedUrl(url, { muted });
    if (/^https:\/\/(www\.)?youtube\.com\/embed\//.test(embed)) return { embed, source: "YouTube" };
    if (embed.startsWith("https://player.kick.com/")) return { embed, source: "Kick" };
    if (embed.startsWith("https://player.twitch.tv/")) return { embed, source: "Twitch" };
  }
  return null;
}

// The player's address is set from code once the frame is in the page, not
// as a src attribute: on a reload, a browser can put each iframe back on the
// page it last showed, matched by position in the page rather than by src.
// After games moved between spots, a tile came back playing another game's
// stream (the Aurora tile showing MongolZ, and refreshing didn't help).
// Navigating the frame ourselves always wins over that restore.
// Twitch won't autoplay a player smaller than 400×300 — a small RedZone
// tile's player (361×203 on a 1080p screen) sat on its play button after a
// reload. Below that, the frame is laid out at 533×300 (16:9, over the
// minimum) and scaled down to fit: Twitch measures the frame's own size,
// which a CSS scale doesn't change.
const TWITCH_MIN = { w: 533, h: 300 };

export default function Stream({ embed }: { embed: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);
  const twitch = embed.startsWith("https://player.twitch.tv/");

  useEffect(() => {
    if (frame.current && frame.current.src !== embed) frame.current.src = embed;
  }, [embed]);

  useEffect(() => {
    const el = box.current;
    if (!twitch || !el) {
      setScale(null);
      return;
    }
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      setScale(width < 400 || height < 300 ? width / TWITCH_MIN.w : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [twitch]);

  return (
    <div className="lv-stream" ref={box}>
      <iframe
        ref={frame}
        title="Live stream"
        allow="autoplay; encrypted-media; fullscreen"
        allowFullScreen
        style={
          scale !== null
            ? { width: TWITCH_MIN.w, height: TWITCH_MIN.h, right: "auto", bottom: "auto", transform: `scale(${scale})`, transformOrigin: "0 0" }
            : undefined
        }
      />
    </div>
  );
}
