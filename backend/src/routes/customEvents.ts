import { Router } from "express";
import { readUserSettings } from "../settings.js";
import { getUserId } from "../userContext.js";
import type { NormalizedEvent } from "../types.js";

const router = Router();

router.get("/", (req, res) => {
  const { customEvents } = readUserSettings(getUserId(req));
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
