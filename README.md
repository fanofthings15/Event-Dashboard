# Event Dashboard

Personal one-stop dashboard for NFL, F1, and esports (CS2, League of Legends,
Rocket League) — live status and upcoming schedule in one page.

Bun runtime, React + TypeScript (Vite) frontend, Express + TypeScript
backend (run directly by Bun, no compile step) acting as an API proxy,
single-port production serving.

## Data sources (all free)

| Sport | Source | Trade-off |
|---|---|---|
| NFL | ESPN scoreboard endpoint (unofficial) | No API key, but undocumented — could change without notice |
| F1 | Jolpica (free Ergast successor) | Full schedule/results, no live timing — "live" is approximated from scheduled start time |
| CS2 / LoL / Rocket League | PandaScore free tier | ~1000 requests/month cap; some lower-tier tournaments may be gated behind paid plans |

## Setup

```bash
bun install
cd backend && bun install && cd ..
cd frontend && bun install && cd ..
git config core.hooksPath .githooks
```

Get a free PandaScore API key at https://pandascore.co (needed for esports
data only — NFL and F1 need no key). Paste it into the app's Settings drawer
once it's running, not into a config file.

## Running it (development)

```bash
bun run dev
```

Backend on :3020, frontend dev server on :5290 by default (override with
`FRONTEND_PORT=xxxx`) — proxies `/api` to :3020.
Open **http://localhost:5290**.

## Running it (production-style, one process)

```bash
bun run build
cd backend && bun run start
```

Open **http://localhost:3020**.

## Testing status

Type-checked and built successfully (both frontend and backend) in the
sandbox this was built in. That sandbox can't reach espn.com, jolpi.ca, or
pandascore.co, so the three live data routes (`backend/src/routes/nfl.ts`,
`f1.ts`, `esports.ts`) are correct against each API's documented response
shape but **not verified against a live response** — worth a first real run
to confirm nothing's drifted.

Single-port static serving (backend serving the built frontend) and the
settings read/write route were tested directly and confirmed working.

## Notes

- Settings (PandaScore key, followed teams) are stored in
  `~/.event-dashboard/settings.json` as plaintext — it's a free API key, not
  a real secret. Say the word if you'd rather it be encrypted at rest.
- Backend polls/caches each upstream API for 60s–1hr depending on how often
  that data actually changes, to stay well under free-tier rate limits.
- `followedTeams` exists in the settings shape but isn't wired into the UI
  filter yet — natural next step once the live data pull is confirmed working.
