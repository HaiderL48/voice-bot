import { describe, expect, it } from "vitest";
import { joinStreamDelta, pullSpeakable } from "./speech";

describe("joinStreamDelta", () => {
  it("keeps a space between streamed words", () => {
    expect(joinStreamDelta("I", "do not have the hours.")).toBe(" do not have the hours.");
  });
});

describe("pullSpeakable", () => {
  it("releases a finished sentence and keeps the rest", () => {
    const result = pullSpeakable("We open at nine. Would you", false);
    expect(result.ready).toEqual(["We open at nine."]);
    expect(result.rest).toBe("Would you");
  });

  it("flushes the remainder when the reply is finished", () => {
    const result = pullSpeakable("Would you like to book", true);
    expect(result.ready).toEqual(["Would you like to book"]);
    expect(result.rest).toBe("");
  });
});
