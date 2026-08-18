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

### Production

Two databases, never the same one. Local development runs the Docker Postgres from
`docker-compose.yml`; production runs on Neon and is reached only through the
deployed app. `db:seed` and `db:reset` refuse to run unless `DATABASE_URL` points
at this machine, so a stray shell cannot destroy real data.

Pushing `main` deploys: GitHub triggers the Vercel production build, and that build
applies migrations before it compiles.

```json
// vercel.json
"buildCommand": "npm run db:migrate:deploy && npm run build"
```

`db:migrate:deploy` runs the same script as `npm run db:migrate`, so there is one
migration path, not two. It applies only what Drizzle has not recorded yet, so
re-deploying changes nothing; it refuses to run on anything but a production
deployment, so previews never reach the production database; and if it fails, the
build fails and the previous deployment keeps serving.

Production environment variables live in Vercel, not in any file here:
`DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`,
`TELEGRAM_WEBAPP_URL`, `TELEGRAM_INIT_DATA_MAX_AGE_SECONDS`,
`AUTH_SESSION_TTL_SECONDS`, `DEFAULT_TIMEZONE`. `ALLOW_DEV_AUTH` is deliberately
absent — and could not work there anyway, since it also requires a non-production
`NODE_ENV`.

After a deployment URL changes, point the bot at it with `npm run telegram:configure`.

### The Telegram bot

Two explicit scripts; neither runs during `npm run dev` or a build.

```bash
npm run telegram:check      # verify TELEGRAM_BOT_TOKEN via getMe, report what is configured
npm run telegram:configure  # apply the command list, menu button and webhook
```

They need `TELEGRAM_BOT_TOKEN`, and for anything beyond the command list also
`TELEGRAM_WEBAPP_URL` (this app's own public URL) and `TELEGRAM_WEBHOOK_SECRET`.

`telegram:configure` is idempotent — each call overwrites, so running it twice
leaves the same state. It sets `/start` and `/help`, points the chat menu button
at the Mini App, and registers `POST /api/telegram/webhook` (the Mini App URL with
that path appended) together with the secret. Telegram echoes the secret in the
`X-Telegram-Bot-Api-Secret-Token` header, and the route refuses anything else.

A localhost `TELEGRAM_WEBAPP_URL` is fine for development, but Telegram cannot
open or call it: the menu button and the webhook are skipped with a reason until
the app is deployed behind a public HTTPS URL.

The bot itself is only a door. `/start` replies with one line and an "Open
Language OS" Web App button, `/help` says the same in fewer words, and everything
else — ordinary text, voice, group chats — is left alone. It never signs anyone
in: the Mini App's `initData` flow below is the only path to a session.

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

**The bot is a transport.** A secret-verified webhook, `/start`, `/help` and a
button into the Mini App, plus the scripts that configure them.

Not built yet: logging time by message or voice, reminders, AI review,
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
    telegram/   the WebApp bridge, the initData validator, the Bot API client
                and the update handler
    …           time zones, formatting, navigation
drizzle/        generated migrations
scripts/        explicit scripts (seed, Telegram setup)
docs/           design rules
```

## Before changing the UI

[docs/design-system.md](docs/design-system.md) holds the binding visual rules —
typeface, accent, labels, badges, cards, icons. They outrank whatever a given
component happens to do today.

The product context and the longer-term plan live in a handoff document kept
outside this repository.
