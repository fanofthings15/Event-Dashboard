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
export function toEmbedUrl(rawUrl: string, { muted = true }: { muted?: boolean } = {}): string {
  const url = rawUrl.trim();
  const muteParam = muted ? "&mute=1" : "";
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const id = u.pathname.slice(1);
      if (id) return `https://www.youtube.com/embed/${id}?autoplay=1${muteParam}`;
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      if (u.pathname === "/watch") {
        const id = u.searchParams.get("v");
        if (id) return `https://www.youtube.com/embed/${id}?autoplay=1${muteParam}`;
      }
      if (u.pathname.startsWith("/live/")) {
        const id = u.pathname.split("/")[2];
        if (id) return `https://www.youtube.com/embed/${id}?autoplay=1${muteParam}`;
      }
      if (u.pathname.startsWith("/embed/")) {
        u.searchParams.set("autoplay", "1");
        if (muted) u.searchParams.set("mute", "1");
        else u.searchParams.delete("mute");
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
