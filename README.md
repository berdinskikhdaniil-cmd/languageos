# Language OS

A Telegram-first app for people learning a language from real material — YouTube, films,
podcasts, books, a tutor, conversation — rather than from a course.

It brings that scattered study into one place and closes the loop:

> study → reproduce → get feedback → fix weak points → see real progress

The product is a Telegram Bot for fast capture plus a Telegram Mini App as the main
interface. This repository is the Mini App.

## Getting started

You need Node 22+ and Docker for the local database.

```bash
npm install
cp .env.example .env     # adjust POSTGRES_PORT if 5442 is taken on your machine
npm run db:up            # start PostgreSQL in Docker and wait for it
npm run db:migrate       # apply migrations
npm run dev
```

Open http://localhost:3000. It runs in a normal browser as well as inside Telegram.
The first request creates a development user with English as its language, so the
tracker works immediately with an empty history.

Optionally, `npm run db:seed` writes example sessions across this week and last
week. It is never run automatically.

### Database commands

```bash
npm run db:up        # start the container
npm run db:down      # stop it (data is kept in a volume)
npm run db:reset     # destroy the volume, recreate, migrate
npm run db:generate  # generate a migration after editing src/db/schema.ts
npm run db:migrate   # apply pending migrations
npm run db:studio    # browse the data
npm run db:seed      # example development sessions
```

### Checks

```bash
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm test           # Vitest
npm run build      # production build (does not need a database)
```

## Stack

- Next.js 16 (App Router) + React 19
- TypeScript
- Tailwind CSS 4, with design tokens as CSS variables in `src/app/globals.css`
- Manrope as the single UI typeface, via `next/font`
- PostgreSQL 18 + Drizzle ORM, migrations in `drizzle/`
- Vitest for the domain logic
- Lucide for icons
- No UI framework and no AI provider yet

## What works today

**The tracker is real.** Time you log is stored in PostgreSQL and the dashboard
reads it back.

- **Start a session** — pick an activity in a bottom sheet, a timer starts. Elapsed
  time is derived from the stored `startedAt`, so it stays correct across a refresh
  or a route change. One running session per user, enforced by a partial unique index.
- **Stop** — the duration is recomputed from the timestamps server-side.
- **Add manually** — activity, duration, day and optional notes, validated on the
  server with errors shown inline.
- **Dashboard** — "This week" (with a real previous-week comparison, or an honest
  "nothing to compare with") and "Today" broken into Input / Speaking / Writing are
  queried from the database. Day and week boundaries are computed in the user's
  timezone, not the server's.

Still demo content, marked as such in `src/features/dashboard/demo-analytics.ts`:
the coach recommendation and the errors-per-1000-words trend.

Not built yet: Telegram authentication and the bot, AI review, speech-to-text,
vocabulary and SRS, and the progress engine.

## Layout

```
src/
  app/          routes, root layout, design tokens
  components/
    layout/     app shell, header, bottom nav, Telegram viewport
    ui/         small shared primitives (card, bottom sheet, sparkline, …)
  db/           Drizzle schema and the connection pool
  features/
    dashboard/  dashboard presentation and clearly-labelled demo content
    tracker/    domain rules, data access, server actions, tracker UI
  lib/          time zones, formatting, navigation, identity, Telegram types
drizzle/        generated migrations
scripts/        one-off development scripts (seed)
docs/           product handoff, design rules
```

## Before changing the UI

[docs/design-system.md](docs/design-system.md) holds the binding visual rules —
typeface, accent, labels, badges, cards, icons. They outrank whatever a given
component happens to do today.

Product context and the longer-term plan live in
a handoff document kept outside this repository.
