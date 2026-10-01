export type LineAction =
  | { type: "transfer"; callId: string; target: string; context: string }
  | { type: "sms"; to: string; body: string }
  | { type: "email"; to: string; body: string }
  | { type: "outbound"; to: string; purpose: string }
  | { type: "payment"; to: string; amount: string };

export type LineResult = {
  status: "queued" | "blocked_dnd" | "awaiting_provider";
  detail: string;
};

export function queueForPhoneLine(action: LineAction): LineResult {
  if (action.type === "outbound") {
    return {
      status: "blocked_dnd",
      detail: "Outbound call is saved. It will dial only after a TRAI DND check clears this number.",
    };
  }
  if (action.type === "payment") {
    return {
      status: "awaiting_provider",
      detail: "Payment request is saved. A UPI or card link is sent once a payment provider is connected.",
    };
  }
  if (action.type === "transfer") {
    return {
      status: "queued",
      detail: `Transfer to ${action.target} is queued with the transcript. A phone line will ring them.`,
    };
  }
  return {
    status: "queued",
    detail: "Message is queued. It sends when SMS or email is connected to the phone line.",
  };
}
