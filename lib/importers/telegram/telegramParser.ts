import type { NormalizedMessage, TelegramExport, TelegramTextEntity } from "./telegramTypes";

export type ParsedTelegramConversation = {
  conversationId: string;
  conversationName: string;
  messages: NormalizedMessage[];
  participants: string[];
};

function flattenText(text: string | TelegramTextEntity[] | undefined): string {
  if (typeof text === "string") return text;
  if (!text) return "";
  return text.map((entity) => entity.text).join("");
}

export function parseTelegramExport(value: unknown): ParsedTelegramConversation {
  if (!value || typeof value !== "object" || !("messages" in value) || !Array.isArray(value.messages)) {
    throw new Error("This does not look like a Telegram JSON export.");
  }

  const data = value as TelegramExport;
  const conversationId = String(data.id ?? data.name ?? "telegram-conversation");
  const messages = data.messages
    .filter((message) => message.type !== "service")
    .map((message) => {
      const timestamp = message.date || new Date(Number(message.date_unixtime ?? 0) * 1_000).toISOString();
      return {
        id: String(message.id),
        conversationId,
        senderId: message.from_id ?? message.from ?? "unknown",
        senderName: message.from ?? "Unknown participant",
        text: flattenText(message.text),
        timestamp,
        timestampUtc: new Date(timestamp).toISOString(),
        replyToMessageId: message.reply_to_message_id ? String(message.reply_to_message_id) : null,
        mediaType: message.media_type ?? null,
        metadata: { originalTimestamp: message.date, type: message.type ?? "message" },
      } satisfies NormalizedMessage;
    });

  return {
    conversationId,
    conversationName: data.name ?? "Telegram conversation",
    messages,
    participants: [...new Set(messages.map((message) => message.senderName))],
  };
}

function isTelegramConversation(value: unknown): value is TelegramExport {
  return Boolean(value && typeof value === "object" && "messages" in value && Array.isArray(value.messages));
}

function readConversationLists(value: unknown): TelegramExport[] {
  if (!value || typeof value !== "object") return [];
  const found: TelegramExport[] = [];
  for (const key of ["personal_chats", "private_groups", "public_groups", "chats"]) {
    const section = (value as Record<string, unknown>)[key];
    if (!section || typeof section !== "object") continue;
    const list = (section as Record<string, unknown>).list;
    if (!Array.isArray(list)) continue;
    found.push(...list.filter(isTelegramConversation));
  }
  return found;
}

export function parseTelegramConversations(value: unknown): ParsedTelegramConversation[] {
  if (isTelegramConversation(value)) return [parseTelegramExport(value)];
  const conversations = readConversationLists(value).map(parseTelegramExport);
  if (conversations.length === 0) {
    throw new Error("No conversations were found in this Telegram JSON export.");
  }
  return conversations;
}
