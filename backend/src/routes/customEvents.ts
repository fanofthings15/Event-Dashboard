import { Router } from "express";
import { readSettings } from "../settings.js";
import type { NormalizedEvent } from "../types.js";

const router = Router();

router.get("/", (_req, res) => {
  const { customEvents } = readSettings();
  const now = Date.now();

  const events: NormalizedEvent[] = customEvents.map((c) => {
    const start = new Date(c.startTime).getTime();
    const end = start + c.durationMinutes * 60_000;
    const status: NormalizedEvent["status"] = now < start ? "upcoming" : now < end ? "live" : "finished";
    return {
      id: c.id,
      sport: "custom",
      league: c.league,
      name: c.name,
      startTime: c.startTime,
      durationMinutes: c.durationMinutes,
      status,
      color: c.color,
      detailUrl: c.url,
      manuallyFollowed: true,
    };
  });

  res.json({ events, source: "custom" });
});

export default router;
