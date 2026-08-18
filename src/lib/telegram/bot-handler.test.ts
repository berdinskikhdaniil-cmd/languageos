import { describe, expect, it, vi } from "vitest";
import type { SendMessageParams } from "./bot-api";
import {
  HELP_TEXT,
  OPEN_APP_BUTTON_TEXT,
  START_TEXT,
  UNKNOWN_COMMAND_TEXT,
  handleTelegramUpdate,
} from "./bot-handler";
import type { TelegramUpdate } from "./update";

const WEB_APP_URL = "https://app.example.com";

function context(webAppUrl: string | null = WEB_APP_URL) {
  const sendMessage = vi.fn<(params: SendMessageParams) => Promise<{ messageId: number }>>(
    async () => ({ messageId: 1 }),
  );
  return { api: { sendMessage }, webAppUrl, sendMessage };
}

function update(
  text: string | null,
  overrides: { chatType?: string; isBot?: boolean } = {},
): TelegramUpdate {
  return {
    updateId: 1,
    message: {
      messageId: 10,
      chat: { id: 555, type: overrides.chatType ?? "private" },
      from: { id: 99, isBot: overrides.isBot ?? false, username: "learner", firstName: "Lena" },
      text,
    },
  };
}

describe("handleTelegramUpdate — /start", () => {
  it("answers a private /start with the product line and a Mini App button", async () => {
    const ctx = context();

    const outcome = await handleTelegramUpdate(update("/start"), ctx);

    expect(outcome).toEqual({ action: "start" });
    expect(ctx.sendMessage).toHaveBeenCalledTimes(1);
    expect(ctx.sendMessage).toHaveBeenCalledWith({
      chatId: 555,
      text: START_TEXT,
      replyMarkup: {
        inline_keyboard: [[{ text: OPEN_APP_BUTTON_TEXT, web_app: { url: WEB_APP_URL } }]],
      },
    });
  });

  it("answers the same way when the command is addressed or carries a payload", async () => {
    for (const text of ["/start@LanguageOsBot", "/start ref_123"]) {
      const ctx = context();
      const outcome = await handleTelegramUpdate(update(text), ctx);

      expect(outcome).toEqual({ action: "start" });
      expect(ctx.sendMessage.mock.calls[0][0].replyMarkup?.inline_keyboard[0][0].web_app.url).toBe(
        WEB_APP_URL,
      );
    }
  });

  it("sends no button and reports the configuration problem when no URL is set", async () => {
    const ctx = context(null);

    const outcome = await handleTelegramUpdate(update("/start"), ctx);

    expect(outcome).toEqual({ action: "start", configurationProblem: "web_app_url_not_configured" });
    expect(ctx.sendMessage).toHaveBeenCalledWith({ chatId: 555, text: START_TEXT });
    expect(ctx.sendMessage.mock.calls[0][0].replyMarkup).toBeUndefined();
  });
});

describe("handleTelegramUpdate — /help", () => {
  it("answers with the short help text and no button", async () => {
    const ctx = context();

    const outcome = await handleTelegramUpdate(update("/help"), ctx);

    expect(outcome).toEqual({ action: "help" });
    expect(ctx.sendMessage).toHaveBeenCalledWith({ chatId: 555, text: HELP_TEXT });
  });

  it("only mentions commands that exist", () => {
    expect(HELP_TEXT).toContain("/start");
    for (const absent of ["/log", "/stop", "/timer", "/voice", "/remind"]) {
      expect(HELP_TEXT).not.toContain(absent);
    }
  });
});

describe("handleTelegramUpdate — everything else", () => {
  it("stays quiet on ordinary text", async () => {
    const ctx = context();

    const outcome = await handleTelegramUpdate(update("watched 40 minutes of German youtube"), ctx);

    expect(outcome).toEqual({ action: "ignored", reason: "not_a_command" });
    expect(ctx.sendMessage).not.toHaveBeenCalled();
  });

  it("stays quiet on a message with no text at all", async () => {
    const ctx = context();

    const outcome = await handleTelegramUpdate(update(null), ctx);

    expect(outcome).toEqual({ action: "ignored", reason: "not_a_command" });
    expect(ctx.sendMessage).not.toHaveBeenCalled();
  });

  it("points an unknown command at /help instead of inventing behaviour", async () => {
    const ctx = context();

    const outcome = await handleTelegramUpdate(update("/log 30 minutes"), ctx);

    expect(outcome).toEqual({ action: "unknown_command" });
    expect(ctx.sendMessage).toHaveBeenCalledWith({ chatId: 555, text: UNKNOWN_COMMAND_TEXT });
    expect(ctx.sendMessage.mock.calls[0][0].replyMarkup).toBeUndefined();
  });

  it("ignores an update carrying no message", async () => {
    const ctx = context();

    const outcome = await handleTelegramUpdate({ updateId: 3, message: null }, ctx);

    expect(outcome).toEqual({ action: "ignored", reason: "no_message" });
    expect(ctx.sendMessage).not.toHaveBeenCalled();
  });

  it("ignores another bot", async () => {
    const ctx = context();

    const outcome = await handleTelegramUpdate(update("/start", { isBot: true }), ctx);

    expect(outcome).toEqual({ action: "ignored", reason: "from_bot" });
    expect(ctx.sendMessage).not.toHaveBeenCalled();
  });
});

describe("handleTelegramUpdate — chats that are not private", () => {
  it("never runs the Mini App flow in a group, supergroup or channel", async () => {
    for (const chatType of ["group", "supergroup", "channel"]) {
      const ctx = context();

      const outcome = await handleTelegramUpdate(update("/start", { chatType }), ctx);

      expect(outcome).toEqual({ action: "ignored", reason: "non_private_chat" });
      expect(ctx.sendMessage).not.toHaveBeenCalled();
    }
  });

  it("does not answer /help in a group either", async () => {
    const ctx = context();

    const outcome = await handleTelegramUpdate(update("/help", { chatType: "supergroup" }), ctx);

    expect(outcome.action).toBe("ignored");
    expect(ctx.sendMessage).not.toHaveBeenCalled();
  });
});
