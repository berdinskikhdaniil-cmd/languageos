import { describe, expect, it } from "vitest";
import { parseTelegramCommand, parseTelegramUpdate } from "./update";

describe("parseTelegramCommand", () => {
  it("reads a bare command", () => {
    expect(parseTelegramCommand("/start")).toEqual({ name: "start", botUsername: null, payload: "" });
  });

  it("reads a command with a payload but does not act on it", () => {
    expect(parseTelegramCommand("/start ref_123")).toEqual({
      name: "start",
      botUsername: null,
      payload: "ref_123",
    });
  });

  it("reads a command addressed to a specific bot", () => {
    expect(parseTelegramCommand("/start@LanguageOsBot")).toEqual({
      name: "start",
      botUsername: "LanguageOsBot",
      payload: "",
    });
  });

  it("reads an addressed command that also carries a payload", () => {
    expect(parseTelegramCommand("/start@LanguageOsBot deep link")).toEqual({
      name: "start",
      botUsername: "LanguageOsBot",
      payload: "deep link",
    });
  });

  it("normalises the command name to lower case", () => {
    expect(parseTelegramCommand("/HELP")?.name).toBe("help");
  });

  it("reads /help", () => {
    expect(parseTelegramCommand("/help")).toEqual({ name: "help", botUsername: null, payload: "" });
  });

  it("is not a command when the slash is not at the start", () => {
    expect(parseTelegramCommand("see /start for details")).toBeNull();
  });

  it("is not a command for ordinary text", () => {
    expect(parseTelegramCommand("watched 40 minutes of German youtube")).toBeNull();
    expect(parseTelegramCommand("")).toBeNull();
    expect(parseTelegramCommand(null)).toBeNull();
  });

  it("rejects a slash with nothing usable after it", () => {
    expect(parseTelegramCommand("/")).toBeNull();
    expect(parseTelegramCommand("/ start")).toBeNull();
    expect(parseTelegramCommand("/@LanguageOsBot")).toBeNull();
    expect(parseTelegramCommand("/hey!")).toBeNull();
  });
});

describe("parseTelegramUpdate", () => {
  const message = {
    update_id: 12,
    message: {
      message_id: 3,
      chat: { id: 4242, type: "private" },
      from: { id: 99, is_bot: false, username: "learner", first_name: "Lena" },
      text: "/start",
    },
  };

  it("reads the fields this app uses", () => {
    expect(parseTelegramUpdate(message)).toEqual({
      updateId: 12,
      message: {
        messageId: 3,
        chat: { id: 4242, type: "private" },
        from: { id: 99, isBot: false, username: "learner", firstName: "Lena" },
        text: "/start",
      },
    });
  });

  it("keeps an update with no message we model", () => {
    expect(parseTelegramUpdate({ update_id: 7, edited_message: {} })).toEqual({
      updateId: 7,
      message: null,
    });
  });

  it("drops a message with no readable chat", () => {
    expect(parseTelegramUpdate({ update_id: 7, message: { text: "hi" } })?.message).toBeNull();
  });

  it("reports a payload that is not an update at all", () => {
    expect(parseTelegramUpdate(null)).toBeNull();
    expect(parseTelegramUpdate("update")).toBeNull();
    expect(parseTelegramUpdate({})).toBeNull();
    expect(parseTelegramUpdate({ update_id: "12" })).toBeNull();
  });

  it("treats a non-text message as text-free rather than unreadable", () => {
    const voice = parseTelegramUpdate({
      update_id: 8,
      message: { message_id: 1, chat: { id: 1, type: "private" }, voice: { duration: 4 } },
    });
    expect(voice?.message?.text).toBeNull();
  });
});
