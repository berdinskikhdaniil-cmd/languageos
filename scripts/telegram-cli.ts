/**
 * Shared plumbing for the two Telegram setup scripts.
 *
 * Both talk to the live Bot API, so both must be careful about what reaches a
 * terminal: the bot token and the webhook secret are never printed, and a
 * failure is reported through `TelegramBotApiError`, which is already
 * redacted, rather than by dumping a raw error.
 */

import { TelegramBotApiError, type TelegramBotUser } from "@/lib/telegram/bot-api";

export function printBot(me: TelegramBotUser): void {
  console.log("Bot token verified against the Telegram Bot API.");
  console.log(`  id:       ${me.id}`);
  console.log(`  username: ${me.username ? `@${me.username}` : "(none)"}`);
  console.log(`  name:     ${me.firstName}`);
}

/** Runs a script body, turning any failure into one safe line and exit code 1. */
export function runTelegramScript(name: string, body: () => Promise<void>): void {
  body()
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      if (error instanceof TelegramBotApiError) {
        console.error(`\n${name} stopped: ${error.message}`);
      } else if (error instanceof Error) {
        console.error(`\n${name} stopped: ${error.message}`);
      } else {
        console.error(`\n${name} stopped for an unknown reason.`);
      }
      process.exit(1);
    });
}
