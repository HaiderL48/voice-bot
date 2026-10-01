export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type RequestOptions = RequestInit & { token?: string | null };

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const { token, ...init } = options;

  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (response.status === 204) return undefined as T;

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && payload !== null && "error" in payload
        ? String((payload as { error: unknown }).error)
        : "Request failed";
    throw new ApiError(response.status, message);
  }

  return payload as T;
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  organizationId: string;
  organizationName: string;
};

export type Agent = {
  id: string;
  name: string;
  greeting: string;
  systemPrompt: string;
  knowledge: string;
  language: string;
  greetingB: string;
  voiceId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type VoiceOption = {
  voiceId: string;
  name: string;
  labels: string;
};

export type CallSummary = {
  id: string;
  agentId: string;
  agentName: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  preview: string;
};

export type TranscriptMessage = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
};

export type CallDetail = Omit<CallSummary, "preview"> & {
  summary: string;
  tags: string;
  intent: string;
  transferTarget: string;
  recordingStatus: string;
  recordingUrl: string;
  channel: string;
  callerPhone: string;
  greetingVariant: string;
  messages: TranscriptMessage[];
};

export type DeskRecord = {
  id: string;
  kind: string;
  title: string;
  status: string;
  name: string;
  phone: string;
  email: string;
  detail: string;
  startsAt: string | null;
  endsAt: string | null;
  score: string;
  amount: string;
  createdAt: string;
};

export type Office = {
  organization: {
    name: string;
    timezone: string;
    industry: string;
    hours: string;
    transferPhone: string;
    emergencyPhone: string;
    afterHoursGreeting: string;
    offers: string;
    competitorNotes: string;
    escalation: string;
  };
  faqs: Array<{ id: string; question: string; answer: string }>;
  documents: Array<{ id: string; title: string; body: string }>;
  resources: Array<{ id: string; name: string; kind: string; notes: string }>;
};

export type TurnResult = {
  userText: string;
  assistantText: string;
  audioBase64: string;
  mime: string;
};

export function callSocketUrl(callId: string, token: string) {
  const base = API_URL.replace(/^http/, "ws");
  return `${base}/ws/calls/${callId}?token=${encodeURIComponent(token)}`;
}
