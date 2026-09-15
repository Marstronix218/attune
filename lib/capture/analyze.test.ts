import { describe, expect, it } from "vitest";
import { analyzeCaptureDeterministically } from "./analyze";

const settings = {
  userName: "Nori",
  partnerName: "Maya",
  userTimezone: "America/Los_Angeles",
  partnerTimezone: "Asia/Tokyo",
};

describe("capture routing", () => {
  it("fans a call note into interaction and dated calendar candidates", () => {
    const result = analyzeCaptureDeterministically(
      "We had a call about how she's going to hang out with her friends tomorrow.",
      { settings, now: new Date("2026-09-16T06:30:00.000Z") },
    );
    expect(result.candidates.map((item) => item.destination)).toEqual(["interaction", "calendar"]);
    expect(result.candidates[1].date).toBe("2026-09-17");
    expect(result.candidates.every((item) => item.status === "pending")).toBe(true);
  });

  it("labels tentative patterns as inference", () => {
    const result = analyzeCaptureDeterministically("She usually gets stressed before exams.", { settings });
    expect(result.candidates[0]).toMatchObject({ destination: "memory", classification: "inference" });
  });

  it("only proposes a reminder from explicit reminder language", () => {
    const result = analyzeCaptureDeterministically("Remind me to wish her good luck tomorrow.", {
      settings,
      now: new Date("2026-01-10T12:00:00.000Z"),
    });
    expect(result.candidates.map((item) => item.destination)).toContain("reminder");
  });
});
