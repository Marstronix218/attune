import { z } from "zod";

export const destinationSchema = z.enum([
  "memory",
  "calendar",
  "task",
  "reminder",
  "interaction",
]);

export const candidateSchema = z.object({
  id: z.string(),
  destination: destinationSchema,
  title: z.string().min(1),
  detail: z.string().min(1),
  classification: z.enum(["fact", "inference"]),
  confidence: z.number().min(0).max(1),
  date: z.string().nullable(),
  participant: z.enum(["user", "partner", "both"]).default("partner"),
  sourceText: z.string(),
  status: z.enum(["pending", "approved", "rejected"]).default("pending"),
  reasoning: z.string(),
});

export const analysisResultSchema = z.object({
  summary: z.string(),
  candidates: z.array(candidateSchema),
});

export type Destination = z.infer<typeof destinationSchema>;
export type CaptureCandidate = z.infer<typeof candidateSchema>;
export type AnalysisResult = z.infer<typeof analysisResultSchema>;

export type SavedItem = CaptureCandidate & {
  savedAt: string;
};

export type RelationshipSettings = {
  userName: string;
  partnerName: string;
  userTimezone: string;
  partnerTimezone: string;
};
