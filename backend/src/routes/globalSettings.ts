import { Router } from "express";
import { readGlobalSettings, writeGlobalSettings, type GlobalSettings } from "../settings.js";
import { isAdmin } from "../userContext.js";

const router = Router();

// Admin-only: the owner's own paid/rate-limited PandaScore + TBA API keys.
// One shared file, gated to the uid(s) in ADMIN_UID (see userContext.ts) —
// unlike routes/settings.ts, this never scopes by user because there's only
// ever one set of keys for the whole app to share. Note the keys' actual
// values never leave the server either way — only whether one is set.
router.get("/", (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "Admin only" });
  const settings = readGlobalSettings();
  res.json({
    pandaScoreApiKeySet: Boolean(settings.pandaScoreApiKey),
    tbaApiKeySet: Boolean(settings.tbaApiKey),
  });
});

router.post("/", (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "Admin only" });
  const body = req.body ?? {};
  const next: Partial<GlobalSettings> = {};

  if (typeof body.pandaScoreApiKey === "string" && body.pandaScoreApiKey.length > 0) {
    next.pandaScoreApiKey = body.pandaScoreApiKey;
  }
  if (typeof body.tbaApiKey === "string" && body.tbaApiKey.length > 0) {
    next.tbaApiKey = body.tbaApiKey;
  }

  writeGlobalSettings(next);
  res.json({ ok: true });
});

export default router;
