export const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export type Day = (typeof DAYS)[number];
export type WeeklyHours = Record<Day, [string, string] | null>;

export const DEFAULT_HOURS: WeeklyHours = {
  sun: null,
  mon: ["09:00", "18:00"],
  tue: ["09:00", "18:00"],
  wed: ["09:00", "18:00"],
  thu: ["09:00", "18:00"],
  fri: ["09:00", "18:00"],
  sat: ["09:00", "18:00"],
};

const DAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function parseHours(raw: string): WeeklyHours {
  try {
    const parsed = JSON.parse(raw) as Partial<Record<Day, [string, string] | null>>;
    const hours: WeeklyHours = { ...DEFAULT_HOURS };
    for (const day of DAYS) {
      const value = parsed[day];
      if (value === null) hours[day] = null;
      else if (Array.isArray(value) && value.length === 2 && value[0] && value[1]) {
        hours[day] = [String(value[0]), String(value[1])];
      }
    }
    return hours;
  } catch {
    return { ...DEFAULT_HOURS };
  }
}

function minutes(value: string) {
  const [hour, minute] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}

function zonedParts(now: Date, timezone: string) {
  const zone = timezone || "Asia/Kolkata";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
  }
}

export function officeStatus(now: Date, timezone: string, hours: WeeklyHours) {
  const parts = zonedParts(now, timezone);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  const day = DAYS[DAY_INDEX[weekday] ?? 1] ?? "mon";
  const span = hours[day];
  const nowMinutes = hour * 60 + minute;
  const open = Boolean(span && nowMinutes >= minutes(span[0]) && nowMinutes < minutes(span[1]));
  const label = DAYS.map((name) => `${name} ${hours[name] ? hours[name].join("-") : "closed"}`).join(", ");
  return { open, day, label: `${label} (${timezone || "Asia/Kolkata"})` };
}

export function parseWhen(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const hasZone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  const parsed = new Date(hasZone ? trimmed : `${trimmed}+05:30`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function pickGreeting(callId: string, primary: string, alternate: string) {
  if (!alternate.trim()) return { text: primary, variant: "a" as const };
  const hash = [...callId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return hash % 2 === 0
    ? { text: primary, variant: "a" as const }
    : { text: alternate, variant: "b" as const };
}

export function bucketCalls(stamps: Date[], timezone: string) {
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const stamp of stamps) {
    const parts = zonedParts(stamp, timezone);
    const weekday = parts.find((part) => part.type === "weekday")?.value ?? "Mon";
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
    const day = DAY_INDEX[weekday] ?? 1;
    const row = grid[day];
    if (row && hour >= 0 && hour < 24) row[hour] = (row[hour] ?? 0) + 1;
  }
  return grid;
}

export function scoreLead(input: { budget?: string; timeline?: string; requirements?: string }) {
  const timeline = (input.timeline ?? "").toLowerCase();
  const soon = /today|tomorrow|this week|urgent|\b([1-9]|[12]\d)\s*day/.test(timeline);
  const hasBudget = Boolean(input.budget?.trim() && input.budget.toLowerCase() !== "unknown");
  const hasNeed = Boolean(input.requirements?.trim());
  if (hasBudget && soon) return "hot";
  if (hasBudget || soon || hasNeed) return "warm";
  return "cold";
}

const EMERGENCY = [
  /chest pain/,
  /can(?:no|')t breathe/,
  /not breathing/,
  /unconscious/,
  /heavy bleeding/,
  /stroke/,
  /suicid/,
  /heart attack/,
];

export function triageUrgency(text: string) {
  const normalized = text.toLowerCase();
  if (EMERGENCY.some((pattern) => pattern.test(normalized))) return "emergency";
  if (/fever|vomit|injury|pain|bleeding|dizzy/.test(normalized)) return "moderate";
  return "mild";
}

export function rankText<T extends { title: string; body: string }>(query: string, items: T[]) {
  const terms = query
    .toLowerCase()
    .split(/\W+/)
    .filter((term) => term.length > 2);
  if (terms.length === 0) return items.slice(0, 3);
  return items
    .map((item) => {
      const haystack = `${item.title} ${item.body}`.toLowerCase();
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      return { item, score };
    })
    .filter((row) => row.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map((row) => row.item);
}

export function parseCallWrap(text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const tags = (lines[0] ?? "").replace(/^tags:\s*/i, "").slice(0, 200);
  const summary = (lines.slice(1).join(" ") || text).slice(0, 500);
  return { tags, summary, intent: tags.split(",")[0]?.trim().slice(0, 80) ?? "" };
}

export function matchEscalation(text: string, raw: string) {
  let rules: Array<{ phrase?: string; target?: string }> = [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) rules = parsed as Array<{ phrase?: string; target?: string }>;
  } catch {
    rules = [];
  }
  const normalized = text.toLowerCase();
  return (
    rules.find((rule) => rule.phrase && rule.target && normalized.includes(rule.phrase.toLowerCase())) ?? null
  );
}
