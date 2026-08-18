/**
 * Verifies the configured bot token against Telegram, and reports what the
 * rest of the setup would find. Read-only: it changes nothing.
 *
 * Run explicitly with `npm run telegram:check`.
 */

import { telegramBotApiFromEnv } from "@/lib/telegram/bot-api";
import {
  TELEGRAM_WEBHOOK_PATH,
  WEB_APP_URL_PROBLEMS,
  isValidWebhookSecret,
  telegramWebAppUrl,
  telegramWebhookSecret,
  webAppUrlForTelegram,
} from "@/lib/telegram/bot-config";
import { printBot, runTelegramScript } from "./telegram-cli";

runTelegramScript("telegram:check", async () => {
  const api = telegramBotApiFromEnv();
  printBot(await api.getMe());

  console.log("\nConfiguration:");

  const webApp = telegramWebAppUrl();
  if (!webApp.ok) {
    console.log(`  Mini App URL:   not usable — ${WEB_APP_URL_PROBLEMS[webApp.problem]}`);
  } else if (webApp.value.isLocal) {
    console.log(`  Mini App URL:   ${webApp.value.url} (local — Telegram cannot reach it)`);
  } else {
    console.log(`  Mini App URL:   ${webApp.value.url}`);
  }

  const secret = telegramWebhookSecret();
  if (!secret) {
    console.log("  Webhook secret: not set");
  } else if (!isValidWebhookSecret(secret)) {
    console.log("  Webhook secret: set, but not in Telegram's allowed format (A-Z a-z 0-9 _ -, 1-256 chars)");
  } else {
    console.log("  Webhook secret: set");
  }

  const usable = webAppUrlForTelegram();
  console.log(
    usable.ok
      ? `  Webhook URL:    ${new URL(usable.url).host}${TELEGRAM_WEBHOOK_PATH}`
      : "  Webhook URL:    unavailable until a public HTTPS Mini App URL is configured",
  );

  // Only informative: an unregistered webhook reports an empty url.
  const info = await api.getWebhookInfo();
  console.log("\nRegistered webhook:");
  if (!info.url) {
    console.log("  none");
  } else {
    console.log(`  host:    ${new URL(info.url).host}`);
    console.log(`  path:    ${new URL(info.url).pathname}`);
    console.log(`  pending: ${info.pendingUpdateCount}`);
    if (info.lastErrorMessage) console.log(`  last error: ${info.lastErrorMessage}`);
  }
});
