import webpush from "web-push";
import { readGlobalSettings, writeGlobalSettings, readUserSettings, writeUserSettings } from "./settings.js";

// mailto: is required by the Web Push spec as the VAPID "subject" — some
// push services use it to contact the sender if something's misbehaving.
// Self-hosted personal app, so there's no real support address; overridable
// via env if the owner wants their own reachable one.
const VAPID_SUBJECT = process.env.VAPID_CONTACT ?? "mailto:admin@localhost";

let vapidConfigured = false;

// Generates the server's VAPID keypair on first use and persists it to the
// same global-settings file the API keys live in — one keypair identifies
// this server to every push service, shared by every user's subscriptions.
// Idempotent: once the keys exist on disk, every call just re-applies them
// to the web-push module (cheap, and necessary once per process restart).
function ensureVapid(): { publicKey: string; privateKey: string } {
  const g = readGlobalSettings();
  if (g.vapidPublicKey && g.vapidPrivateKey) {
    if (!vapidConfigured) {
      webpush.setVapidDetails(VAPID_SUBJECT, g.vapidPublicKey, g.vapidPrivateKey);
      vapidConfigured = true;
    }
    return { publicKey: g.vapidPublicKey, privateKey: g.vapidPrivateKey };
  }
  const keys = webpush.generateVAPIDKeys();
  writeGlobalSettings({ vapidPublicKey: keys.publicKey, vapidPrivateKey: keys.privateKey });
  webpush.setVapidDetails(VAPID_SUBJECT, keys.publicKey, keys.privateKey);
  vapidConfigured = true;
  return keys;
}

export function getVapidPublicKey(): string {
  return ensureVapid().publicKey;
}

export interface PushPayload {
  title: string;
  body: string;
  tag: string;
  url?: string;
}

// Sends to every subscription this user has registered (one per
// browser/device), dropping any the push service reports as gone (404/410 —
// the user uninstalled, cleared site data, or the browser expired it) so
// they don't keep failing forever.
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  ensureVapid();
  const subs = readUserSettings(userId).pushSubscriptions;
  if (subs.length === 0) return;

  const staleEndpoints: string[] = [];
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload));
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          staleEndpoints.push(sub.endpoint);
        } else {
          console.error(`[push] send failed for ${userId} (${sub.endpoint.slice(0, 60)}...):`, err?.message ?? err);
        }
      }
    })
  );

  if (staleEndpoints.length > 0) {
    const fresh = readUserSettings(userId).pushSubscriptions.filter((s) => !staleEndpoints.includes(s.endpoint));
    writeUserSettings(userId, { pushSubscriptions: fresh });
  }
}
