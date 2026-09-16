import { describe, expect, it } from "vitest";
import { parseTelegramMarkdown } from "./telegramMarkdownParser";

describe("Telegram Markdown parser", () => {
  it("parses Telegram-style multiline messages", () => {
    const result = parseTelegramMarkdown(`
# Telegram chat

Jamie, [2026-09-16 18:30]
Hey, are you free tomorrow?
This is a second line.

Nori, [2026-09-16 18:32]
Yes!
`);
    expect(result.participants).toEqual(["Jamie", "Nori"]);
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].text).toBe("Hey, are you free tomorrow?\nThis is a second line.");
  });

  it("parses bracket-first Markdown messages", () => {
    const result = parseTelegramMarkdown("[2026-09-16T18:30:00Z] **Jamie**: Dinner at eight");
    expect(result.messages[0]).toMatchObject({ senderName: "Jamie", text: "Dinner at eight" });
  });

  it("rejects Markdown without timestamped message headers", () => {
    expect(() => parseTelegramMarkdown("Just some notes without dates")).toThrow(/No timestamped messages/);
  });

  it("parses time-only headers with escaped bold names and Telegram IDs", () => {
    const result = parseTelegramMarkdown(String.raw`**\*\*You\*\*** (09:43, id 107613): hackathon

**\*\*kamilla\*\*** (10:25, id 107620): U back

**\*\*kamilla\*\*** (10:25, id 107621): ?`);
    expect(result.participants).toEqual(["You", "kamilla"]);
    expect(result.messages).toHaveLength(3);
    expect(result.messages[0]).toMatchObject({ id: "107613", senderName: "You", text: "hackathon", timestamp: "09:43" });
    expect(result.messages[0].metadata).toMatchObject({ originalMessageId: "107613", dateUnknown: true });
  });

  it("applies dated sections and reads the conversation title", () => {
    const result = parseTelegramMarkdown(String.raw`**# Conversation with kamilla**

**## 2026-07-27 (Monday)**

**\*\*kamilla\*\*** (04:23, id 107596): [service message: MessageActionPhoneCall]

**\*\*You\*\*** (09:43, id 107613): hackathon

**## 2026-07-28 (Tuesday)**

**\*\*kamilla\*\*** (01:53, id 107701): hello`);
    expect(result.conversationName).toBe("kamilla");
    expect(result.messages[0]).toMatchObject({
      id: "107596",
      timestamp: "2026-07-27T04:23:00",
      mediaType: "service",
    });
    expect(result.messages[2].timestamp).toBe("2026-07-28T01:53:00");
    expect(result.messages[2].metadata).toMatchObject({ dateUnknown: false, timezoneUnknown: true });
  });
});
