// Converts a pasted stream link into something embeddable in an <iframe>.
// YouTube and Twitch get special-cased (neither is embeddable as-is —
// Twitch actively blocks framing outside player.twitch.tv via CSP unless
// given a `parent` param naming the embedding domain, so a raw twitch.tv
// link just renders blank everywhere, not only in Firefox); everything else
// is assumed to already allow framing and is used verbatim — the streams
// tab has no source-discovery API, the user pastes whatever link they
// found. The esports backend already ranks YouTube ahead of Twitch when a
// match offers both (see platformRank in routes/esports.ts) — this is only
// reached with a Twitch link when that's genuinely the only stream on
// offer, or the user pasted one by hand.
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
      if (id) return `https://www.youtube.com/embed/${id}?autoplay=1${muteParam}${jsApiParams}`;
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      if (u.pathname === "/watch") {
        const id = u.searchParams.get("v");
        if (id) return `https://www.youtube.com/embed/${id}?autoplay=1${muteParam}${jsApiParams}`;
      }
      if (u.pathname.startsWith("/live/")) {
        const id = u.pathname.split("/")[2];
        if (id) return `https://www.youtube.com/embed/${id}?autoplay=1${muteParam}${jsApiParams}`;
      }
      if (u.pathname.startsWith("/embed/")) {
        u.searchParams.set("autoplay", "1");
        if (muted) u.searchParams.set("mute", "1");
        else u.searchParams.delete("mute");
        u.searchParams.set("enablejsapi", "1");
        if (typeof window !== "undefined") u.searchParams.set("origin", window.location.origin);
        return u.toString();
      }
      // A channel's live tab (e.g. /@handle/live or /channel/UC.../live) has
      // no stable video id to extract client-side — hand it back as-is
      // rather than guessing wrong; it just won't autoplay embedded.
    }

    if (host === "twitch.tv") {
      const parentParam = twitchParentParam();
      const twitchMute = `&muted=${muted ? "true" : "false"}`;
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
