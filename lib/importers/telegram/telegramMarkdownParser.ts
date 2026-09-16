import type { NormalizedMessage } from "./telegramTypes";
import type { ParsedTelegramConversation } from "./telegramParser";

type PendingMessage = {
  sender: string;
  timestamp: string;
  messageId: string | null;
  timezoneUnknown: boolean;
  lines: string[];
};

export function parseTelegramMarkdown(markdown: string): ParsedTelegramConversation {
  const messages: NormalizedMessage[] = [];
  let pending: PendingMessage | null = null;
  let currentDate: string | null = null;
  let conversationTitle: string | null = null;

  const flush = () => {
    if (!pending) return;
    const text = pending.lines.join("\n").trim();
    messages.push({
      id: pending.messageId ?? `md-${messages.length + 1}`,
      conversationId: "telegram-markdown",
      senderId: slug(pending.sender),
      senderName: pending.sender,
      text,
      timestamp: pending.timestamp,
      timestampUtc: toUtcOrOriginal(pending.timestamp),
      replyToMessageId: null,
      mediaType: /^\[service message:/i.test(text) ? "service" : null,
      metadata: {
        sourceFormat: "markdown",
        originalTimestamp: pending.timestamp,
        originalMessageId: pending.messageId,
        dateUnknown: /^\d{2}:\d{2}$/.test(pending.timestamp),
        timezoneUnknown: pending.timezoneUnknown,
      },
    });
    pending = null;
  };

  for (const rawLine of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trimEnd();
    const heading = cleanHeading(line);
    const conversationMatch = heading.match(/^#\s*Conversation with\s+(.+)$/i);
    if (conversationMatch) {
      conversationTitle = conversationMatch[1].trim();
      continue;
    }
    const dateMatch = heading.match(/^##\s*(\d{4}-\d{2}-\d{2})(?:\s+\([^)]+\))?$/);
    if (dateMatch) {
      flush();
      currentDate = dateMatch[1];
      continue;
    }
    const header = parseHeader(line);
    if (header) {
      flush();
      const isTimeOnly = /^\d{2}:\d{2}$/.test(header.timestamp);
      pending = {
        sender: header.sender,
        timestamp: isTimeOnly && currentDate ? `${currentDate}T${header.timestamp}:00` : header.timestamp,
        messageId: header.messageId,
        timezoneUnknown: isTimeOnly,
        lines: header.text ? [header.text] : [],
      };
    } else if (pending && !isDecorativeLine(line)) {
      pending.lines.push(line);
    }
  }
  flush();

  if (messages.length === 0) {
    throw new Error(
      "No timestamped messages were found. Attune supports headers such as Jamie, [2026-09-16 18:30] or **Jamie** (09:43, id 107613): message",
    );
  }
  const participants = [...new Set(messages.map((message) => message.senderName))];
  return {
    conversationId: "telegram-markdown",
    conversationName: conversationTitle || participants.filter((name) => name.toLowerCase() !== "you").at(0) || participants.slice(0, 2).join(" & ") || "Telegram conversation",
    messages,
    participants,
  };
}

function parseHeader(line: string): { sender: string; timestamp: string; messageId: string | null; text: string } | null {
  const idStyle = line.match(/^(.+?)\s*\((\d{1,2}:\d{2}),\s*id\s+(\d+)\):\s*(.*)$/i);
  if (idStyle) return parsed(cleanSender(idStyle[1]), idStyle[2], idStyle[4] ?? "", idStyle[3]);

  const telegramStyle = line.match(/^(.+?),\s*\[([^\]]+)]\s*(?::\s*(.*))?$/);
  if (telegramStyle) return parsed(telegramStyle[1], telegramStyle[2], telegramStyle[3] ?? "");

  const bracketFirst = line.match(/^\[([^\]]+)]\s*\*\*(.+?)\*\*\s*:?\s*(.*)$/)
    ?? line.match(/^\[([^\]]+)]\s*([^:]+):\s*(.*)$/);
  if (bracketFirst) return parsed(bracketFirst[2], bracketFirst[1], bracketFirst[3] ?? "");

  const boldFirst = line.match(/^\*\*(.+?)\*\*\s*(?:·|—|-)\s*([^:]+?\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\s*:?\s*(.*)$/i);
  if (boldFirst) return parsed(boldFirst[1], boldFirst[2], boldFirst[3] ?? "");
  return null;
}

function parsed(senderText: string, dateText: string, text: string, messageId: string | null = null) {
  const sender = cleanSender(senderText.replace(/^#+\s*/, ""));
  const timestamp = normalizeDate(dateText.trim());
  if (!sender || !timestamp) return null;
  return { sender, timestamp, messageId, text: text.trim() };
}

function normalizeDate(value: string): string | null {
  const timeOnly = value.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (timeOnly) return `${timeOnly[1].padStart(2, "0")}:${timeOnly[2]}`;
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString();

  const european = value.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})[, ]+([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!european) return null;
  const [, day, month, year, hour, minute] = european;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function cleanSender(value: string) {
  return value.replace(/\\/g, "").replace(/\*/g, "").trim();
}

function cleanHeading(value: string) {
  return value.replace(/\\\*/g, "*").replace(/^\*+|\*+$/g, "").trim();
}

function toUtcOrOriginal(value: string) {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "unknown";
}

function isDecorativeLine(line: string) {
  return /^\s*(?:---+|#+\s*(?:telegram|chat|conversation).*)\s*$/i.test(line);
}
