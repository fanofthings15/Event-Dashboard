# Event Dashboard

A single-page dashboard aggregating live scores and schedules for NFL,
NBA, NHL, F1, FRC, and esports (CS2, League of Legends, Rocket League,
Valorant, Overwatch 2, Dota 2, Rainbow Six Siege) — live status, upcoming
schedule, a calendar view, and event details, all in one place.

Bun runtime, React + TypeScript (Vite) frontend, Express + TypeScript
backend acting as an API proxy, single-port production serving.

## Data sources

| Sport | Source | Notes |
|---|---|---|
| NFL / NBA / NHL | ESPN scoreboard endpoint | No API key required |
| F1 | Jolpica (Ergast successor) | Schedule/results; no live timing |
| FRC | The Blue Alliance API | Free API key required |
| Esports | PandaScore | Free tier; API key required |

## Setup

```bash
bun install
cd backend && bun install && cd ..
cd frontend && bun install && cd ..
```

API keys (PandaScore, The Blue Alliance) are entered in the app's Settings
panel once it's running, not in a config file.

## Development

```bash
bun run dev
```

Backend on :3020, frontend dev server on :5290 by default (override with
`FRONTEND_PORT`) — proxies `/api` to :3020. Open **http://localhost:5290**.

## Production (single process)

```bash
bun run build
cd backend && bun run start
```

Open **http://localhost:3020**.

## Building a Windows executable

```bash
bun run build:exe
```

Produces `Event-Dashboard.exe` — a self-contained binary; no Bun
installation required to run it.

## Features

- Live scores and schedules across NFL, NBA, NHL, F1, FRC, and multiple
  esports titles
- List, Calendar, Today (agenda), and Finished views
- Event detail view with team records, stream links, and league info
- Custom events
- Favorite teams and per-event follow/snooze, with browser notifications
  (sound optional) and configurable advance reminders
- Search across events, teams, and leagues
- Calendar feed (ICS) for subscribing in Google Calendar, Apple Calendar,
  or Outlook
- Light/dark theme, compact layout option, timezone override
- Offline fallback to the last successfully loaded data
- Per-sport color customization and league filtering

Settings are stored server-side in `~/.event-dashboard/settings.json`,
outside the git repository.
