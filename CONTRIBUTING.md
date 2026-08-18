# Contributing to Language OS

Thanks for considering a contribution. Use whatever editor or tooling you like — the
only things that matter here are the checks below and the conventions the codebase
already follows.

## Getting set up

```bash
git clone https://github.com/<your-username>/languageos.git
cd languageos
npm ci
cp .env.example .env
npm run db:up          # PostgreSQL in Docker
npm run db:migrate
npm run dev
```

`.env.example` enables `ALLOW_DEV_AUTH`, so you can work on everything except the
Telegram sign-in itself without a bot. The [self-hosting
guide](docs/self-hosting.md) covers a full Telegram setup if you need one.

Work on a branch in your fork, and open a pull request against `main`.

## Before opening a pull request

```bash
npm test           # unit tests — no database, no network
npm run test:db    # integration tests — needs `npm run db:up`
npm run lint
npm run typecheck
npm run build
```

All of them must pass. `npm run test:db` is required whenever you touch persistence,
authentication or data isolation.

Add tests for what you change. Pure rules live in `features/<name>/domain/` precisely so
they can be tested without a database or a clock.

## Database changes

- Schema changes need a **new** Drizzle migration: edit `src/db/schema.ts`, run
  `npm run db:generate`, and commit the generated SQL after reading it.
- **Never edit a migration that has already been applied**, and never edit the journal
  in `drizzle/meta/`. Fix a mistake with another migration.
- **Prefer additive, backward-compatible changes.** A deployment applies migrations
  before the new code is live, and a rollback puts the old code back under the new
  schema, so a migration must leave the previous version working. Add a nullable or
  defaulted column now; drop the old one in a later change, once nothing reads it.
- A rename is an add, a backfill, a code switch and a drop — spread across several
  changes, not one migration.
- Dropping a column or table, or deleting rows, needs to be discussed in an issue first.

## UI changes

[docs/design-system.md](docs/design-system.md) is binding and outranks whatever a
component happens to do today. In short: mobile-first for the Telegram viewport, a dark
neutral interface with a green accent, Manrope as the only typeface, and no monospace
anywhere in product UI.

Design for 360px, 390px and 430px widths. No horizontal overflow at any of them, and
respect the Telegram safe-area tokens.

## Code conventions

- Keep the layering: `domain/` (pure rules) → `data/` (queries) → `actions.ts` → UI.
- Feature code works from the internal user id. Telegram identity stays behind the auth
  boundary.
- Every query is scoped to the authenticated user. Never accept a client-supplied user,
  session or language id as proof of ownership.
- Timezone arithmetic belongs in `src/lib/time.ts`. Pass `now` in rather than calling
  `new Date()` inside a rule.
- Never log a bot token, raw `initData`, a session token or a connection string.
- Match the surrounding code: same naming, same comment density, same idiom.

## Reporting bugs

Open an issue with what you did, what you expected and what happened. For anything
security-related, do **not** open a public issue — see [SECURITY.md](SECURITY.md).

## Licence

Contributions are accepted under the [GNU Affero General Public License v3.0](LICENSE),
the licence this project is distributed under.
