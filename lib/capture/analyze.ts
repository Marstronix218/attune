import { randomUUID } from "crypto";
import type { AnalysisResult, CaptureCandidate, RelationshipSettings } from "../domain";
import { resolveRelativeDate } from "../time";

type AnalyzeOptions = {
  now?: Date;
  settings: RelationshipSettings;
};

function candidate(
  input: string,
  partial: Omit<CaptureCandidate, "id" | "sourceText" | "status">,
): CaptureCandidate {
  return {
    id: randomUUID(),
    sourceText: input,
    status: "pending",
    ...partial,
  };
}

export function analyzeCaptureDeterministically(
  input: string,
  { now = new Date(), settings }: AnalyzeOptions,
): AnalysisResult {
  const text = input.trim();
  const lower = text.toLowerCase();
  const candidates: CaptureCandidate[] = [];
  const relativeDate = resolveRelativeDate(text, now, settings.partnerTimezone);

  if (/\b(call|called|conversation|talked|spoke)\b/.test(lower)) {
    candidates.push(
      candidate(text, {
        destination: "interaction",
        title: "Conversation together",
        detail: text,
        classification: "fact",
        confidence: 0.94,
        date: now.toISOString(),
        participant: "both",
        reasoning: "You described a conversation that already happened.",
      }),
    );
  }

  if (relativeDate && /\b(hang out|going|visit|trip|exam|appointment|class|party|dinner|lunch|meet)\b/.test(lower)) {
    const topic = lower.includes("exam") ? "Exam" : lower.includes("hang out") ? "Plans with friends" : "Upcoming plan";
    candidates.push(
      candidate(text, {
        destination: "calendar",
        title: topic,
        detail: text,
        classification: "fact",
        confidence: 0.9,
        date: relativeDate,
        participant: "partner",
        reasoning: `You mentioned a dated plan. “Tomorrow” was resolved in ${settings.partnerTimezone}.`,
      }),
    );
  }

  if (/\b(remind me|don't forget|remember to)\b/.test(lower)) {
    candidates.push(
      candidate(text, {
        destination: "reminder",
        title: "Follow up thoughtfully",
        detail: text.replace(/^(remind me|remember to)\s*/i, ""),
        classification: "fact",
        confidence: 0.93,
        date: relativeDate,
        participant: "user",
        reasoning: "You explicitly asked to remember an action.",
      }),
    );
  } else if (/\b(i need to|i should|buy|send|check in|wish her|wish them)\b/.test(lower)) {
    candidates.push(
      candidate(text, {
        destination: "task",
        title: "Thoughtful follow-up",
        detail: text,
        classification: "fact",
        confidence: 0.82,
        date: relativeDate,
        participant: "user",
        reasoning: "This sounds like an action you may want to take.",
      }),
    );
  }

  if (/\b(likes?|loves?|prefers?|dislikes?|hates?|usually|always|needs? space|boundary|gets? stressed)\b/.test(lower)) {
    const inferred = /\b(usually|seems|maybe|might|gets? stressed)\b/.test(lower);
    candidates.push(
      candidate(text, {
        destination: "memory",
        title: inferred ? "Possible relationship pattern" : "Partner preference",
        detail: text,
        classification: inferred ? "inference" : "fact",
        confidence: inferred ? 0.68 : 0.88,
        date: null,
        participant: "partner",
        reasoning: inferred
          ? "This may be a recurring pattern, but it should stay labeled as an inference."
          : "You described something your partner explicitly likes or prefers.",
      }),
    );
  }

  if (candidates.length === 0) {
    candidates.push(
      candidate(text, {
        destination: "memory",
        title: "Conversation note",
        detail: text,
        classification: "fact",
        confidence: 0.72,
        date: null,
        participant: "both",
        reasoning: "This is useful relationship context, but no more specific destination was clear.",
      }),
    );
  }

  return {
    summary: candidates.length === 1
      ? "I found one thing worth organizing."
      : `I found ${candidates.length} things and separated them so you can review each one.`,
    candidates,
  };
}
