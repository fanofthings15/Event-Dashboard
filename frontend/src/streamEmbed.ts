// Converts a pasted stream link into something embeddable in an <iframe>.
// Only YouTube gets special-cased (watch/live/youtu.be links aren't
// embeddable as-is); everything else is assumed to already allow framing
// and is used verbatim — the streams tab has no source-discovery API, the
// user pastes whatever link they found.
export function toEmbedUrl(rawUrl: string): string {
  const url = rawUrl.trim();
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const id = u.pathname.slice(1);
      if (id) return `https://www.youtube.com/embed/${id}?autoplay=1&mute=1`;
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      if (u.pathname === "/watch") {
        const id = u.searchParams.get("v");
        if (id) return `https://www.youtube.com/embed/${id}?autoplay=1&mute=1`;
      }
      if (u.pathname.startsWith("/live/")) {
        const id = u.pathname.split("/")[2];
        if (id) return `https://www.youtube.com/embed/${id}?autoplay=1&mute=1`;
      }
      if (u.pathname.startsWith("/embed/")) {
        u.searchParams.set("autoplay", "1");
        u.searchParams.set("mute", "1");
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
