import { Router } from "express";
import { findUserIdByDiscordMuteToken, readUserSettings, writeUserSettings } from "../settings.js";
import { getUserId } from "../userContext.js";
import { sendDiscordWebhook } from "../discordNotify.js";

const router = Router();

function page(icon: string, message: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Event Dashboard</title>
<style>
  body { margin: 0; height: 100vh; display: flex; align-items: center; justify-content: center; background: #0f1115; color: #e8eaed; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .card { background: #171a21; border: 1px solid #262b35; border-radius: 12px; padding: 32px; max-width: 360px; text-align: center; }
  .icon { font-size: 40px; margin-bottom: 12px; }
</style>
</head>
<body><div class="card"><div class="icon">${icon}</div><div>${message}</div></div></body>
</html>`;
}

// Clicked straight out of Discord's client (desktop or mobile), which can't
// complete an interactive Authentik login — sits outside Authentik's
// forward-auth the same way /calendar.ics does (an infra-side Traefik
// carve-out; see Home-Wiki's coolify-apps.yml). The ?t= token is the only
// identity this route trusts, same pattern as ics.ts's ?token=.
router.get("/mute", (req, res) => {
  const token = typeof req.query.t === "string" ? req.query.t : "";
  const event = typeof req.query.event === "string" ? req.query.event : "";
  const userId = findUserIdByDiscordMuteToken(token);
  if (!userId || !event) {
    res.status(401).send(page("⚠️", "Invalid or expired mute link."));
    return;
  }
  const settings = readUserSettings(userId);
  if (!settings.snoozedEventIds.includes(event)) {
    writeUserSettings(userId, { snoozedEventIds: [...settings.snoozedEventIds, event] });
  }
  res.send(page("🔇", "Muted — no more notifications for this event."));
});

router.post("/test", async (req, res) => {
  const userId = getUserId(req);
  const { discordWebhookUrl } = readUserSettings(userId);
  if (!discordWebhookUrl) {
    return res.status(400).json({ error: "No Discord webhook URL saved yet" });
  }
  try {
    await sendDiscordWebhook(discordWebhookUrl, {
      title: "Event Dashboard",
      description: "Discord notifications are set up correctly.",
      color: 0x4f8dfd,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: "Discord rejected the webhook", detail: String(err) });
  }
});

export default router;
