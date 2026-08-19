import type { Request } from "express";
import { DEFAULT_USER_ID, sanitizeUserId } from "./settings.js";

// Traefik's Authentik forward-auth middleware sets this on every
// authenticated request before it reaches this app — see the repo-level
// docs for the full header list (X-authentik-uid/username/email/name/groups).
// Falls back to DEFAULT_USER_ID when the header is missing entirely, which
// is what happens running `bun run dev` directly without Traefik in front —
// keeps local iteration working without needing Authentik at all.
export function getUserId(req: Request): string {
  return sanitizeUserId(req.header("X-authentik-uid"));
}

// Only these Authentik uids may read/write the global, admin-only API-key
// settings (/api/global-settings) — everyone else gets a 403. Configure via
// the ADMIN_UID env var (comma-separated for more than one admin uid).
// Defaults to just DEFAULT_USER_ID, the same fallback used when there's no
// X-authentik-uid header at all, so a bare `bun run dev` keeps working
// without extra setup. Once actually deployed behind Authentik, set
// ADMIN_UID to the owner's real Authentik uid so the "add/replace API key"
// fields keep working there too — see settings.ts's migration note for
// more on this.
const ADMIN_UIDS = new Set(
  (process.env.ADMIN_UID ?? DEFAULT_USER_ID)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

export function isAdmin(req: Request): boolean {
  return ADMIN_UIDS.has(getUserId(req));
}
