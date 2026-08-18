/**
 * What the bot actually does with an update.
 *
 * Knows nothing about Next.js: it takes a parsed update and a context holding
 * the Bot API and the Mini App URL, and returns what it decided. That keeps the
 * route thin and every rule below testable without a request.
 *
 * The scope is deliberately narrow. This layer is a door to the Mini App, not
 * an assistant: it answers commands it knows and stays quiet otherwise.
 *
 * It never touches identity. A `message.from.id` is a Telegram id, and the
 * Mini App's own sign-in — initData → validation → internal user → session —
 * is the only thing allowed to turn one into a user of this product.
 */

import type { SendMessageParams, TelegramBotApi, TelegramBotCommand } from "./bot-api";
import { parseTelegramCommand, type TelegramUpdate } from "./update";

/** Offered in Telegram's command menu. Never promise a command we lack. */
export const BOT_COMMANDS: TelegramBotCommand[] = [
  { command: "start", description: "Open Language OS" },
  { command: "help", description: "What this bot can do" },
];

export const OPEN_APP_BUTTON_TEXT = "Open Language OS";

/** Shown on the bot's persistent menu button in the chat input. */
export const MENU_BUTTON_TEXT = "Open app";

export const START_TEXT =
  "Language OS keeps all your language learning in one place — practice, track your time, and see real progress.";

export const HELP_TEXT =
  "/start — open Language OS.\n\n" +
  "The bot is only the entrance. Tracking your time and seeing your week happen inside the Mini App.";

export const UNKNOWN_COMMAND_TEXT = "I don't know that command. Try /help.";

/** Everything the handler can decide to do with one update. */
export type TelegramUpdateOutcome = {
  action: "start" | "help" | "unknown_command" | "ignored";
  /** Why an update was left alone. Useful in a log, never sent to a chat. */
  reason?: "no_message" | "non_private_chat" | "from_bot" | "not_a_command";
  /** Set when a reply was sent in a degraded form because setup is incomplete. */
  configurationProblem?: "web_app_url_not_configured";
};

export type TelegramBotContext = {
  api: Pick<TelegramBotApi, "sendMessage">;
  /**
   * A URL Telegram can open, or null when none is configured. Never a
   * localhost URL — `webAppUrlForTelegram()` refuses those.
   */
  webAppUrl: string | null;
};

function startReply(chatId: number, webAppUrl: string | null): SendMessageParams {
  // Without a real URL there is no button to draw. A Web App button pointing
  // nowhere fails inside the Telegram client, so the text goes out alone and
  // the caller is told the configuration is incomplete.
  if (!webAppUrl) return { chatId, text: START_TEXT };

  return {
    chatId,
    text: START_TEXT,
    replyMarkup: { inline_keyboard: [[{ text: OPEN_APP_BUTTON_TEXT, web_app: { url: webAppUrl } }]] },
  };
}

export async function handleTelegramUpdate(
  update: TelegramUpdate,
  context: TelegramBotContext,
): Promise<TelegramUpdateOutcome> {
  const message = update.message;
  if (!message) return { action: "ignored", reason: "no_message" };

  // A Web App button is only valid in a private chat, and a group is not a
  // place to start someone's personal Mini App session.
  if (message.chat.type !== "private") return { action: "ignored", reason: "non_private_chat" };
  if (message.from?.isBot) return { action: "ignored", reason: "from_bot" };

  const command = parseTelegramCommand(message.text);
  // Ordinary text gets no answer: the bot is not a chat surface yet, and a
  // canned line on every message would be noise.
  if (!command) return { action: "ignored", reason: "not_a_command" };

  const chatId = message.chat.id;

  switch (command.name) {
    case "start": {
      // The /start payload is parsed but unused — nothing consumes deep links yet.
      await context.api.sendMessage(startReply(chatId, context.webAppUrl));
      return context.webAppUrl
        ? { action: "start" }
        : { action: "start", configurationProblem: "web_app_url_not_configured" };
    }

    case "help": {
      await context.api.sendMessage({ chatId, text: HELP_TEXT });
      return { action: "help" };
    }

    default: {
      await context.api.sendMessage({ chatId, text: UNKNOWN_COMMAND_TEXT });
      return { action: "unknown_command" };
    }
  }
}
