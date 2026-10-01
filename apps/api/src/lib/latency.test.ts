import { describe, expect, it } from "vitest";
import { latencySeverity, measureLatency } from "./latency";

const marks = {
  callId: "call-1",
  speechEndMs: 1000,
  sttFinalMs: 1080,
  llmFirstTokenMs: 1200,
  llmSentenceCompleteMs: 1300,
  ttsFirstChunkMs: 1380,
};

describe("measureLatency", () => {
  it("computes stage and total delays from the stage timestamps", () => {
    const latency = measureLatency(marks);
    expect(latency.sttLatency).toBe(80);
    expect(latency.llmLatency).toBe(220);
    expect(latency.ttsLatency).toBe(80);
    expect(latency.totalLatency).toBe(380);
    expect(latencySeverity(latency)).toBe("ok");
  });

  it("warns above one second and alerts above one and a half", () => {
    expect(latencySeverity(measureLatency({ ...marks, ttsFirstChunkMs: 2100 }))).toBe("warning");
    expect(latencySeverity(measureLatency({ ...marks, ttsFirstChunkMs: 2600 }))).toBe("alert");
  });

  it("warns when speech-to-text or speech synthesis is slow", () => {
    expect(latencySeverity(measureLatency({ ...marks, sttFinalMs: 1300, llmSentenceCompleteMs: 1400, ttsFirstChunkMs: 1480 }))).toBe(
      "warning",
    );
    expect(latencySeverity(measureLatency({ ...marks, ttsFirstChunkMs: 1500 }))).toBe("warning");
  });
});
