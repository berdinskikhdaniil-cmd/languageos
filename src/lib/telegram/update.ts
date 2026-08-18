/**
 * The slice of a Telegram update this app reads, and the parsing that gets it
 * out of an untrusted JSON body.
 *
 * Only what Iteration 4 needs is modelled — a message, its text, its chat and
 * its sender. Everything else in an update is ignored on purpose: copying the
 * whole Bot API schema by hand would be a liability, not a feature.
 */

export type TelegramUpdateChat = {
  id: number;
  /** "private" | "group" | "supergroup" | "channel" — kept open, Telegram may add more. */
  type: string;
};

export type TelegramUpdateSender = {
  id: number;
  isBot: boolean;
  username: string | null;
  firstName: string | null;
};

export type TelegramUpdateMessage = {
  messageId: number | null;
  chat: TelegramUpdateChat;
  from: TelegramUpdateSender | null;
  text: string | null;
};

export type TelegramUpdate = {
  updateId: number;
  message: TelegramUpdateMessage | null;
};

export type TelegramCommand = {
  /** Lowercased, without the leading slash. */
  name: string;
  /** The `@bot` suffix, when the sender used one. */
  botUsername: string | null;
  /** Everything after the command, trimmed. Unused for now. */
  payload: string;
};

const COMMAND_NAME_PATTERN = /^[A-Za-z0-9_]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function parseChat(value: unknown): TelegramUpdateChat | null {
  if (!isRecord(value)) return null;
  // Chat ids exceed 32 bits but stay inside the exact-integer range.
  if (typeof value.id !== "number" || !Number.isSafeInteger(value.id)) return null;
  if (typeof value.type !== "string" || value.type === "") return null;
  return { id: value.id, type: value.type };
}

function parseSender(value: unknown): TelegramUpdateSender | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "number" || !Number.isSafeInteger(value.id)) return null;
  return {
    id: value.id,
    isBot: value.is_bot === true,
    username: optionalString(value.username),
    firstName: optionalString(value.first_name),
  };
}

function parseMessage(value: unknown): TelegramUpdateMessage | null {
  if (!isRecord(value)) return null;

  const chat = parseChat(value.chat);
  if (!chat) return null;

  return {
    messageId: typeof value.message_id === "number" ? value.message_id : null,
    chat,
    from: parseSender(value.from),
    text: typeof value.text === "string" ? value.text : null,
  };
}

/**
 * Reads an update out of a parsed webhook body. Returns null when the payload
 * is not something we recognise — the caller acknowledges it and moves on
 * rather than letting an unexpected shape reach product code.
 */
export function parseTelegramUpdate(payload: unknown): TelegramUpdate | null {
  if (!isRecord(payload)) return null;
  if (typeof payload.update_id !== "number" || !Number.isSafeInteger(payload.update_id)) return null;

  return {
    updateId: payload.update_id,
    message: parseMessage(payload.message),
  };
}

/**
 * Reads `/start`, `/start payload` and `/start@LanguageOsBot` alike.
 *
 * Telegram only treats a leading slash at the very start of a message as a
 * command, and so do we — "see /start" is ordinary text.
 */
export function parseTelegramCommand(text: string | null): TelegramCommand | null {
  if (!text || !text.startsWith("/")) return null;

  const separator = text.search(/\s/);
  const head = (separator === -1 ? text : text.slice(0, separator)).slice(1);
  const payload = separator === -1 ? "" : text.slice(separator).trim();

  const atIndex = head.indexOf("@");
  const name = atIndex === -1 ? head : head.slice(0, atIndex);
  const botUsername = atIndex === -1 ? null : head.slice(atIndex + 1);

  if (!COMMAND_NAME_PATTERN.test(name)) return null;

  return {
    name: name.toLowerCase(),
    botUsername: botUsername ? botUsername : null,
    payload,
  };
}
