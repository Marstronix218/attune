export function resolveRelativeDate(
  phrase: string,
  now: Date,
  timezone: string,
): string | null {
  const normalized = phrase.toLowerCase();
  if (!normalized.includes("tomorrow") && !normalized.includes("today")) return null;

  const zoned = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
  if (normalized.includes("tomorrow")) zoned.setDate(zoned.getDate() + 1);
  return `${zoned.getFullYear()}-${String(zoned.getMonth() + 1).padStart(2, "0")}-${String(zoned.getDate()).padStart(2, "0")}`;
}

export function formatLocalTime(timezone: string, now = new Date()) {
  return {
    time: new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
    }).format(now),
    date: new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(now),
  };
}

export function getTimeAwareSuggestion(partnerTimezone: string, now = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: partnerTimezone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );

  if (hour < 8 || hour >= 23) {
    return {
      title: "A message may be gentler right now",
      body: "It’s outside a typical daytime window for them. Consider sending something they can read when they’re awake instead of calling.",
      tone: "quiet" as const,
    };
  }
  if (hour >= 9 && hour < 18) {
    return {
      title: "They may be in the middle of their day",
      body: "A quick message first could help you find a good time to call without interrupting plans.",
      tone: "neutral" as const,
    };
  }
  return {
    title: "This could be a comfortable time to connect",
    body: "It’s evening in their time zone. Their actual schedule still matters, so checking first is a thoughtful option.",
    tone: "warm" as const,
  };
}
