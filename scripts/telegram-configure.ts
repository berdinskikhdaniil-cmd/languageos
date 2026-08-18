/**
 * Applies this app's Telegram configuration to the live bot: its command list,
 * its menu button and, when a public HTTPS URL exists, its webhook.
 *
 * Explicit on purpose — nothing calls it during `npm run dev` or a build. Every
 * call it makes is a full overwrite, so running it twice is safe and leaves the
 * same state.
 *
 * Steps that cannot be applied are skipped with a reason rather than guessed
 * at: a menu button or webhook pointing at localhost would simply be broken.
 *
 * Run explicitly with `npm run telegram:configure`.
 */

import { telegramBotApiFromEnv } from "@/lib/telegram/bot-api";
import {
  TELEGRAM_WEBHOOK_PATH,
  WEB_APP_URL_PROBLEMS,
  isValidWebhookSecret,
  telegramWebhookSecret,
  telegramWebhookUrl,
  webAppUrlForTelegram,
} from "@/lib/telegram/bot-config";
import { BOT_COMMANDS, MENU_BUTTON_TEXT } from "@/lib/telegram/bot-handler";
import { printBot, runTelegramScript } from "./telegram-cli";

runTelegramScript("telegram:configure", async () => {
  const api = telegramBotApiFromEnv();

  // Nothing is written before the credentials are known to work.
  printBot(await api.getMe());

  await api.setMyCommands(BOT_COMMANDS);
  console.log(`\nCommands set: ${BOT_COMMANDS.map((c) => `/${c.command}`).join(", ")}`);

  const webApp = webAppUrlForTelegram();
  if (!webApp.ok) {
    console.log(`Menu button skipped: ${WEB_APP_URL_PROBLEMS[webApp.problem]}`);
  } else {
    await api.setChatMenuButton({
      type: "web_app",
      text: MENU_BUTTON_TEXT,
      web_app: { url: webApp.url },
    });
    console.log(`Menu button set: "${MENU_BUTTON_TEXT}" → ${webApp.url}`);
  }

  const webhook = telegramWebhookUrl();
  const secret = telegramWebhookSecret();

  if (!webhook.ok) {
    console.log(`Webhook skipped: ${WEB_APP_URL_PROBLEMS[webhook.problem]}`);
    console.log("Real Telegram webhooks need a public HTTPS deployment of this app.");
    return;
  }

  if (!secret) {
    console.log("Webhook skipped: TELEGRAM_WEBHOOK_SECRET is not set.");
    return;
  }

  if (!isValidWebhookSecret(secret)) {
    console.log(
      "Webhook skipped: TELEGRAM_WEBHOOK_SECRET must be 1-256 characters of A-Z, a-z, 0-9, _ or -.",
    );
    return;
  }

  await api.setWebhook({
    url: webhook.url,
    secretToken: secret,
    // This bot reads messages and nothing else; anything wider is traffic we
    // would only drop.
    allowedUpdates: ["message"],
  });

  const info = await api.getWebhookInfo();
  console.log(`\nWebhook set: ${new URL(webhook.url).host}${TELEGRAM_WEBHOOK_PATH}`);
  console.log(`  registered:    ${info.url ? "yes" : "no"}`);
  console.log(`  pending:       ${info.pendingUpdateCount}`);
  if (info.lastErrorMessage) console.log(`  last error:    ${info.lastErrorMessage}`);
});
