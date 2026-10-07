// Discord has no way to hand a plain incoming webhook read access to its
// own channel (reactions, message content) — that needs a whole separate
// bot application with its own token and server invite. A markdown link in
// the message gets the same "act on this notification" outcome (muting an
// event) without any of that: Discord renders it as a clickable link in
// both the desktop and mobile clients, no bot required.
export interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
}

export async function sendDiscordWebhook(webhookUrl: string, embed: DiscordEmbed): Promise<void> {
  const r = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [{ ...embed, timestamp: new Date().toISOString() }] }),
  });
  if (!r.ok) {
    throw new Error(`Discord webhook responded ${r.status}: ${(await r.text().catch(() => "")).slice(0, 300)}`);
  }
}
