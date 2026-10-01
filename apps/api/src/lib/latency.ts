export type LatencyMarks = {
  callId: string;
  speechEndMs: number;
  sttFinalMs: number;
  llmFirstTokenMs: number;
  llmSentenceCompleteMs: number;
  ttsFirstChunkMs: number;
};

export type CallLatency = LatencyMarks & {
  sttLatency: number;
  llmLatency: number;
  ttsLatency: number;
  totalLatency: number;
};

export type LatencySeverity = "ok" | "warning" | "alert";

export function measureLatency(marks: LatencyMarks): CallLatency {
  return {
    ...marks,
    sttLatency: marks.sttFinalMs - marks.speechEndMs,
    llmLatency: marks.llmSentenceCompleteMs - marks.sttFinalMs,
    ttsLatency: marks.ttsFirstChunkMs - marks.llmSentenceCompleteMs,
    totalLatency: marks.ttsFirstChunkMs - marks.speechEndMs,
  };
}

export function latencySeverity(latency: CallLatency): LatencySeverity {
  if (latency.totalLatency > 1500) return "alert";
  if (latency.totalLatency > 1000 || latency.sttLatency > 200 || latency.ttsLatency > 150) return "warning";
  return "ok";
}
