import { describe, expect, it } from "vitest";
import {
  bucketCalls,
  officeStatus,
  parseCallWrap,
  parseHours,
  parseWhen,
  pickGreeting,
  rankText,
  scoreLead,
  triageUrgency,
} from "./office";

describe("office hours", () => {
  it("treats Sunday as closed and a Thursday afternoon as open", () => {
    const hours = parseHours("");
    const open = officeStatus(new Date("2026-10-01T10:30:00.000Z"), "Asia/Kolkata", hours);
    expect(open.open).toBe(true);
    const closed = officeStatus(new Date("2026-10-04T06:00:00.000Z"), "Asia/Kolkata", hours);
    expect(closed.open).toBe(false);
  });

  it("parses an India-local time without a zone", () => {
    const parsed = parseWhen("2026-10-02T16:00");
    expect(parsed?.toISOString()).toBe("2026-10-02T10:30:00.000Z");
  });
});

describe("call features", () => {
  it("splits greetings and scores leads", () => {
    expect(pickGreeting("a", "Hello", "").variant).toBe("a");
    expect(pickGreeting("b", "Hello", "Hi").variant).toBe("a");
    expect(pickGreeting("a", "Hello", "Hi").variant).toBe("b");
    expect(scoreLead({ budget: "50000", timeline: "this week", requirements: "implant" })).toBe("hot");
    expect(scoreLead({ requirements: "cleaning" })).toBe("warm");
    expect(scoreLead({})).toBe("cold");
  });

  it("flags emergencies and ranks knowledge", () => {
    expect(triageUrgency("I have chest pain")).toBe("emergency");
    expect(triageUrgency("a mild fever")).toBe("moderate");
    const ranked = rankText("parking", [
      { title: "Wi-Fi", body: "Password is on the card" },
      { title: "Parking", body: "Free parking behind the building" },
    ]);
    expect(ranked[0]?.title).toBe("Parking");
  });

  it("reads tags and a two-line summary", () => {
    const wrap = parseCallWrap("booking, faq\nBooked a cleaning.\nCaller will arrive at 4.");
    expect(wrap.intent).toBe("booking");
    expect(wrap.summary).toContain("cleaning");
  });

  it("buckets calls into a week grid", () => {
    const grid = bucketCalls([new Date("2026-10-01T10:30:00.000Z")], "Asia/Kolkata");
    expect(grid[4]?.[16]).toBe(1);
  });
});
