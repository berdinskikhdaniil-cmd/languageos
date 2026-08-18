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

Open http://localhost:3000.

`.env.example` ships with `ALLOW_DEV_AUTH="true"`, which lets localhost run as a
local development user without Telegram. The first request creates that user with
English as its language, so the tracker works immediately with an empty history.

The bypass needs an explicit `ALLOW_DEV_AUTH="true"` **and** a non-production
`NODE_ENV`; it cannot be switched on in production. With it off and no Telegram
session, the app says "Open Language OS from Telegram to continue" rather than
showing anyone's data.

Optionally, `npm run db:seed` writes example sessions across this week and last
week. It is never run automatically.

### Running inside Telegram

Set `TELEGRAM_BOT_TOKEN` from @BotFather and point that bot's Mini App at a
public HTTPS URL for this app (a tunnel is fine in development). On launch the
client posts Telegram's signed `initData` once to `/api/auth/telegram`; the
server verifies it, finds or creates the user, and sets an HttpOnly session
cookie. Nothing after that sends initData again.

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
npm test           # unit tests — no database, no network
npm run test:db    # integration tests — needs `npm run db:up`
npm run build      # production build (does not need a database)
```

## Stack

- Next.js 16 (App Router) + React 19
- TypeScript
- Tailwind CSS 4, with design tokens as CSS variables in `src/app/globals.css`
- Manrope as the single UI typeface, via `next/font`
- PostgreSQL 18 + Drizzle ORM, migrations in `drizzle/`
- Telegram Mini App authentication with our own opaque server sessions
- Vitest for the domain logic
- Lucide for icons
- No UI framework and no AI provider yet

## What works today

**Telegram is the login.** Launching the Mini App verifies Telegram's signed
`initData` on the server, finds or creates a real user, and issues one of our own
sessions. Every feature then works from our internal user id and knows nothing
about Telegram.

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

Not built yet: the Telegram bot itself (commands, `/start`, webhooks), AI review,
speech-to-text, vocabulary and SRS, onboarding, and the progress engine.

## Layout

```
src/
  app/          routes, root layout, design tokens
  components/
    layout/     app shell, header, bottom nav, Telegram viewport
    ui/         small shared primitives (card, bottom sheet, sparkline, …)
  db/           Drizzle schema and the connection pool
  components/auth/  sign-in bootstrap and pre-authentication screens
  features/
    dashboard/  dashboard presentation and clearly-labelled demo content
    tracker/    domain rules, data access, server actions, tracker UI
  lib/
    auth/       identity, sessions, environment gating
    telegram/   the WebApp bridge adapter and the initData validator
    …           time zones, formatting, navigation
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
