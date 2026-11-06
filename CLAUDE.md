# Event Dashboard — project context

Personal single-user web dashboard aggregating live scores and schedules
for NFL, NBA, NHL, F1, FRC, and esports into one page. Not a multi-tenant
product — single user, single settings file, no auth.

## Stack

- **Runtime:** Bun (not Node) — backend TypeScript runs directly via Bun,
  no compile step in dev.
- **Frontend:** React + TypeScript, Vite. Dev server on :5290 (override
  with `FRONTEND_PORT`), proxies `/api` to the backend.
- **Backend:** Express + TypeScript, acts as an API proxy/aggregator over
  several free external APIs. Runs on :3020.
- **Production:** single process — backend serves the built frontend
  directly on one port. See `bun run build:exe` for the Windows single-exe
  build (fflate-zips the built UI, embeds it via a Bun `with { type: "file" }`
  import, extracts to a temp dir at runtime).

## Repo layout

```
backend/src/
  index.ts              — Express app, exe/dev UI-serving logic
  settings.ts            — Settings type + defaults + readSettings()/writeSettings()
  routes/                — one file per data source (nfl.ts, nba.ts, nhl.ts share
                            espnScoreboard.ts's factory; f1.ts, frc.ts, esports.ts,
                            customEvents.ts, settings.ts, ics.ts are standalone)
  types.ts                — NormalizedEvent shape everything gets mapped into
  esportsCatalog.ts       — PandaScore slug/sport/label/color per esports title
  favoriteTeams.ts         — shared favorite-team matching logic (also used by ics.ts)
  frcMatchProgress.ts      — TBA match-data → "Qual Match 23 of 40" / "Semifinals — Match 2"
  liveEspn.ts              — ESPN game summary → per-sport live state for /live
  f1Live.ts                — F1 live-timing SignalR Core client + MultiViewer circuit map
  liveCs.ts                — bo3.gg → CS map names, round scores, each finished map's best player per team
  routes/live.ts           — /api/live/espn/:sport/:id, /api/live/f1, /api/live/frc/:eventKey, /api/live/cs
frontend/src/
  useEvents.ts             — polling, merging, filtering, notification-firing logic
  SettingsContext.tsx      — shared live settings state, the whole app reads/writes this
  SourceSettings.tsx       — per-data-source settings groups (on/off, color, league filters)
  settingsSections.tsx      — everything NOT source-specific (keys, teams,
                              notifications, timezone, refresh, calendar feed), one
                              component per block, laid out by dashboard/SettingsPage.tsx
  EventDetailModal.tsx      — click-through event detail, stream picker, follow/snooze
  CalendarView.tsx / DayDetailModal.tsx — month grid + hourly breakdown
  dateFormat.ts             — shared timezone-aware date/time formatters
  dashboard/                — the main UI at / (App.tsx: Rail II sidebar on desktop,
                              Home layout + bottom tab bar on phones; dark only, real
                              team logos; parts.tsx tiles/rows, SettingsPage.tsx,
                              EventSheet.tsx new/edit event). Built at /beta and made
                              the main UI 2026-10-26; the old tabbed App.tsx, drawer,
                              theme/compact settings and light palette were deleted.
                              /beta still loads it (any path but /live does).
  live/                     — /live full-screen display (main.tsx routes by pathname):
                              LiveScreen.tsx, selectLiveEvent.ts (the placeholder
                              "which game to show" policy — change it there),
                              views/ (one per sport), surfaces/ (regulation rink,
                              court, field, ballpark from the real fence, BallFlight),
                              Stream.tsx (esports and FRC webcasts; the player
                              layer), StreamControls.tsx (the display's own
                              controls over every player), streamPicks.ts
                              (stream switcher picks)
```

/live layout rule: all text is HTML in `live/Layout.tsx`'s shell (header,
side panel, footer — grid/flex with ellipsis, stacked on portrait). SVGs
draw only the playing surface and its markers, in real units (feet/yards).
The first version positioned text by hand inside one SVG canvas and it
clipped and overlapped as soon as real data and other screen sizes hit it —
don't go back to that. Fixed dark palette, not the app theme. A strip of
other live games sits along the bottom; tapping one overrides the automatic
pick until that game ends.

Several games at once (`live/multiGame.ts`, `live/GameTile.tsx`): with 2+
games live, the RedZone (one big + up to 3) or Grid (up to 6) layout,
picked by a switch next to Fullscreen ("Single" = the one-game display).
Games are ranked by `interest()` = `importance()` (how big the event is:
esports tier × stage from PandaScore, ESPN `postseason`; FRC always last,
followed or not, since the user is usually there in person —
the points table is `DEFAULT_RANKING` in `multiGame.ts`, and each user can
override any entry in Settings → Live display ranking (`eventRanking`, only
changed keys stored); the user set NFL regular season =
esports tier A, and a red-zone drive beats a Major's Swiss map but not its
final) + the strongest live moment capped at +35 (red zone from the ESPN
scoreboard's `situation`, a score in the last 3 minutes, a power play, a
close finish, a deciding map — counted only while that map is being played,
not the break before it) + followed teams + 10 for a stream that plays
on the display − 20 for an esports match between maps (`mapLive` false,
from PandaScore's per-map status), and on that break neither its follow bonus
nor any moment counts. Live gameplay comes first (user's rules, 2026-11-04):
a match between maps hands the top spot (Single, RedZone's big spot) to the
best match or game being played that `canTakeOver` (not FRC or tier D), and
the one that moves in keeps it until its own map is over — the one it replaced
counts as still on its break meanwhile, even once its next map has started
(`cover` in `LiveScreen.tsx`, saved per device as `live-cover`,
`InterestHints.onBreak`). A map that isn't the decider hands back straight
away. A match that finishes on screen (its decider is over) stays for
`CELEBRATE_MS` (3 min) then drops off: in Single it keeps the screen; in
RedZone/Grid it moves to a small tile, never the big spot even if pinned, and
ranks like a break there, so live games still come first — with a +15 bonus for games already shown so they don't churn on a close score or red-zone drive. When a game goes live, it gets that same +15 for one pass (`arrivals` in `placeGames`/`selectLiveEvent`), so a new game that beats the one on screen takes over. Ties (the user's rule, 2026-11-03): between games already on screen they keep their order; otherwise the bigger event (`importance`, i.e. a tier/stage difference) wins, and between events the same size the game that has been on longer — a new game never wins a tie on being new.
Nothing is dropped for being small; unwanted sources are filtered in
settings. "Live" means `isLiveNow` (start time passed), same as the
dashboard. Layout "Auto" (default) picks Single / RedZone / Grid
from how big the live games are (`eventSize`: size + stream — not follows,
not moments; a followed game gets the best spot, never the whole screen —
a followed F1 race beside four NFL games went Single before 2026-11-01).
It compares them so it only changes as games start or end, or a game is hidden:
hidden games (dragged to the strip) don't count, so dragging a far bigger
game's Single view to the strip re-picks from the rest; Unpin all brings
it back. Beside a big game
(55+), tier-D esports and FRC events stay in the strip unless pinned.
Quiet hours (`src/quietHours.ts`, per device, default 6 AM–12 PM — the user
works nights): layout unchanged, every stream loads muted (its player can still be unmuted by
hand), no in-tab chime. The in-tab chime is only for an
event going live; reminders are Discord's. Esports streams are ordered English first,
then main/official, then platform (PandaScore's language tags can be wrong:
a JP co-stream was tagged "en"). Esports teams are white and violet
(`ESPORTS_TEAM_COLORS` in `Layout.tsx`), never blue/red: PandaScore's team
order says nothing about the in-game side, and its per-game data (which has
League sides) is 403 on the free plan. The dashboard's Live tab is in the address
(`/?view=live`, `&pin=` for "Watch live"; `liveFromUrl`/`openLive`/`closeLive` in
`dashboard/App.tsx`): a refresh stays on it, and the browser's back button, the
on-screen Back and Escape all step back to the dashboard through history. A
pin LiveScreen saves itself (live game, multi-game layout) is dropped from the
address (`onPinSaved`) so a refresh doesn't re-pin it. `/live` is still the
standalone screen with no Back. "Watch live" in the event detail opens
the Live tab with that game pinned (`LiveScreen`'s `pin` prop: a live game
is pinned like a strip tap, one not live yet gets the display to itself);
its stream links stay as "Open stream ↗". The in-app Streams tab is gone. Tap a
strip game to pin it to the big spot; drag games onto spots (pin/swap) or
onto the strip (hide). Single drags the same way: a strip game dropped on
the view is shown (like a tap), the shown game dropped on the strip is
hidden and the next pick takes over (hidden games are skipped by the
single pick unless nothing else is live). Layout, pins and hidden games are per device
(localStorage), pruned when their games end. Every stream player
lives in one layer of the page (`StreamLayer` in `Stream.tsx`): a `Stream` is a
placeholder and its iframe is laid over it every frame, keyed by the stream
minus its mute setting, so a player is never rebuilt or moved in the page (the
browser reloads a moved iframe) — Single becoming RedZone, tiles changing spot
or shape, all keep the stream playing and a player's fullscreen open. Before
2026-11-03 a new game going live restarted every stream, closed a fullscreen
player mid-overtime and undid a hand mute. The sound moving between tiles is a
mute/unmute message (YouTube IFrame API; Twitch's embed-proxy SetMuted = 10,
both checked in headless Chrome), confirmed from the state the player reports
and resent; a player that hasn't confirmed in 8 s is reloaded with the right
setting (Kick, with no API, always reloads) — an unconfirmed mute once left two
streams' audio playing until a refresh. Tiles are also written into the page in
first-seen order, and a stream-only Twitch tile hides its lines with CSS.

**Stream controls (user's ask, 2026-11-06): one set for every service.** The
players' own controls are off (`toEmbedUrl`: YouTube `controls=0` +
playsinline/rel/iv_load_policy/disablekb, Twitch `controls=false`; Kick has
no option) and `StreamControls.tsx` draws ours in each player's box, so they
go fullscreen with it: play/pause, mute, volume, the stream switcher, quality
(Twitch only — YouTube's setPlaybackQuality does nothing any more), fullscreen.
An opacity-0 layer (`.lv-sc-catch`) covers the whole player so the player
never sees the mouse and its hover UI (YouTube's title/share/"More videos",
Kick's bar) never shows; YouTube still shows its title for a few seconds when
it starts, pauses or resumes, which can't be turned off. What each service
takes: YouTube and Twitch play/pause/mute/volume by message (Twitch Pause 2,
Play 3, SetQuality 8, SetMuted 10, SetVolume 11 = 0–1, all checked in headless
Chrome); **Kick has no player API** (no message listener in player.kick.com's
bundle) — mute reloads it, no pause/volume; its HLS token only allows
kick.com origins, so playing it in our own `<video>` would mean getting round
that (not done). Fullscreen puts the box fullscreen (`requestFullscreen`); the **F key** does
too (user's ask, 2026-11-06; not while typing in a field): it leaves the
stream that's fullscreen, else takes the one under the mouse, else the one
with sound, else the biggest (`fullscreenTarget` in `Stream.tsx`);
where a page can't (iPhone) the box fills the window (`.lv-pseudo-fs`, Escape
leaves it, before LiveScreen takes Escape as Back). Volume is one level per
device (`live-volume`), applied to whichever stream has the sound; unmuting a
stream by hand mutes the others. "<Service>'s own controls" in the stream
menu reloads that player with its controls on (age/sign-in prompts, YouTube's
quality menu); the button at the top brings ours back. A stopped stream shows a
big Play; Play that doesn't take within 3.5 s lets clicks through to the
player (its own prompt). The **stream switcher** lists every embeddable
stream of the game (`streamOptions`/`pickStream` in `streamEmbed.ts`: esports
`streams`, FRC pasted link then TBA webcasts); the pick is per device
(`live-stream-pick`, by eventKey), pruned with pins when the game ends; a
pasted FRC link replaces the pick.

**Twitch in Chrome stops when anything covers it** (checked 2026-11-06):
its player watches IntersectionObserver v2 `isVisible` (`trackVisibility` in
its code), and Chrome counts any box over the frame — transparent, pointer-
events: none, the old rounded-corner `::after` mask, a control bar, even for
0.6 s — as covering it. It stops (Idle) and doesn't restart when uncovered; a
Play does restart it. Opacity-0 boxes don't count, and shrinking the frame
doesn't stop it (even 533×300, with sound). Firefox has no v2 and Twitch falls
back to a check that ignores covers (so Twitch worked there under the mask);
YouTube and Kick don't check. So with v2 (`GUARD_TWITCH`), a Twitch box is
`.lv-guard`: corners clipped (border-radius + overflow) instead of masked, and
the bar/menus open as a drawer under the frame, which shrinks by their height
plus 1px (`--sc-bottom`; boxes sit on whole pixels — a drawer meeting the frame
on a fractional edge overlapped one pixel row and stopped it). The stream and
quality menus are a box above the bar (user's ask, 2026-11-06 — not a
full-width row); on a guarded player the frame gives up a column at the right
for the open box (`--sc-right`: narrower video, not a much shorter one). A
tap that closes a menu only closes it (its click is matched by pointerId). A guarded
player that stops by itself (a tile being dragged dims it, a score banner) is
told to play every 1.5 s for 15 s (`revive`). A guarded stream-only tile's pin
button moves into the bar (it floated over the player). Testing tip: a
Playwright `page.route("**/api/**")` also catches Twitch's own
usher.ttvnw.net/api/... playlist request — route only `localhost:5290/api/**`
or Twitch fails with Error #1000.

A stream paused itself the first time it was put fullscreen (user's screen,
2026-11-03, not reproducible in headless Chrome): for 6 s after a playing
stream goes fullscreen, a pause it reports (YouTube playerState 2, Twitch
playback "Idle") is undone with a play command (YouTube playVideo, Twitch
Play = 3) — checked for YouTube only. While a stream is fullscreen (`isStreamFullscreen()`: its box, a player's
own iframe, or filling the window on an iPhone)
nothing on the display changes: games going live wait in the strip and don't
count as arrivals afterwards. When the display goes from Single to RedZone,
the game shown in Single is pinned to the big spot. Twitch won't autoplay a player under 400×300: a Twitch tile drops
its score/status lines (stream only, the broadcast has a scoreboard) only
when that gets the player over it (`useBareTwitch` in `GameTile.tsx`), and
in RedZone's small column a Twitch row gets 1.15× the height so 1080p
gets there. Don't CSS-scale a bigger player down instead — tried, looked
crunchy at any quality (reverted 382f418). F1 safety car / VSC (TrackStatus 4, 6, 7)
flashes a yellow border round the F1 display or tile; a red flag (5)
outlines it red; a yellow flag (2, or any yellow sector) outlines it yellow,
steady (`f1Alert` in `F1View.tsx`). Each sport's
surface is a shared component (`FootballSurface`, `HockeySurface`,
`BasketballSurface`, `BaseballSurface`, `F1Track`) used by both the full
view and the tiles.

Every route maps its source's raw API response into `NormalizedEvent`
(`backend/src/types.ts`) — that's the one shape the whole frontend consumes,
regardless of source.

## Data sources

| Sport | Source | Key needed | Notes |
|---|---|---|---|
| NFL/NBA/NHL | ESPN scoreboard endpoint (unofficial) | No | Undocumented, could change without notice |
| F1 | Jolpica (Ergast successor) | No | Schedule/results only, no live timing. Every session is an event (`f1Session`: practice / qualifying / sprint / race; FP1–3, Sprint Qualifying, Sprint, Qualifying, Race) — the race keeps id `season-round`, sessions get `-fp1`, `-q`, `-sq`, `-sprint`. "Live" = start + the session's usual length (75 min practice/quali, 60 sprint/SQ, 3 h race). Live ranking: `f1` (race, sprint) 55, `f1-qualifying` 40, `f1-practice` 10 |
| FRC | The Blue Alliance API | Yes (free) | Full events only, not individual matches. The season list is `/events/{year}` (full model), not `/simple` — only the full model has `webcasts` (the organizer's own stream: youtube = video id, twitch = channel, direct_link = URL), mapped to `streamUrl`/`streams` in `frc.ts`. A link pasted on the FRC view (`frcStreamUrls`) overrides it; clearing that falls back to TBA's |
| Esports | PandaScore | Yes (free tier) | ~1000 req/month cap |
| /live team sports | ESPN game summary (unofficial) | No | Shot/pitch coordinates, drives, box stats — quirks below |
| /live F1 | F1 live timing, SignalR Core | No | Anonymous; old /signalr and /static/ archive 401 as of 2026-10-20. `Position.z`/`CarData.z` are NOT sent anonymously (checked live, 2026 US GP) — cars are placed from TimingData mini-sectors instead, and in a race by gap to the leader (`f1Live.ts`, `F1View.tsx`) |
| /live F1 circuit | MultiViewer circuits API | No | Outline + marshal sectors, same coords as Position.z (no pit lane shape — it's drawn beside the S/F straight) |
| /live CS maps | bo3.gg public API (unofficial) | No | Matched to the PandaScore match by both team names (either order). Map names, final round scores, per-map player stats (best `player_rating` per team = the ★ line). No running round score mid-map, and stats appear minutes to hours after a map ends — empty answers are cached 5 min only (`liveCs.ts`). Checked live 2026-10-31 |
| /live MLB extras | MLB Stats API (statsapi.mlb.com) | No | Ballpark fence distances (venue fieldInfo) and every batted ball (hitData); matched to the ESPN game by date + team names (`liveMlb.ts`) |

**ESPN summary quirks the /live views rely on** (all checked against real
responses 2026-10-20): football play `yardLine` is yards from the *home*
goal line, and `yardsToEndzone == yardLine` means the offense attacks the
home goal; NBA shot `coordinate.y` is feet from the rim (not the baseline),
with a `-214748340` sentinel on free throws; NHL plays set `shootingPlay`
on hits/giveaways too, so filter by `type.text`, and each play's `strength`
is relative to its own team; MLB `pitchCoordinate` is gamecast pixels, with
the strike zone fitted at roughly x 82–145, y 146–194. A team's `name` is
its mascot ("Fighting Irish"), `location` the school/city; college leagues
(league slug contains "college") label teams by `location`, the pros by
`name`. Team colours: a too-dark ESPN colour is brightened in its own hue
(`teamColors.ts`), never swapped for a gray/silver alternate. Stats API hit
coordinates convert to feet as 2.5 × (coordX − 125.42), 2.5 × (198.27 − coordY)
— checked against its own totalDistance (386 ft liner lands at 387 ft).

**PandaScore esports slugs are not always the obvious name** — e.g. Rocket
League is `rl`, not `rocket-league`. This was a real bug once; verify any
new title's slug against a real API response before assuming it.

**FRC districts:** region names (FIM, FIT, etc.) come from two layered
sources — TBA's own `/district/{key}/events/keys` data first, then a
static state→district fallback table in `frc.ts` for events TBA doesn't
officially tag under a district (e.g. off-season events). The static table
was derived from real 2026 season data, not guessed.

## Settings model

Two tiers, both in `backend/src/settings.ts`, both persisted **outside the
repo** under `~/.event-dashboard/` so they survive every deploy:

- **Global (admin-only)** — just the two external API credentials
  (`pandaScoreApiKey`, `tbaApiKey`), in `GlobalSettings`, persisted to
  `~/.event-dashboard/settings.json`. One shared file — everyone hits the
  same rate limit either way, but only an admin uid (see `ADMIN_UID` below)
  can see whether a key is set or change it. Served by
  `routes/globalSettings.ts` at `/api/global-settings`; never touched by
  `routes/settings.ts`.
- **Per-user** — everything else (favorite teams, source filters, theme,
  notification prefs, FRC team follow, etc.), in `UserSettings`, persisted
  one file per Authentik user at
  `~/.event-dashboard/users/<uid>/settings.json`. Served by
  `routes/settings.ts` at `/api/settings`, scoped to the requesting user via
  `userContext.ts`'s `getUserId()`, which reads the `X-authentik-uid` header
  Traefik/Authentik forwards on every request. No header (e.g. bare
  `bun run dev` without Traefik in front) falls back to a fixed `"local"`
  user (`DEFAULT_USER_ID` in `settings.ts`) so local iteration still works.

`ADMIN_UID` (env var, comma-separated for multiple) controls who can hit
`/api/global-settings` — defaults to just `"local"`, so it works out of the
box for bare `bun run dev` but needs to be set to the owner's real Authentik
uid once actually deployed behind Traefik.

Any route that reads user-facing prefs must call `readUserSettings(getUserId(req))`,
never a global read — and any route making an internal self-fetch back into
this backend (see `routes/ics.ts`) must forward `X-authentik-uid` explicitly,
since that header isn't otherwise present on a server-to-server `fetch()`.

`SettingsContext.tsx` on the frontend fetches both `/api/settings` and
`/api/global-settings` and merges them into one client-side state object —
`save()` routes `pandaScoreApiKey`/`tbaApiKey` to the global endpoint and
everything else to the per-user one, so callers don't need to care which
store actually owns a given field.

The old single shared `settings.json` (one file, no per-user concept) is
auto-migrated on first run of the new code — see the comment on
`migrateLegacySettingsIfNeeded()` in `settings.ts` for exactly how the split
happens and where the pre-existing data ends up.

**When adding a new settings field:** decide which tier it belongs in (almost
certainly per-user — the global tier is deliberately just the two API keys),
give it a sensible default in `USER_DEFAULTS` or `GLOBAL_DEFAULTS`, and if
the *type* of an existing field ever changes (e.g. number → array), add a
migration step in `readUserSettings()`/`readGlobalSettings()`. A real
production bug happened once from skipping this — an existing
`settings.json` on disk still had the old shape, and the frontend crashed
calling array methods on what was actually still a number.

## Conventions

- **Git:** default branch is `main`, never `master`. No Claude/AI
  attribution anywhere in commit messages or history (no
  `Co-Authored-By`, nothing referencing Claude). When a change is finished
  and checked (typecheck, build, a real run), commit and push it to `main`
  without asking, then confirm the Coolify deploy finished (changed
  2026-10-21; this repo used to be manual-commit only). Show the real
  command output — never claim a commit or deploy succeeded without it.
- **Releases:** don't tag a new version without being explicitly asked to,
  and when tagging, `git status`/`git log` first to confirm `main` is
  actually clean and has everything intended — a tag pointing at a stale
  commit has caused real CI confusion before (built an old exe with a
  stale filename, missing fixes).
- **Mobile:** audit responsive design (wrapping headers, tap target
  sizing, column collapse) from the start on anything that might see
  phone/tablet use, not as a later pass.
- **Testing:** actually run things — `bun install` + `bun run dev`, hit
  the real endpoints, watch real console output — rather than only
  type-checking. This project was largely built from a sandboxed chat
  environment with no network access to espn.com, thebluealliance.com,
  pandascore.co, or jolpi.ca, and no ability to run Bun at all — so
  several routes are correct against each API's *documented* shape but
  were never confirmed against a live response. Treat anything below as
  "should work," not "confirmed working," until actually run.

## Known unverified areas (worth checking first)

- `backend/src/espnScoreboard.ts`'s `liveDetail` field — **confirmed**
  2026-10-20 against live games: NBA `"1:23 - 2nd"`/`"Halftime"`, NHL
  `"16:34 - 2nd"`/`"End of 1st"`.
- /live, not yet seen against real data: the esports stream crop with a real PandaScore match (only
  tested with a faked event + YouTube video, no PandaScore key on the dev
  box), the FRC view (no TBA key on the dev box), and NFL/MLB mid-game
  (mapping tested on finished games and a replayed mid-drive play). The
  default minimap crop rects in `live/cropPresets.ts` are guesses.
- The stream-source popup in `EventDetailModal.tsx` — **confirmed** against
  a real live PandaScore match (LEC, SK Gaming vs Fnatic, 2026-08-15).
  Real `streams_list` had 5 entries across 4 languages with the official
  English Twitch stream marked `"main": true`; the app correctly still
  ranked YouTube first and picked the official Twitch link over the other
  language duplicates.
- FRC district-matching — **a real bug was found and fixed** 2026-08-15:
  `state_prov` codes aren't globally unique (`"WA"` is both Washington,
  USA and Western Australia), so the `STATE_TO_DISTRICT` fallback in
  `frc.ts` mislabeled a real Australian event ("West Australian Robotics
  Playoffs", key `2026auwarp`) as region "PNW" (a US Pacific Northwest
  district). Fixed by gating the fallback on `e.country` being
  USA/United States/Canada. Verified against live 2026 TBA data that this
  was the only such collision this season, and that real PNW events
  (Oregon/Washington, USA) still resolve correctly.

## Notable past bugs (avoid repeating)

- **Bun's compiled-executable internal path marker differs by platform:**
  `$bunfs` on Linux/macOS, `~BUN` on Windows (e.g. `B:/~BUN/root/...`).
  `isCompiledExe()` in `index.ts` checks both — don't narrow this back to
  one pattern.
- **A settings field's type changing without a migration step will crash
  the frontend** for anyone with an existing `settings.json` — see the
  Settings model section above.
- **An unmemoized callback passed into `useEvents`'s dependency array will
  cause a spam-resync loop** — every render recreates the fetch effect,
  causing back-to-back fetches with no delay. Any function passed as
  `onNotify` (or similar) must be wrapped in `useCallback` with stable
  dependencies. This actually happened once and required killing the dev
  server.
- Frontend's `tsconfig.json` uses project references (`"files": []`) — a
  bare `npx tsc --noEmit` in `frontend/` silently checks nothing. Use
  `npm run build` or `npx tsc -b --noEmit` for a real type-check.
- **No `<button>` inside a `<button>`.** The old UI's `EventCard` (deleted
  with that UI) once nested the Finished tab's Dismiss × inside a button
  card: invalid HTML, only caught by a React console warning on a real run.
  A clickable card with its own buttons inside should be a
  `<div role="button" tabIndex={0}>` with Enter/Space handling, the inner
  buttons calling `stopPropagation()`.
