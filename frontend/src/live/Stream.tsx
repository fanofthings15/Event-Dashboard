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

export default function Stream({ embed }: { embed: string }) {
  return (
    <div className="lv-stream">
      <iframe src={embed} title="Live stream" allow="autoplay; encrypted-media; fullscreen" allowFullScreen />
    </div>
  );
}
