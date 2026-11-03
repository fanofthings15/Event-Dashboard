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

// The stream a frame is on, leaving out its mute setting: a tile gaining or
// losing the sound is the same stream.
function streamIdentity(embed: string): string {
  try {
    const u = new URL(embed);
    u.searchParams.delete("mute");
    u.searchParams.delete("muted");
    return u.toString();
  } catch {
    return embed;
  }
}

const embedMuted = (embed: string) => /[?&]mute(d)?=(1|true)(&|$)/.test(embed);

// Mutes or unmutes a player that's already playing, without reloading it.
// YouTube: the IFrame API's postMessage commands (the embed has enablejsapi=1).
// Twitch: the same message Twitch's own embed script (embed.twitch.tv/embed/v1.js)
// sends the player.twitch.tv frame — SetMuted is command 10 there.
// Kick has no player API, so it returns false and the frame is reloaded.
function setPlayerMuted(frame: HTMLIFrameElement, embed: string, muted: boolean): boolean {
  const win = frame.contentWindow;
  if (!win) return false;
  if (/^https:\/\/(www\.)?youtube\.com\/embed\//.test(embed)) {
    win.postMessage(JSON.stringify({ event: "command", func: muted ? "mute" : "unMute", args: [] }), new URL(embed).origin);
    return true;
  }
  if (embed.startsWith("https://player.twitch.tv/")) {
    win.postMessage({ eventName: 10, params: muted, namespace: "twitch-embed-player-proxy" }, "https://player.twitch.tv");
    return true;
  }
  return false;
}

// The player's address is set from code once the frame is in the page, not
// as a src attribute: on a reload, a browser can put each iframe back on the
// page it last showed, matched by position in the page rather than by src.
// After games moved between spots, a tile came back playing another game's
// stream (the Aurora tile showing MongolZ, and refreshing didn't help).
// Navigating the frame ourselves always wins over that restore.
//
// Only a different stream reloads the frame. A tile gaining or losing the
// sound (a new game taking the big spot) is told to mute or unmute instead:
// reloading restarted the stream, and undid a mute done by hand in the player.
export default function Stream({ embed }: { embed: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const loaded = useRef<string | null>(null);
  useEffect(() => {
    const f = frame.current;
    if (!f) return;
    const id = streamIdentity(embed);
    if (loaded.current === id && setPlayerMuted(f, embed, embedMuted(embed))) return;
    loaded.current = id;
    if (f.src !== embed) f.src = embed;
  }, [embed]);
  return (
    <div className="lv-stream">
      <iframe ref={frame} title="Live stream" allow="autoplay; encrypted-media; fullscreen" allowFullScreen />
    </div>
  );
}
