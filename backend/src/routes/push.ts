import { Router } from "express";
import { readUserSettings, writeUserSettings, type PushSubscriptionRecord } from "../settings.js";
import { getUserId } from "../userContext.js";
import { getVapidPublicKey, sendPushToUser } from "../push.js";

const router = Router();

// The frontend needs this to construct the PushManager.subscribe() call —
// it's the public half of the server's VAPID keypair, safe to hand out to
// any authenticated user.
router.get("/vapid-public-key", (_req, res) => {
  res.json({ publicKey: getVapidPublicKey() });
});

function isValidSubscription(body: any): body is PushSubscriptionRecord {
  return (
    body &&
    typeof body.endpoint === "string" &&
    body.endpoint.length > 0 &&
    body.keys &&
    typeof body.keys.p256dh === "string" &&
    typeof body.keys.auth === "string"
  );
}

// Upsert by endpoint — resubscribing (e.g. the browser rotated its push
// endpoint) replaces the old record instead of accumulating duplicates.
router.post("/subscribe", (req, res) => {
  if (!isValidSubscription(req.body)) return res.status(400).json({ error: "Invalid push subscription" });
  const { endpoint, keys } = req.body as PushSubscriptionRecord;
  const userId = getUserId(req);
  const existing = readUserSettings(userId).pushSubscriptions;
  const next = [...existing.filter((s) => s.endpoint !== endpoint), { endpoint, keys }];
  writeUserSettings(userId, { pushSubscriptions: next });
  res.json({ ok: true });
});

// Body: { endpoint } to drop just this device, or omit it to clear every
// subscription this user has (e.g. a "disable push everywhere" action).
router.post("/unsubscribe", (req, res) => {
  const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint : undefined;
  const userId = getUserId(req);
  const next = endpoint ? readUserSettings(userId).pushSubscriptions.filter((s) => s.endpoint !== endpoint) : [];
  writeUserSettings(userId, { pushSubscriptions: next });
  res.json({ ok: true });
});

router.post("/test", async (req, res) => {
  const userId = getUserId(req);
  if (readUserSettings(userId).pushSubscriptions.length === 0) {
    return res.status(400).json({ error: "No push subscriptions on file for this user yet" });
  }
  await sendPushToUser(userId, { title: "Event Dashboard", body: "Push notifications are set up correctly.", tag: "push-test" });
  res.json({ ok: true });
});

export default router;
