// Converts a pasted stream link into something embeddable in an <iframe>.
// YouTube and Twitch get special-cased (neither is embeddable as-is —
// Twitch actively blocks framing outside player.twitch.tv via CSP unless
// given a `parent` param naming the embedding domain, so a raw twitch.tv
// link just renders blank everywhere, not only in Firefox); everything else
// is assumed to already allow framing and is used verbatim — the streams
// tab has no source-discovery API, the user pastes whatever link they
// found. The esports backend ranks YouTube, then Kick, ahead of Twitch when a
// match offers several (see platformRank in routes/esports.ts) — this is
// only reached with a Twitch link when that's genuinely the only stream on
// offer, or the user pasted one by hand. Kick channels embed through
// player.kick.com, which allows framing from any site.
//
// `muted` defaults to true (needed for autoplay to reliably work at all —
// browsers block unmuted autoplay outright) but the main/primary tile is
// rendered unmuted so there's sound without an extra click; secondary/minor
// tiles stay muted so multiple streams don't talk over each other.
// `enablejsapi=1` plus a matching `origin` is what lets youtubeQuality.ts
// attach the real IFrame Player API to the embed afterwards — needed to
// force max quality (see toEmbedUrl's own note on why that can't just be a
// URL param). `origin` isn't required for the API to work, but YouTube's
// own docs recommend it as a postMessage security check.
const jsApiParams =
  typeof window !== "undefined" ? `&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}` : "&enablejsapi=1";

// The live display draws its own controls over every player
// (live/StreamControls.tsx), so the players' own are turned off: YouTube's
// controls=0 drops its bar (mute, gear, fullscreen); playsinline stops an
// iPhone opening its own fullscreen player; rel=0 keeps end-screen
// suggestions to the same channel; iv_load_policy=3 hides annotations;
// disablekb=1 stops its keyboard shortcuts. Twitch's controls=false drops its
// whole bar (checked in headless Chrome 2026-11-06). Kick has no such option;
// the overlay keeps the mouse off its player, so its bar never appears.
// nativeControls() puts them back, for "the player's own controls".
const ytControlParams = "&controls=0&playsinline=1&rel=0&iv_load_policy=3&disablekb=1";
const YT_CONTROL_KEYS: [string, string][] = [
  ["controls", "0"],
  ["playsinline", "1"],
  ["rel", "0"],
  ["iv_load_policy", "3"],
  ["disablekb", "1"],
];

// Twitch's embed player refuses to load unless `parent` names the exact
// hostname (no protocol/port) it's being framed from — omitting it, or
// getting it wrong, is why a raw twitch.tv link just shows blank.
function twitchParentParam(): string {
  return typeof window !== "undefined" ? `&parent=${encodeURIComponent(window.location.hostname)}` : "";
}

export function toEmbedUrl(rawUrl: string, { muted = true }: { muted?: boolean } = {}): string {
  const url = rawUrl.trim();
  const muteParam = muted ? "&mute=1" : "";
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const id = u.pathname.slice(1);
      if (id) return `https://www.youtube.com/embed/${id}?autoplay=1${muteParam}${jsApiParams}${ytControlParams}`;
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      if (u.pathname === "/watch") {
        const id = u.searchParams.get("v");
        if (id) return `https://www.youtube.com/embed/${id}?autoplay=1${muteParam}${jsApiParams}${ytControlParams}`;
      }
      if (u.pathname.startsWith("/live/")) {
        const id = u.pathname.split("/")[2];
        if (id) return `https://www.youtube.com/embed/${id}?autoplay=1${muteParam}${jsApiParams}${ytControlParams}`;
      }
      if (u.pathname.startsWith("/embed/")) {
        u.searchParams.set("autoplay", "1");
        if (muted) u.searchParams.set("mute", "1");
        else u.searchParams.delete("mute");
        u.searchParams.set("enablejsapi", "1");
        if (typeof window !== "undefined") u.searchParams.set("origin", window.location.origin);
        for (const [k, v] of YT_CONTROL_KEYS) u.searchParams.set(k, v);
        return u.toString();
      }
      // A channel's live tab (e.g. /@handle/live or /channel/UC.../live) has
      // no stable video id to extract client-side — hand it back as-is
      // rather than guessing wrong; it just won't autoplay embedded.
    }

    if (host === "kick.com") {
      const channel = u.pathname.split("/").filter(Boolean)[0];
      if (channel) return `https://player.kick.com/${encodeURIComponent(channel)}?autoplay=true&muted=${muted ? "true" : "false"}`;
    }

    if (host === "player.kick.com") {
      u.searchParams.set("autoplay", "true");
      u.searchParams.set("muted", muted ? "true" : "false");
      return u.toString();
    }

    if (host === "twitch.tv") {
      const parentParam = twitchParentParam();
      const twitchMute = `&muted=${muted ? "true" : "false"}&controls=false`;
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts[0] === "videos" && parts[1]) {
        return `https://player.twitch.tv/?video=${parts[1]}&autoplay=true${twitchMute}${parentParam}`;
      }
      if (parts.length >= 1 && parts[0] !== "directory") {
        // /<channel> is the live channel itself — the common case for a
        // followed esports broadcast. A clip URL (/<channel>/clip/<slug>)
        // falls through to this too and embeds the channel rather than the
        // clip, but clips aren't what live-event stream links point to.
        return `https://player.twitch.tv/?channel=${encodeURIComponent(parts[0])}&autoplay=true${twitchMute}${parentParam}`;
      }
    }

    if (host === "player.twitch.tv") {
      // Already embed-shaped (e.g. pasted straight from a "copy embed code")
      // — just make sure autoplay/mute/parent are set the way we need them.
      if (!u.searchParams.has("parent")) {
        const parent = twitchParentParam();
        if (parent) new URLSearchParams(parent.slice(1)).forEach((v, k) => u.searchParams.set(k, v));
      }
      u.searchParams.set("autoplay", "true");
      u.searchParams.set("muted", muted ? "true" : "false");
      u.searchParams.set("controls", "false");
      return u.toString();
    }

    return url;
  } catch {
    return url;
  }
}

// Whether toEmbedUrl produced a real youtube.com/embed/ URL — the only
// shape the IFrame Player API (and so forced quality) can attach to.
export function isYoutubeEmbed(embedUrl: string): boolean {
  return /^https:\/\/(www\.)?youtube\.com\/embed\//.test(embedUrl);
}

// The same player with its own controls back (YouTube's bar, Twitch's bar),
// for when the live display's overlay is switched off for a stream.
export function nativeControls(embedUrl: string): string {
  try {
    const u = new URL(embedUrl);
    if (isYoutubeEmbed(embedUrl)) {
      for (const [k] of YT_CONTROL_KEYS) if (k !== "playsinline") u.searchParams.delete(k);
    } else {
      u.searchParams.delete("controls");
    }
    return u.toString();
  } catch {
    return embedUrl;
  }
}

export type StreamSource = "YouTube" | "Twitch" | "Kick";

// The first link that can actually be framed — a YouTube channel's /live
// tab has no video id to embed, so it's skipped in favour of whatever comes
// next (Kick, then Twitch, in the backend's ranking).
// Muted unless asked otherwise: browsers block unmuted autoplay, and only
// the multi-game display's big spot plays with sound.
export function embeddableStream(urls: string[], muted = true): { embed: string; source: StreamSource } | null {
  for (const url of urls) {
    const embed = toEmbedUrl(url, { muted });
    if (isYoutubeEmbed(embed)) return { embed, source: "YouTube" };
    if (embed.startsWith("https://player.kick.com/")) return { embed, source: "Kick" };
    if (embed.startsWith("https://player.twitch.tv/")) return { embed, source: "Twitch" };
  }
  return null;
}

// The stream a frame is on, leaving out its mute setting: a tile gaining or
// losing the sound is the same stream.
export function streamIdentity(embed: string): string {
  try {
    const u = new URL(embed);
    u.searchParams.delete("mute");
    u.searchParams.delete("muted");
    return u.toString();
  } catch {
    return embed;
  }
}

export interface StreamOption {
  url: string; // the link as the source gave it (a youtube.com/watch, twitch.tv or kick.com page)
  source: StreamSource;
  label: string; // "YouTube", or "YouTube 2" when one game has two
}

// Every stream of a game that can play on the display, in the order given
// (the backend's ranking), one per player — the stream switcher's list.
export function streamOptions(urls: string[]): StreamOption[] {
  const out: StreamOption[] = [];
  const seen = new Set<string>();
  for (const url of urls) {
    const s = embeddableStream([url]);
    if (!s) continue;
    const id = streamIdentity(s.embed);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ url, source: s.source, label: s.source });
  }
  const total: Record<string, number> = {};
  for (const o of out) total[o.source] = (total[o.source] ?? 0) + 1;
  const n: Record<string, number> = {};
  for (const o of out) {
    if (total[o.source] < 2) continue;
    n[o.source] = (n[o.source] ?? 0) + 1;
    o.label = `${o.source} ${n[o.source]}`;
  }
  return out;
}

export interface PickedStream {
  embed: string;
  source: StreamSource;
  url: string;
  options: StreamOption[];
}

// The stream to play: the one picked in the switcher if the game still has
// it, otherwise the first that can play.
export function pickStream(urls: string[], pick: string | undefined, muted = true): PickedStream | null {
  const options = streamOptions(urls);
  if (!options.length) return null;
  const chosen = options.find((o) => o.url === pick) ?? options[0];
  const s = embeddableStream([chosen.url], muted);
  return s ? { ...s, url: chosen.url, options } : null;
}
