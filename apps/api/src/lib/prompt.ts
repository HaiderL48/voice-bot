export function buildSystemPrompt(input: {
  agentName: string;
  businessName: string;
  persona: string;
  knowledge: string;
  language: string;
  office?: string;
  speaker?: "woman" | "man";
}): string {
  const spokenName =
    ({ gu: "Gujarati", hi: "Hindi", en: "English", ta: "Tamil", te: "Telugu" } as Record<string, string>)[
      input.language
    ] ?? input.language;
  const languageLine =
    input.language === "auto"
      ? "Reply in the same language the caller is using. Gujarati, Hindi, English, Tamil, and Telugu are all fine."
      : input.language === "en"
        ? "You must speak only English."
        : `You must speak only ${spokenName}, in ${spokenName} script. Never answer in English or any other language, even when the caller, the greeting, the notes, or a tool result are in English. Translate every fact into ${spokenName} before you say it.`;

  const speakerLine = input.speaker
    ? input.speaker === "woman"
      ? "You are a woman. Always use feminine first-person forms. In Hindi say सकती हूँ, not सकता हूँ. In Gujarati say આવી છું, not આવ્યો છું."
      : "You are a man. Always use masculine first-person forms."
    : "";

  return [
    languageLine,
    speakerLine,
    `You are ${input.agentName}, the phone receptionist for ${input.businessName}.`,
    input.persona.trim(),
    input.knowledge.trim()
      ? `Business facts:\n${input.knowledge.trim()}`
      : input.office
        ? ""
        : "Business facts:\nNone provided. You do not know the hours, prices, address, or services.",
    "This is a live phone call. Speak in one or two short spoken sentences. No markdown, bullets, emojis, or stage directions. Ask at most one question. Only state hours, prices, addresses, services, and availability that appear in the business facts. If a fact is not listed, say you do not have it and offer to take the caller's name and number. Never invent those details.",
    "If the caller's words are unclear or partly garbled, do not say you did not understand. Make your best guess at their intent and confirm it in one short sentence. If you truly cannot tell, ask them to repeat that. Never ask the same question more than twice. After two failed attempts, offer to take a message for a person.",
    "You answer around the clock. If the office is closed, say so and offer a callback or the next opening.",
    input.office ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

const SCRIPTS: Record<string, RegExp> = {
  gu: /[\u0A80-\u0AFF]/,
  hi: /[\u0900-\u097F]/,
  ta: /[\u0B80-\u0BFF]/,
  te: /[\u0C00-\u0C7F]/,
};

export function textMatchesLanguage(text: string, language: string) {
  const script = SCRIPTS[language];
  if (!script) return true;
  return script.test(text);
}

export function speechLanguage(requested: string | undefined, text: string) {
  if (requested && requested !== "auto") return requested;
  const matched = (Object.entries(SCRIPTS) as Array<[string, RegExp]>).find(([, pattern]) => pattern.test(text));
  return matched?.[0];
}

export function speakerFromLabels(labels?: Record<string, string>) {
  const gender = (labels?.gender ?? "").toLowerCase();
  if (gender.startsWith("f") || gender === "woman") return "woman" as const;
  if (gender.startsWith("m") || gender === "man") return "man" as const;
  return undefined;
}

export function missedLine(language: string) {
  const lines: Record<string, string> = {
    gu: "માફ કરશો, સ્પષ્ટ સંભળાયું નહીં. કૃપા કરીને ફરી કહો.",
    hi: "माफ़ कीजिए, साफ़ सुनाई नहीं दिया। कृपया फिर से कहिए।",
    ta: "மன்னிக்கவும், தெளிவாகக் கேட்கவில்லை. தயவுசெய்து மீண்டும் சொல்லுங்கள்.",
    te: "క్షమించండి, స్పష్టంగా వినపడలేదు. దయచేసి మళ్లీ చెప్పండి.",
  };
  return lines[language] ?? "Sorry, I didn't catch that. Could you say that one more time?";
}

export function extractGeminiText(payload: unknown): string {
  const data = payload as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    }>;
  };
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((part) => part.text && !part.thought)
    .map((part) => part.text)
    .join("")
    .trim();
}
