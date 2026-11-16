import { describe, expect, it } from "vitest";
import { auditRelease } from "./evidence-audit.js";
import { compareReleaseEvidence } from "./evidence-changes.js";
import { sampleRelease, sampleSource, sampleSurface } from "./evidence-fixtures.js";
import {
  escapeHtml,
  renderAuditHtml,
  renderAuditText,
  renderChangesHtml,
  renderChangesText,
} from "./evidence-report.js";

const release = sampleRelease();
const audit = auditRelease(release);

describe("bilingual printable source reports", () => {
  it("renders an English report", () => {
    const output = renderAuditText(release, audit, "en");
    expect(output).toContain("Attribution evidence report");
    expect(output).toContain("Source URL: ");
    expect(output).toContain("Release: release-one");
  });

  it("renders a French report", () => {
    const output = renderAuditText(release, audit, "fr");
    expect(output).toContain("Rapport sur les sources et les licences");
    expect(output).toContain("Version\u00a0: release-one");
    expect(output).toContain("Données en date du\u00a0: UNKNOWN");
    expect(output).toContain("Identifiant\u00a0: osm-one");
  });

  it("translates blocking severity in French reports", () => {
    const denied = sampleRelease([sampleSource({ licenceEvidence: "NO" })]);
    expect(renderAuditText(denied, auditRelease(denied), "fr"))
      .toContain("BLOQUANT: LICENCE_DENIED");
  });

  it("does not use an ordinary space before French colons", () => {
    const output = renderAuditText(release, audit, "fr");
    expect(output).not.toMatch(/Données en date du :/u);
    expect(output).not.toMatch(/Version :/u);
    expect(output).not.toMatch(/Licence :/u);
  });

  it("keeps UNKNOWN rather than creating a dataset date", () => {
    expect(renderAuditText(release, audit, "en")).toContain("Dataset date: UNKNOWN");
    expect(renderAuditText(release, audit, "fr")).toContain("Données en date du\u00a0: UNKNOWN");
  });

  it("includes the actual recorded source URL", () => {
    expect(renderAuditText(release, audit, "en"))
      .toContain("https://www.openstreetmap.org/copyright");
  });

  it("includes actual recorded licence URLs", () => {
    expect(renderAuditText(release, audit, "en"))
      .toContain("https://opendatacommons.org/licenses/odbl/1-0/");
  });

  it("includes the recorded attribution notice", () => {
    expect(renderAuditText(release, audit, "en")).toContain("© OpenStreetMap contributors");
  });

  it("includes explicit YES/NO/UNKNOWN permission states", () => {
    const altered = sampleRelease([sampleSource({ redistributionPermission: "UNKNOWN" })]);
    const output = renderAuditText(altered, auditRelease(altered), "en");
    expect(output).toContain("Redistribution permission: UNKNOWN");
  });

  it("includes source IDs and linked surfaces", () => {
    const output = renderAuditText(release, audit, "en");
    expect(output).toContain("ID: osm-one");
    expect(output).toContain("ID: public-map");
    expect(output).toContain("Linked sources: osm-one");
  });

  it("includes blocker codes and paths without hiding reasons", () => {
    const altered = sampleRelease([sampleSource({ licenceEvidence: "NO" })]);
    const output = renderAuditText(altered, auditRelease(altered), "en");
    expect(output).toContain("LICENCE_DENIED");
    expect(output).toContain("sources.osm-one.licenceEvidence");
  });

  it("distinguishes release blocked from no blocking findings", () => {
    const good = renderAuditText(release, audit, "en");
    const badRelease = sampleRelease([sampleSource({ licenceEvidence: "NO" })]);
    const bad = renderAuditText(badRelease, auditRelease(badRelease), "en");
    expect(good).toContain("No blocking findings in the supplied records");
    expect(bad).toContain("Release blocked by evidence gaps");
  });

  it("escapes all HTML metacharacters", () => {
    expect(escapeHtml(`<script a='"'>&`)).toBe("&lt;script a=&#39;&quot;&#39;&gt;&amp;");
  });

  it("produces complete standalone English HTML", () => {
    const html = renderAuditHtml(release, audit, "en");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("</body></html>");
    expect(html).toContain("<main id=\"content\">");
  });

  it("produces complete standalone French HTML", () => {
    const html = renderAuditHtml(release, audit, "fr");
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain("Rapport sur les sources et les licences");
    expect(html).toContain("Données en date du\u00a0: UNKNOWN");
  });

  it("does not call remote fonts or tile servers", () => {
    const html = renderAuditHtml(release, audit, "en");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<link");
    expect(html).not.toContain("@import");
    expect(html).not.toContain("fetch(");
  });

  it("blocks network access through the report CSP", () => {
    const html = renderAuditHtml(release, audit, "en");
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("form-action 'none'");
  });

  it("provides semantic headings and landmarks", () => {
    const html = renderAuditHtml(release, audit, "en");
    expect(html).toContain("<main");
    expect(html).toContain("<h1>");
    expect(html).toContain("<h2");
    expect(html).toContain("<h3");
  });

  it("provides a skip link for keyboard users", () => {
    const html = renderAuditHtml(release, audit, "fr");
    expect(html).toContain('href="#content"');
    expect(html).toContain(":focus");
  });

  it("includes 44px link target safeguards", () => {
    const html = renderAuditHtml(release, audit, "en");
    expect(html).toContain("min-height: 44px");
    expect(html).toContain("min-width: 44px");
  });

  it("supports reduced-motion preferences", () => {
    expect(renderAuditHtml(release, audit, "en"))
      .toContain("prefers-reduced-motion: reduce");
  });

  it("prevents user-supplied source HTML injection", () => {
    const unsafe = sampleRelease([sampleSource({ notes: "", name: "<img src=x onerror=alert(1)>" })]);
    const html = renderAuditHtml(unsafe, auditRelease(unsafe), "en");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });

  it("prevents HTML injection in notices", () => {
    const unsafe = sampleRelease([sampleSource({ attribution: "<script>alert(1)</script>" })]);
    const html = renderAuditHtml(unsafe, auditRelease(unsafe), "en");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("escapes user-supplied finding context", () => {
    const unsafe = sampleRelease([sampleSource({ id: "osm-one", licenceEvidence: "NO" })]);
    const html = renderAuditHtml(unsafe, auditRelease(unsafe), "en");
    expect(html).toContain("LICENCE_DENIED");
    expect(html).toContain("<li>");
  });

  it("handles zero sources and zero surfaces", () => {
    const empty = sampleRelease([], []);
    const output = renderAuditHtml(empty, auditRelease(empty), "fr");
    expect(output).toContain("<main");
    expect(output).toContain("Points à examiner");
  });

  it("handles zero audit findings with an explicit empty label", () => {
    const clean = { ...audit, findings: [] };
    expect(renderAuditHtml(release, clean, "en")).toContain("No findings");
  });

  it("renders both languages without unsupported claims", () => {
    for (const locale of ["en", "fr"] as const) {
      const text = renderAuditText(release, audit, locale);
      expect(text).not.toMatch(/real-time|partnership|guarantee|vérifi|verified/iu);
    }
  });
});

describe("offline comparison reports", () => {
  const before = sampleRelease();
  const after = { ...sampleRelease([sampleSource({ licenceEvidence: "UNKNOWN" })]), releaseId: "release-two" };
  const result = compareReleaseEvidence(before, after);

  it("identifies both releases in the text report", () => {
    const output = renderChangesText(result, "en");
    expect(output).toContain("release-one → release-two");
  });

  it("labels before and after values in English", () => {
    const output = renderChangesText(result, "en");
    expect(output).toContain("Before: YES");
    expect(output).toContain("After: UNKNOWN");
  });

  it("uses nonbreaking French colon spacing in comparisons", () => {
    const output = renderChangesText(result, "fr");
    expect(output).toContain("Avant\u00a0: YES");
    expect(output).toContain("Après\u00a0: UNKNOWN");
  });

  it("includes the release-blocking decision", () => {
    expect(renderChangesText(result, "en")).toContain("Release blocked by evidence gaps");
  });

  it("produces self-contained change-review HTML", () => {
    const html = renderChangesHtml(result, "en");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("</body></html>");
    expect(html).toContain("<ol>");
  });

  it("shows French report titles in French HTML", () => {
    const html = renderChangesHtml(result, "fr");
    expect(html).toContain('lang="fr"');
    expect(html).toContain("Changements depuis la version précédente");
  });

  it("includes explicit CSP and keyboard skip link", () => {
    const html = renderChangesHtml(result, "en");
    expect(html).toContain("default-src 'none'");
    expect(html).toContain('href="#content"');
  });

  it("escapes changed text from release records", () => {
    const changed = compareReleaseEvidence(before,
      sampleRelease([sampleSource({ notes: "<iframe src=x>" })]));
    const html = renderChangesHtml(changed, "en");
    expect(html).not.toContain("<iframe src=x>");
    expect(html).toContain("&lt;iframe src=x&gt;");
  });

  it("handles no changes with an explicit empty label", () => {
    const equal = compareReleaseEvidence(before, before);
    expect(renderChangesText(equal, "en")).toContain("No findings");
    expect(renderChangesHtml(equal, "en")).toContain("No findings");
  });

  it("does not invent a comparison date", () => {
    const output = renderChangesText(result, "en");
    expect(output).not.toContain("Today:");
    expect(output).not.toContain("2026-11-16");
  });
});
