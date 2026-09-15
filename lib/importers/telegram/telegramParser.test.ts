import { describe, expect, it } from "vitest";
import { parseTelegramConversations, parseTelegramExport } from "./telegramParser";

describe("Telegram parser", () => {
  it("normalizes text entities, replies, media and participants", () => {
    const result = parseTelegramExport({
      name: "Maya",
      id: 42,
      messages: [
        { id: 1, type: "message", date: "2026-09-13T18:00:00+09:00", from: "Maya", from_id: "user1", text: [{ type: "plain", text: "hello\nthere" }] },
        { id: 2, type: "message", date: "2026-09-13T18:01:00+09:00", from: "Nori", from_id: "user2", text: "Hi", reply_to_message_id: 1, media_type: "photo" },
      ],
    });
    expect(result.conversationName).toBe("Maya");
    expect(result.participants).toEqual(["Maya", "Nori"]);
    expect(result.messages[0].text).toBe("hello\nthere");
    expect(result.messages[1]).toMatchObject({ replyToMessageId: "1", mediaType: "photo" });
  });

  it("rejects malformed exports", () => {
    expect(() => parseTelegramExport({ nope: [] })).toThrow(/Telegram JSON export/);
  });

  it("finds conversations in a full Telegram data export", () => {
    const conversations = parseTelegramConversations({
      personal_chats: {
        list: [
          { name: "Maya", id: 42, messages: [{ id: 1, date: "2026-09-13T18:00:00+09:00", from: "Maya", text: "hello" }] },
          { name: "Alex", id: 43, messages: [{ id: 2, date: "2026-09-14T10:00:00Z", from: "Alex", text: "hey" }] },
        ],
      },
    });
    expect(conversations.map((conversation) => conversation.conversationName)).toEqual(["Maya", "Alex"]);
  });
});
