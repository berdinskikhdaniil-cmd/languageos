# Language OS

Track how you actually learn a language — across YouTube, podcasts, books, tutors and
conversation — and turn that activity into practice and measurable progress.

Language OS is a Telegram-first, self-hostable language learning tracker. It does not
try to replace the material you already learn from. It records what you do across all
of it, and closes the loop:

> study → reproduce → feedback → fix weak points → see progress

## Try the hosted version

The official bot is [@languageosbot](https://t.me/languageosbot). Send it `/start` and
open the Mini App.

The hosted service is the easiest way to use Language OS without running any
infrastructure. It runs the same code as this repository.

## Available now

- **Telegram Mini App** — a mobile-first interface, designed for the Telegram viewport.
- **Russian and English interface** — the whole app in either, chosen in Settings and
  remembered between launches. A new account opens in the language its Telegram client
  reports, and that guess never overrules a choice made afterwards.
- **Telegram authentication** — the signed `initData` from a launch is verified on the
  server, which then issues its own session in an HttpOnly cookie.
- **First-run onboarding** — a new account chooses the language it is learning,
  confirms the timezone its device reports, and picks a daily goal. The three are
  written in one transaction, and no other screen opens until they are.
- **Multi-user tracker on PostgreSQL** — every read and write is scoped to the
  authenticated user.
- **Timed study sessions** — start, stop or discard. Elapsed time is derived from the
  stored start timestamp, so it survives a reload, and the final duration is
  recomputed server-side. One running session per user, enforced by a database index.
- **Manual entries** — log a session after the fact, with server-side validation.
- **Writing with AI feedback** — write freely or retell something you watched or
  read, and get back a short summary, the mistakes marked in your own text with an
  explanation and a correction for each, and a better version of the whole thing.
  Then rewrite it yourself: you get your own draft back, not the corrected one. The
  summary and the explanations arrive in your interface language; the corrections are
  in the language you are learning. Practice lists the last three pieces you wrote —
  there is no full writing history yet.
- **Activity breakdown** — video, podcast, reading, conversation, writing, speaking and
  other, grouped into Input, Speaking and Writing.
- **Daily and weekly totals** — today and this week, with a real previous-week
  comparison, drawn against the daily goal that was chosen during setup. Day and week
  boundaries are computed in the user's own timezone, not the server's.
- **Speaking with AI feedback** — get a topic, record an answer out loud, and read
  back what you actually said. The recording is transcribed, the transcript is
  reviewed as *spoken* language — filler and false starts are not treated as
  mistakes — and the corrections are marked in your own words, with a verdict on
  whether you answered the question and a better way to say the same thing.
  Recordings are capped at 90 seconds, and the audio is never stored: it is
  transcribed and discarded. Pronunciation is **not** assessed — a transcript is
  text, and text cannot show how you sounded.
- **Detailed progress analytics** — one screen showing how much you studied and when,
  how the time split between input, speaking and writing, a twelve-week consistency
  grid, and how your written error rate is moving. Every figure comes from what you
  actually logged and had reviewed; a period with no data draws nothing rather than
  a smoothed guess.
- **Unified mistake tracking** — the corrections from your writing and your speaking
  are read as one set of weak points on the Progress screen: which categories come up
  most, which specific skills have come up at least twice, where each one happened,
  and what the correction was. Tapping any of them opens the review it came from.
  Counts of "mistakes" are concrete errors only — stylistic suggestions are shown and
  counted separately.
- **Targeted practice from your own mistakes** — tap a weak point on Progress, or one
  of the three offered on Practice, and get five short exercises built from the
  mistakes you actually made. They train the *skill*, in new situations: an exercise
  never repeats the sentence you got wrong. Answer all five, then the whole set is
  checked at once — an answer that differs from the reference one but is still
  correct is marked as such rather than as a mistake. Building a set takes a few
  seconds and you watch it happen rather than a frozen button: the screen opens
  immediately, says what it is doing, and shows the first exercise by itself when it is
  ready. Your answers are saved as you go, so a set you left half-finished — or one that
  was still being built when you closed the app — is waiting on Practice. Practising does not
  change your history of mistakes: the counts on Progress mean what they meant
  before, and practice time is not yet counted as study time.
- **Errors per 1,000 words** — a real figure and a real trend, over reviewed writing
  only, with an honest "not enough data yet" until there is enough of it to divide by.
- **Settings** — one setting so far: the language the interface is drawn in.
- **Telegram bot** — `/start` and `/help`, a button that opens the Mini App, and a
  webhook that verifies Telegram's secret header.

One panel on the dashboard — the coach recommendation — is **placeholder content, not
a working feature**. It is marked as such in
`src/features/dashboard/demo-analytics.ts`, and nothing is reading your history behind
it yet.

The AI in the product runs through
[OpenRouter](https://openrouter.ai), on whichever model you configure, and the
feature stays switched off until you set one.

## Planned

- Vocabulary and spaced repetition
- Progress history, including a then-versus-now comparison
- Onboarding, and support for more than one language per user

No dates are promised for any of these.

## How it works

```
Telegram client
  → Mini App (Next.js)
      → PostgreSQL

Telegram Bot API
  → webhook (Next.js)
      → Telegram Bot API
```

Authentication in one line:

```
Telegram initData → server-side signature check → internal user → session in an HttpOnly cookie
```

Telegram identity stays behind that boundary. Feature code only ever sees an internal
user id, and the app never trusts a client-supplied user, session or language id.

## Quick start

You need Node.js 22 or newer, and Docker for the local database.

```bash
git clone https://github.com/berdinskikhdaniil-cmd/languageos.git
cd languageos
npm ci
cp .env.example .env
npm run db:up          # start PostgreSQL in Docker
npm run db:migrate     # apply migrations
npm run dev
```

Open <http://localhost:3000>.

`.env.example` ships with `ALLOW_DEV_AUTH="true"`, which lets localhost run as a local
development user so you can use the tracker without Telegram. It requires a
non-production `NODE_ENV` as well, so it cannot be switched on in production.

Running it for real — with a Telegram bot, a public HTTPS URL and your own database —
is covered in the **[self-hosting guide](docs/self-hosting.md)**.

## Development

```bash
npm run dev        # development server
npm run build      # production build (does not need a database)
npm run start      # serve the production build
npm test           # unit tests — no database, no network
npm run test:db    # integration tests — needs `npm run db:up`
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
```

Database commands:

```bash
npm run db:up        # start the local container
npm run db:down      # stop it, keeping the volume
npm run db:reset     # destroy the volume, recreate, migrate
npm run db:generate  # generate a migration after editing src/db/schema.ts
npm run db:migrate   # apply pending migrations
npm run db:studio    # browse the data
npm run db:seed      # example sessions for the development user
```

`db:seed` and `db:reset` refuse to run unless `DATABASE_URL` points at a database on
your own machine.

## Stack

- Next.js 16 (App Router) and React 19, TypeScript
- Tailwind CSS 4, with design tokens as CSS variables in `src/app/globals.css`
- PostgreSQL with Drizzle ORM; migrations in `drizzle/`
- Vitest, in two suites
- No UI framework, and no AI provider yet

## Layout

```
src/
  app/                routes, root layout, design tokens, API routes
  components/         auth screens, layout shell, shared UI primitives
  db/                 Drizzle schema, connection pool, environment rules
  features/<name>/    domain/ (pure rules) · data/ (queries) · actions.ts · components/
  lib/
    auth/             identity, sessions, environment gating
    telegram/         Mini App bridge, initData validator, Bot API client, update handler
    …                 time zones, formatting, navigation
drizzle/              generated migrations
scripts/              explicit scripts (migrations, seed, Telegram setup)
docs/                 design rules, self-hosting guide
```

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). UI changes must
follow [docs/design-system.md](docs/design-system.md), which is binding.

## Security

Please do not report vulnerabilities through public issues. See
[SECURITY.md](SECURITY.md).

## License

[GNU Affero General Public License v3.0](LICENSE).

If you run a modified version of Language OS as a network service, the AGPL requires
you to offer its source to the people who use it.
