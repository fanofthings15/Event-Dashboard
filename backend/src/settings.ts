import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { DEFAULT_ENABLED_SLUGS } from "./esportsCatalog.js";

const APP_DIR = path.join(os.homedir(), ".event-dashboard");
// Global, admin-only file — unchanged path from the pre-multi-user app, but
// now holds only the two API keys (see GlobalSettings below). Everything
// else that used to live here moved to a per-user file under USERS_DIR.
const GLOBAL_SETTINGS_FILE = path.join(APP_DIR, "settings.json");
const USERS_DIR = path.join(APP_DIR, "users");

// Fallback identity used both when a request carries no X-authentik-uid
// header at all (e.g. `bun run dev` without Traefik/Authentik in front of
// it) and as the migration target for the old single-user settings.json's
// per-user fields (see migrateLegacySettingsIfNeeded below) — so a solo
// `bun run dev` still sees the real pre-existing data without needing
// Authentik running at all.
export const DEFAULT_USER_ID = "local";

const SAFE_USER_ID = /^[A-Za-z0-9_.-]+$/;

// Authentik uids are expected to be simple opaque ids, but this value comes
// from an HTTP header — don't trust it blindly as a filesystem directory
// name (path traversal, empty string, etc.). Anything that doesn't look
// like a plain id falls back to DEFAULT_USER_ID.
export function sanitizeUserId(rawUserId: string | undefined | null): string {
  const trimmed = rawUserId?.trim();
  if (!trimmed) return DEFAULT_USER_ID;
  return SAFE_USER_ID.test(trimmed) ? trimmed : DEFAULT_USER_ID;
}

export interface CustomEvent {
  id: string;
  name: string;
  league: string;
  color: string; // hex
  startTime: string; // ISO 8601
  durationMinutes: number; // used to compute live/upcoming/finished
  url?: string;
}

// Global, admin-only: the owner's own paid/rate-limited external API
// credentials. One shared file — every user's requests use the same keys
// (and share the same rate limit either way), but only an admin uid can
// see whether a key is set or change it. See userContext.ts's isAdmin().
export interface GlobalSettings {
  pandaScoreApiKey: string;
  tbaApiKey: string; // The Blue Alliance Read API key, for FRC events
}

// Per-user: everything else that used to live in the single shared
// Settings object — one JSON file per Authentik user, at
// ~/.event-dashboard/users/<uid>/settings.json.
export interface UserSettings {
  frcTeamKey: string; // e.g. "frc254"
  // Whether to actually tag events where frcTeamKey is competing — lets the
  // team key be saved without immediately turning tagging on/off.
  frcFollowEnabled: boolean;
  // State/province codes (e.g. "MI") to show FRC events from. Empty means
  // show every region — this is an include-list, not exclude, since picking
  // 2-3 wanted regions is more natural than excluding everywhere else.
  frcRegions: string[];
  // League names to hide everywhere, matched case-insensitively as a
  // substring (e.g. "LCK Challengers League" hides that specific league
  // without touching the main LCK league).
  excludedLeagues: string[];
  // Core sources (nfl, f1, nba, nhl, frc) the user has turned off entirely.
  disabledCoreSources: string[];
  // PandaScore game slugs currently pulled (see esportsCatalog.ts for the
  // full list of what's available to enable).
  enabledEsportsGames: string[];
  customEvents: CustomEvent[];
  // Per-sport color overrides (sport key -> hex), layered on top of the
  // built-in defaults so a user can fix any pair they still find too close.
  sportColorOverrides: Record<string, string>;
  // Team names to watch across every sport (not just FRC) — matched against
  // each event's team list to set the same "followed" badge FRC uses.
  favoriteTeams: string[];
  // Whether to fire a browser notification when a favorited/followed
  // event goes live.
  notifyOnLive: boolean;
  // How often the frontend polls for new data, in seconds.
  pollIntervalSeconds: number;
  theme: "dark" | "light";
  // When on, /calendar.ics only includes events matching favoriteTeams (or
  // FRC's own followed-team tag) instead of everything currently enabled —
  // for someone who wants their synced calendar limited to specific teams,
  // not just whole sports/leagues.
  icsFavoritesOnly: boolean;
  // Specific events manually followed via the detail view's "Follow event"
  // button — stored as "sport-id" composite keys. Distinct from
  // favoriteTeams (which matches by team name): this is a one-off follow
  // for a single event, not a standing team preference.
  followedEventIds: string[];
  // "followed" = only notify for events matching a favorite team / manual
  // follow (the default, avoids spam); "all" = notify for every live event
  // across every enabled source.
  notifyMode: "followed" | "all";
  // Finished events the user has explicitly dismissed from the Finished
  // view — stored as "sport-id" composite keys, same shape as
  // followedEventIds.
  dismissedFinishedEventIds: string[];
  // Minutes before an event starts to send a heads-up notification, on top
  // of the always-on at-live one — any combination (e.g. [0, 30] for both
  // "at start" and "30 min before").
  notifyLeadMinutes: number[];
  // Play a short ping alongside the browser notification.
  notifySoundEnabled: boolean;
  // Specific events muted from notifications without unfollowing them —
  // "sport-id" composite keys, same shape as followedEventIds.
  snoozedEventIds: string[];
  // Denser card layout — smaller padding/text for seeing more at once.
  compactCards: boolean;
  // IANA timezone (e.g. "America/New_York") to display all times in,
  // overriding the browser's local timezone. Empty string = use local.
  timezone: string;
  // Opaque per-user secret for the /calendar.ics feed. That endpoint is
  // fetched by external calendar apps (Google/Apple/Outlook), which can't
  // complete an interactive Authentik login the way a browser tab does —
  // so it can't rely on X-authentik-uid like every other route. This token,
  // passed as a query param, is what identifies the subscriber instead. See
  // findUserIdByIcsToken below. Lazily generated on first read (empty until
  // then) rather than at settings-creation time, so existing users get one
  // the next time anything reads their settings.
  icsToken: string;
}

const GLOBAL_DEFAULTS: GlobalSettings = {
  pandaScoreApiKey: "",
  tbaApiKey: "",
};

const USER_DEFAULTS: UserSettings = {
  frcTeamKey: "",
  frcFollowEnabled: false,
  frcRegions: [],
  excludedLeagues: [],
  disabledCoreSources: [],
  enabledEsportsGames: DEFAULT_ENABLED_SLUGS,
  customEvents: [],
  sportColorOverrides: {},
  favoriteTeams: [],
  notifyOnLive: false,
  pollIntervalSeconds: 60,
  theme: "dark",
  icsFavoritesOnly: false,
  followedEventIds: [],
  notifyMode: "followed",
  dismissedFinishedEventIds: [],
  notifyLeadMinutes: [],
  notifySoundEnabled: true,
  snoozedEventIds: [],
  compactCards: false,
  timezone: "",
  icsToken: "",
};

function userSettingsFile(userId: string): string {
  return path.join(USERS_DIR, sanitizeUserId(userId), "settings.json");
}

function writeMigrationNote(userId: string): void {
  const notePath = path.join(USERS_DIR, userId, "MIGRATION-NOTE.txt");
  const note = `This settings.json was auto-migrated on first run after Event Dashboard
split its old single shared settings.json into per-user + global-only files
(for Authentik multi-user support).

Your old preferences (favorite teams, colors, notification settings, etc.)
were moved here, into the "${userId}" user slot — the same slot \`bun run dev\`
uses when a request carries no X-authentik-uid header (i.e. no
Traefik/Authentik in front of it), since the real Authentik uid couldn't be
determined without a live server to ask.

If you're the owner and your real Authentik uid (the X-authentik-uid header
Traefik forwards) is different from "${userId}", either:
  - rename this directory (~/.event-dashboard/users/${userId}) to
    ~/.event-dashboard/users/<your-real-authentik-uid>, or
  - set the ADMIN_UID env var to "${userId}" (or to your real uid, and move
    this folder to match) when running the backend, so admin-only access to
    the API key settings keeps working as intended.

Your PandaScore/TBA API keys were moved to the global, admin-only file at
~/.event-dashboard/settings.json (which now holds only those two keys).

Delete this file once you've confirmed everything looks right — it's just a
one-time note, not read by the app.
`;
  fs.mkdirSync(path.dirname(notePath), { recursive: true });
  fs.writeFileSync(notePath, note, "utf-8");
}

// One-time, best-effort split of the old combined ~/.event-dashboard/settings.json
// (API keys + every user-facing preference, all in one file) into the new
// shape: the global file trimmed down to just the two API keys, and
// everything else saved as the first per-user record under DEFAULT_USER_ID.
// Runs once at module load — see the file-level comment on DEFAULT_USER_ID
// for why that's the right migration target even though it's a guess at the
// real Authentik uid.
function migrateLegacySettingsIfNeeded(): void {
  try {
    if (!fs.existsSync(GLOBAL_SETTINGS_FILE)) return;
    const raw = fs.readFileSync(GLOBAL_SETTINGS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;

    // A global file that's already been split down only ever has these two
    // keys — anything else present means this is still the old combined
    // shape and needs migrating.
    const knownGlobalKeys = new Set(["pandaScoreApiKey", "tbaApiKey"]);
    const hasLegacyFields = Object.keys(parsed).some((k) => !knownGlobalKeys.has(k));
    if (!hasLegacyFields) return;

    const targetFile = userSettingsFile(DEFAULT_USER_ID);
    if (fs.existsSync(targetFile)) return; // don't clobber an existing per-user file

    const { pandaScoreApiKey, tbaApiKey, ...rest } = parsed as Record<string, unknown>;

    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.writeFileSync(targetFile, JSON.stringify(rest, null, 2), "utf-8");
    writeMigrationNote(DEFAULT_USER_ID);

    fs.writeFileSync(
      GLOBAL_SETTINGS_FILE,
      JSON.stringify(
        { pandaScoreApiKey: typeof pandaScoreApiKey === "string" ? pandaScoreApiKey : "", tbaApiKey: typeof tbaApiKey === "string" ? tbaApiKey : "" },
        null,
        2
      ),
      "utf-8"
    );

    console.warn(
      `[settings] Migrated legacy ~/.event-dashboard/settings.json: API keys kept in the global file, ` +
        `everything else moved to ~/.event-dashboard/users/${DEFAULT_USER_ID}/settings.json. ` +
        `See MIGRATION-NOTE.txt in that folder if your Authentik uid differs from "${DEFAULT_USER_ID}".`
    );
  } catch (err) {
    console.error("[settings] legacy settings.json migration failed:", err);
  }
}

migrateLegacySettingsIfNeeded();

export function readGlobalSettings(): GlobalSettings {
  try {
    const raw = fs.readFileSync(GLOBAL_SETTINGS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      pandaScoreApiKey: typeof parsed.pandaScoreApiKey === "string" ? parsed.pandaScoreApiKey : "",
      tbaApiKey: typeof parsed.tbaApiKey === "string" ? parsed.tbaApiKey : "",
    };
  } catch {
    return { ...GLOBAL_DEFAULTS };
  }
}

export function writeGlobalSettings(next: Partial<GlobalSettings>): GlobalSettings {
  const merged = { ...readGlobalSettings(), ...next };
  fs.mkdirSync(APP_DIR, { recursive: true });
  fs.writeFileSync(GLOBAL_SETTINGS_FILE, JSON.stringify(merged, null, 2), "utf-8");
  return merged;
}

export function readUserSettings(userId: string): UserSettings {
  const file = userSettingsFile(userId);
  try {
    const raw = fs.readFileSync(file, "utf-8");
    const parsed = JSON.parse(raw);
    const merged: UserSettings = { ...USER_DEFAULTS, ...parsed };

    // notifyLeadMinutes used to be a single number before it became a
    // multi-select array — an old settings.json on disk still has that
    // shape, and without this the frontend would crash calling array
    // methods on what's actually still a number.
    if (typeof (merged as any).notifyLeadMinutes === "number") {
      const old = (merged as any).notifyLeadMinutes as number;
      merged.notifyLeadMinutes = old > 0 ? [old] : [];
    }

    if (!merged.icsToken) return writeUserSettings(userId, { icsToken: crypto.randomBytes(24).toString("hex") });

    return merged;
  } catch {
    const fresh = { ...USER_DEFAULTS, icsToken: crypto.randomBytes(24).toString("hex") };
    fs.mkdirSync(path.dirname(userSettingsFile(userId)), { recursive: true });
    fs.writeFileSync(userSettingsFile(userId), JSON.stringify(fresh, null, 2), "utf-8");
    return fresh;
  }
}

export function writeUserSettings(userId: string, next: Partial<UserSettings>): UserSettings {
  const merged = { ...readUserSettings(userId), ...next };
  const file = userSettingsFile(userId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(merged, null, 2), "utf-8");
  return merged;
}

export function regenerateIcsToken(userId: string): string {
  const token = crypto.randomBytes(24).toString("hex");
  writeUserSettings(userId, { icsToken: token });
  return token;
}

// Resolves the calendar feed's ?token= query param back to the owning
// uid. Small friend-group scale — a linear scan of each user's settings
// file is simpler than maintaining a separate token->uid index and fast
// enough for the handful of users this app will ever have. Constant-time
// compare so a partial-match timing side-channel can't help guess a token.
export function findUserIdByIcsToken(token: string): string | null {
  if (!token) return null;
  const tokenBuf = Buffer.from(token, "utf-8");
  try {
    for (const userId of fs.readdirSync(USERS_DIR)) {
      const candidate = readUserSettings(userId).icsToken;
      const candidateBuf = Buffer.from(candidate, "utf-8");
      if (candidateBuf.length === tokenBuf.length && crypto.timingSafeEqual(candidateBuf, tokenBuf)) return userId;
    }
  } catch {
    // USERS_DIR doesn't exist yet (no users have ever loaded settings) — no match.
  }
  return null;
}
