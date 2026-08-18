# Self-hosting Language OS

This guide takes you from a clone to a working Telegram Mini App backed by your own
database and your own bot. Nothing here depends on the hosted service.

## What you need

- **Node.js 22 or newer**, and npm. The hosted deployment runs Node 24; the project is
  developed on 22.
- **PostgreSQL.** Either the Docker Compose file in this repository, or any PostgreSQL
  server you already run. Development and production both use PostgreSQL 18; the schema
  uses nothing version-exotic.
- **A Telegram bot**, created through [@BotFather](https://t.me/BotFather).
- **A public HTTPS URL**, once you want to use it from Telegram for real. Telegram opens
  the Mini App from the user's device and calls your webhook from its own servers, so
  neither can reach `localhost`.

You can do everything up to step 6 without a bot or a public URL.

## 1. Clone and install

```bash
git clone https://github.com/berdinskikhdaniil-cmd/languageos.git
cd languageos
npm ci
```

## 2. Configure the environment

```bash
cp .env.example .env
```

`.env` is gitignored. Every variable is described in [Environment](#environment) below.
For a first local run the defaults are enough.

## 3. Start a database

Using the bundled container:

```bash
npm run db:up     # PostgreSQL on port 5442, credentials from .env
```

Adjust `POSTGRES_PORT` in `.env` first if 5442 is taken. Those `POSTGRES_*` variables
configure the container only — the application reads `DATABASE_URL` and nothing else.

Using your own PostgreSQL instead: skip `db:up`, create an empty database, and point
`DATABASE_URL` at it. A managed provider such as Neon, Supabase or RDS works the same
way; use the pooled connection string if your provider offers one, since the app opens
a small pool per instance.

## 4. Apply migrations

```bash
npm run db:migrate
```

This applies only what has not been applied yet — Drizzle records each migration in a
`drizzle.__drizzle_migrations` table — so it is safe to run again. It never seeds or
deletes anything.

## 5. Run it

```bash
npm run dev
```

Open <http://localhost:3000>. With `ALLOW_DEV_AUTH="true"` you are signed in as a local
development user and the tracker works immediately, with an empty history.

For a production process:

```bash
npm run build
npm run start
```

`npm run build` does not need a database.

Optionally, `npm run db:seed` writes example sessions for the development user. It
refuses to run against anything but a database on your own machine, and nothing calls
it automatically.

## 6. Create the bot

In [@BotFather](https://t.me/BotFather): `/newbot`, pick a name and a username, and copy
the token into `TELEGRAM_BOT_TOKEN` in `.env`. Keep the token server-side — it must never
get a `NEXT_PUBLIC_` prefix.

Check it:

```bash
npm run telegram:check
```

This calls Telegram's `getMe` and prints the bot id, username and name, plus what is
currently configured. It changes nothing.

## 7. Generate a webhook secret

The webhook endpoint is public, so a shared secret is what distinguishes Telegram from
anyone else. Generate your own:

```bash
openssl rand -hex 32
```

Put it in `TELEGRAM_WEBHOOK_SECRET`. Telegram echoes it back in the
`X-Telegram-Bot-Api-Secret-Token` header on every delivery, and the route rejects any
request whose header does not match.

## 8. Publish the app over HTTPS

Deploy the app somewhere it can be reached over HTTPS. Anything that runs a Node
process works — `npm run build && npm run start` behind your own reverse proxy is a
supported setup, as is a container, a PaaS, or a tunnel to your machine while you are
still developing.

Two host-specific notes:

- **Any host.** Run `npm run db:migrate` yourself before starting a build that expects a
  new schema.
- **Vercel.** `vercel.json` sets the build command to
  `npm run db:migrate:deploy && npm run build`, so a production deployment applies
  migrations before it compiles. That step is skipped unless `VERCEL_ENV` is
  `production`, so previews never touch the production database. It is a convenience,
  not a requirement — delete `vercel.json` if you deploy elsewhere.

## 9. Point Telegram at your URL

Set `TELEGRAM_WEBAPP_URL` to the public HTTPS origin of your deployment — the Mini App's
own URL, for example `https://example.com`. Then:

```bash
npm run telegram:configure
```

This is idempotent; running it twice leaves the same state. It:

- sets the bot's command list to `/start` and `/help`;
- points the chat menu button at your Mini App;
- registers `POST <your URL>/api/telegram/webhook` as the webhook, with your secret.

The webhook URL is derived from `TELEGRAM_WEBAPP_URL`, so there is only one URL to keep
correct. A localhost value is accepted for development but is never sent to Telegram:
the menu button and webhook steps are skipped, each with a reason.

Set the same variables in your host's environment, not only in `.env` — a deployed app
reads them from its own environment.

## 10. Check it

Send `/start` to your bot. You should get a short message with a button that opens the
Mini App and signs you in. `npm run telegram:check` will show the registered webhook and
any error Telegram reports about it.

## Environment

| Variable | Required | What it is |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string. The only database setting the app reads. |
| `TELEGRAM_BOT_TOKEN` | for Telegram | Bot token from BotFather. Verifies `initData` signatures and authenticates Bot API calls. Server-only. |
| `TELEGRAM_WEBAPP_URL` | for Telegram | Your Mini App's public origin. Used for the launch button, the menu button, and — with `/api/telegram/webhook` appended — the webhook. Must be HTTPS in production. |
| `TELEGRAM_WEBHOOK_SECRET` | for the webhook | Your own random value; the only thing guarding the public webhook endpoint. Server-only. |
| `TELEGRAM_INIT_DATA_MAX_AGE_SECONDS` | no | How long a launch payload stays acceptable. Default 3600. |
| `AUTH_SESSION_TTL_SECONDS` | no | Lifetime of a session and its cookie. Default 2592000 (30 days). |
| `DEFAULT_TIMEZONE` | no | Only used by the development seed (`npm run db:seed`). Real accounts confirm their own timezone during onboarding. Default `UTC`. |
| `ALLOW_DEV_AUTH` | no | **Local development only.** Runs requests without a session as a local development user. Needs the exact string `"true"` *and* a non-production `NODE_ENV`, so a production build ignores it. Never a fallback for a failed Telegram sign-in. |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT` | no | Only for the bundled Docker container. Unused if you bring your own database. |

Never commit real values. `.env` is gitignored, and `.env.example` is the template.

## Operating notes

- **Schema changes.** Edit `src/db/schema.ts`, run `npm run db:generate`, review the SQL,
  then `npm run db:migrate`. Never edit a migration that has already been applied.
- **Backups are yours.** Nothing in this repository backs up your database.
- **Rotating the bot token or webhook secret** means updating the environment and
  running `npm run telegram:configure` again.

## Known limitations

- Onboarding runs once and cannot be revisited: there is no way to change your
  language, timezone or daily goal afterwards, and no way to study a second language.
- There is no logout, and no session rotation.
- A study session that crosses midnight counts entirely toward the day it started on.
