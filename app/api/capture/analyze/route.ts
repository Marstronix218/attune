import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeCaptureDeterministically } from "@/lib/capture/analyze";
import { OpenAIProvider } from "@/lib/ai/openai";

const requestSchema = z.object({
  text: z.string().trim().min(1).max(8_000),
  settings: z.object({
    userName: z.string().min(1),
    partnerName: z.string().min(1),
    userTimezone: z.string().min(1),
    partnerTimezone: z.string().min(1),
  }),
});

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Please enter a shorter note and try again." }, { status: 400 });
    }

    const result = process.env.OPENAI_API_KEY
      ? await new OpenAIProvider().analyzeCapture({
        text: parsed.data.text,
        settings: parsed.data.settings,
        capturedAt: new Date(),
      })
      : analyzeCaptureDeterministically(parsed.data.text, { settings: parsed.data.settings });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Attune couldn’t organize that note yet." }, { status: 500 });
  }
}
