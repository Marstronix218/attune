import { describe, expect, it } from "vitest";
import { formatLocalTime, resolveRelativeDate } from "./time";

describe("timezone handling", () => {
  it("formats DST-aware times in Los Angeles and Tokyo", () => {
    const winter = new Date("2026-01-15T12:00:00.000Z");
    const summer = new Date("2026-07-15T12:00:00.000Z");
    expect(formatLocalTime("America/Los_Angeles", winter).time).toBe("4:00 AM");
    expect(formatLocalTime("America/Los_Angeles", summer).time).toBe("5:00 AM");
    expect(formatLocalTime("Asia/Tokyo", winter).time).toBe("9:00 PM");
    expect(formatLocalTime("Asia/Tokyo", summer).time).toBe("9:00 PM");
  });

  it("resolves tomorrow in the partner timezone across the date line", () => {
    expect(resolveRelativeDate("tomorrow", new Date("2026-09-16T06:30:00Z"), "Asia/Tokyo")).toBe("2026-09-17");
  });
});
