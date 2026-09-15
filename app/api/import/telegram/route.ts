import { NextResponse } from "next/server";
import { parseTelegramConversations } from "@/lib/importers/telegram/telegramParser";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose a Telegram JSON export." }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".json")) {
      return NextResponse.json({ error: "Attune currently supports Telegram JSON exports." }, { status: 415 });
    }
    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: "For this MVP, imports are limited to 25 MB." }, { status: 413 });
    }

    const json: unknown = JSON.parse(await file.text());
    const conversations = parseTelegramConversations(json).map((conversation) => ({
      id: conversation.conversationId,
      conversationName: conversation.conversationName,
      messageCount: conversation.messages.length,
      participants: conversation.participants,
      dateRange: {
        first: conversation.messages.at(0)?.timestamp ?? null,
        last: conversation.messages.at(-1)?.timestamp ?? null,
      },
      preview: conversation.messages.slice(0, 8),
    }));
    return NextResponse.json({
      fileName: file.name,
      conversations,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Attune could not read this export.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
