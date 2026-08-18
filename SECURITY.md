# Security policy

## Reporting a vulnerability

**Please do not open a public issue for a security problem**, and do not disclose it
publicly until it has been fixed.

Report it privately through GitHub instead:

1. Go to the [Security tab](https://github.com/berdinskikhdaniil-cmd/languageos/security)
   of this repository.
2. Choose **Report a vulnerability**.

That opens a private advisory visible only to you and the maintainer. Private
vulnerability reporting is enabled on this repository, so no other contact channel is
needed.

If GitHub's form is unavailable to you for some reason, open a public issue that says
only that you have found a security problem and would like a private channel — with no
technical detail — and you will be invited to a private advisory.

## What to include

- What the problem is, and which part of the app it affects.
- Steps to reproduce, or a proof of concept.
- What an attacker could achieve with it.
- The version or commit you tested.

## Scope

This repository is the Language OS application: the Telegram Mini App, its API routes,
the Telegram bot webhook, and the database layer. Issues that are especially relevant:

- bypassing Telegram `initData` validation or forging a session;
- reading or writing another user's data;
- accepting a webhook request without the correct secret;
- leaking a bot token, webhook secret, session token or connection string;
- reaching the development authentication bypass in a production build.

Out of scope: vulnerabilities in Telegram itself, and reports about a self-hosted
deployment's own infrastructure — its host, network or database configuration.

Self-hosted instances are operated by whoever runs them. If you find a problem in a
running instance that is not the official hosted bot, report it to its operator.

## Handling

You will get an acknowledgement of your report. Fixes land on `main` and reach the
hosted service through its normal deployment; self-hosters should update from `main`.
This is a small project with no formal response-time commitment, and there is no bug
bounty.
