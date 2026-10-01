import { describe, expect, it } from "vitest";
import { buildSystemPrompt, extractGeminiText, speakerFromLabels, speechLanguage, textMatchesLanguage } from "./prompt";

describe("buildSystemPrompt", () => {
  it("includes the persona, knowledge, and spoken-reply rules", () => {
    const prompt = buildSystemPrompt({
      agentName: "Maya",
      businessName: "North Clinic",
      persona: "Calm and precise.",
      knowledge: "Open 9 to 5.",
      language: "en",
    });

    expect(prompt).toContain("Maya");
    expect(prompt).toContain("North Clinic");
    expect(prompt).toContain("Calm and precise.");
    expect(prompt).toContain("Open 9 to 5.");
    expect(prompt).toContain("No markdown");
    expect(prompt).toContain("Never invent");
    expect(prompt).toContain("best guess");
    expect(prompt).toContain("repeat that");
    expect(prompt).toContain("speak only English");
  });

  it("requires Gujarati script when Gujarati is selected", () => {
    const prompt = buildSystemPrompt({
      agentName: "Maya",
      businessName: "North Clinic",
      persona: "Warm.",
      knowledge: "Open 9 to 5.",
      language: "gu",
    });

    expect(prompt.startsWith("You must speak only Gujarati")).toBe(true);
    expect(prompt).toContain("Gujarati script");
  });

  it("tells a woman voice to use feminine Gujarati", () => {
    const prompt = buildSystemPrompt({
      agentName: "Maya",
      businessName: "North Clinic",
      persona: "Warm.",
      knowledge: "",
      language: "gu",
      speaker: "woman",
    });

    expect(prompt).toContain("You are a woman");
    expect(prompt).toContain("આવી છું");
  });

  it("mirrors the caller language when set to auto", () => {
    const prompt = buildSystemPrompt({
      agentName: "Maya",
      businessName: "North Clinic",
      persona: "Warm.",
      knowledge: "",
      language: "auto",
    });

    expect(prompt).toContain("same language");
    expect(prompt).toContain("None provided");
  });
});

describe("extractGeminiText", () => {
  it("drops thought parts and keeps spoken text", () => {
    const text = extractGeminiText({
      candidates: [
        {
          content: {
            parts: [
              { thought: true, text: "planning" },
              { text: "We open at nine." },
            ],
          },
        },
      ],
    });

    expect(text).toBe("We open at nine.");
  });
});

describe("speech language", () => {
  it("keeps a selected language and detects Gujarati script", () => {
    expect(textMatchesLanguage("નમસ્તે", "gu")).toBe(true);
    expect(textMatchesLanguage("Hello", "gu")).toBe(false);
    expect(speechLanguage("gu", "Hello")).toBe("gu");
    expect(speechLanguage("auto", "નમસ્તે")).toBe("gu");
    expect(speakerFromLabels({ gender: "female" })).toBe("woman");
    expect(speakerFromLabels({ gender: "male" })).toBe("man");
  });
});
