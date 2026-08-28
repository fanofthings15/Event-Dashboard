// Converts a pasted stream link into something embeddable in an <iframe>.
// Only YouTube gets special-cased (watch/live/youtu.be links aren't
// embeddable as-is); everything else is assumed to already allow framing
// and is used verbatim — the streams tab has no source-discovery API, the
// user pastes whatever link they found.
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
