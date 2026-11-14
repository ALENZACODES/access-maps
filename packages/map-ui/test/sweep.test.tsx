import { planJourney } from "@access-maps/journey";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { demoPlanInput } from "../demo/fixture.js";
import { JourneyResult, mapCopy } from "../src/index.js";

/**
 * Day 24 endorsement sweep for the journey result and map copy. The engine's
 * own honesty scan (assertHonest) covers live, booked, and clinical words in
 * the plan. This adds endorsement, verified-data, guarantee, eligibility, and
 * AI wording, and runs on the rendered page in English and French.
 */
const RULES: Array<{ id: string; pattern: RegExp }> = [
  { id: "endorsement", pattern: /\b(endorsed by|approved by|in partnership with|official (partner|app)|partnered with)\b/i },
  { id: "endorsement-fr", pattern: /\b(approuvée? par|en partenariat avec|partenaire officiel|application officielle)\b/i },
  { id: "verified-claim", pattern: /(?<!un)(?<!not )\bverified (place|places|data|record|records|accessible|entrance|route|station)\b/i },
  { id: "verified-claim-fr", pattern: /(?<!non )\b(lieu|lieux|données|trajet|station)s? vérifiée?s?(?![a-zà-ÿ])/i },
  { id: "guarantee", pattern: /(?<!not )(?<!no )\b(guaranteed|always accessible|fully accessible|100% accessible)\b|\b(est garantie?|accès garanti|entièrement accessible)\b/i },
  { id: "eligibility", pattern: /\b(you are eligible|vous êtes admissible|vous avez droit)\b|(?<!whether )(?<!if )\byou qualify\b/i },
  { id: "ai-mention", pattern: /\b(AI|A\.I\.|IA|artificial intelligence|intelligence artificielle|machine learning|chatbot|LLM|GPT)\b/ },
];

function sweep(where: string, text: string): string[] {
  return RULES.filter((rule) => rule.pattern.test(text)).map((rule) => `${where} [${rule.id}]`);
}

afterEach(cleanup);

describe("journey result sweep", () => {
  it("finds no overclaim in the map copy", () => {
    const hits = (["en", "fr"] as const).flatMap((locale) =>
      Object.entries(mapCopy(locale)).flatMap(([key, value]) => sweep(`${locale}.${key}`, value)),
    );
    expect(hits).toEqual([]);
  });

  for (const locale of ["en", "fr"] as const) {
    it(`finds no overclaim on the rendered demo journey (${locale})`, () => {
      const plan = planJourney(demoPlanInput(locale));
      const { container } = render(<JourneyResult plan={plan} />);
      const text = container.textContent ?? "";
      expect(text.length).toBeGreaterThan(500);
      expect(sweep(`rendered ${locale}`, text)).toEqual([]);
      expect(text).toContain(locale === "en" ? "Unknown" : "Inconnu");
    });
  }

  it("catches the claims it is meant to catch", () => {
    for (const sample of ["Endorsed by the TTC", "Verified accessible route", "Fully accessible station", "Planned by AI", "Trajet vérifié"]) {
      expect(sweep("sample", sample), sample).not.toEqual([]);
    }
    for (const sample of ["Unverified by the App.", "Non vérifié par l'application.", "Not guaranteed accessible."]) {
      expect(sweep("sample", sample), sample).toEqual([]);
    }
  });
});
