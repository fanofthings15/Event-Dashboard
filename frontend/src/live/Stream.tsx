import { useEffect, useRef } from "react";
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
export default function Stream({ embed }: { embed: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    if (frame.current && frame.current.src !== embed) frame.current.src = embed;
  }, [embed]);
  return (
    <div className="lv-stream">
      <iframe ref={frame} title="Live stream" allow="autoplay; encrypted-media; fullscreen" allowFullScreen />
    </div>
  );
}
