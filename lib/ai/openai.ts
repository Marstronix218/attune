import { randomUUID } from "crypto";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod/v4";
import { analysisResultSchema } from "@/lib/domain";
import type { AIProvider, CaptureAnalysisRequest } from "./provider";

const modelCandidateSchema = z.object({
  destination: z.enum(["memory", "calendar", "task", "reminder", "interaction"]),
  title: z.string(),
  detail: z.string(),
  classification: z.enum(["fact", "inference"]),
  confidence: z.number().min(0).max(1),
  date: z.string().nullable(),
  participant: z.enum(["user", "partner", "both"]),
  reasoning: z.string(),
});

const modelResultSchema = z.object({
  summary: z.string(),
  candidates: z.array(modelCandidateSchema).max(6),
});

export class OpenAIProvider implements AIProvider {
  private readonly client: OpenAI;

  constructor(apiKey = process.env.OPENAI_API_KEY) {
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
    this.client = new OpenAI({ apiKey });
  }

  async analyzeCapture({ text, settings, capturedAt }: CaptureAnalysisRequest) {
    const response = await this.client.responses.parse({
      model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
      store: false,
      instructions: [
        "You organize private relationship notes into distinct candidate records.",
        "Never claim to know a person's internal state. Label interpretations as inference.",
        "Never invent a date or time. Resolve relative dates using the named person's IANA timezone and capture timestamp.",
        "One note may produce multiple destinations when each record adds distinct value.",
        "Only propose a task or reminder when the user explicitly expresses an action or reminder intent.",
        "Use careful neutral language, preserve the user's meaning, and do not assign blame.",
      ].join(" "),
      input: JSON.stringify({
        note: text,
        capturedAtUtc: capturedAt.toISOString(),
        user: { name: settings.userName, timezone: settings.userTimezone },
        partner: { name: settings.partnerName, timezone: settings.partnerTimezone },
      }),
      text: { format: zodTextFormat(modelResultSchema, "attune_capture_analysis") },
    });

    if (!response.output_parsed) throw new Error("The model did not return a usable analysis.");
    return analysisResultSchema.parse({
      ...response.output_parsed,
      candidates: response.output_parsed.candidates.map((item) => ({
        ...item,
        id: randomUUID(),
        sourceText: text,
        status: "pending" as const,
      })),
    });
  }
}
