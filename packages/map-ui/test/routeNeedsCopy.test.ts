import { describe, expect, it } from 'vitest';
import { frenchTypography, localLabel, needsCopy, needsCopyKeys } from '../src/routeNeedsCopy.js';
import { REQUIREMENTS } from '../src/routeNeeds.js';

describe('P15AD bilingual requirement names and UI controls', () => {
  it('has identical top-level keys for both locales', () => {
    expect(needsCopyKeys().fr).toEqual(needsCopyKeys().en);
  });
  it('supplies a French label for each available requirement', () => {
    const copy = needsCopy('fr');
    expect(REQUIREMENTS.every((id) => copy.requirements[id].length > 1)).toBe(true);
  });
  it('supplies an English label for each available requirement', () => {
    const copy = needsCopy('en');
    expect(REQUIREMENTS.every((id) => copy.requirements[id].length > 1)).toBe(true);
  });
  it('uses identical requirement identifiers in both locales', () => {
    expect(Object.keys(needsCopy('fr').requirements).sort()).toEqual(Object.keys(needsCopy('en').requirements).sort());
  });
  it('includes all three preference priorities in both locales', () => {
    expect(Object.keys(needsCopy('en').priorities).sort()).toEqual(Object.keys(needsCopy('fr').priorities).sort());
    expect(Object.keys(needsCopy('fr').priorities)).toHaveLength(3);
  });
  it('preserves the literal UNKNOWN token', () => {
    expect(needsCopy('fr').results.UNKNOWN).toBe('UNKNOWN');
    expect(needsCopy('en').results.UNKNOWN).toBe('UNKNOWN');
  });
  it('translates known barriers but not the missing-value token', () => {
    expect(localLabel('fr', 'barrier')).not.toBe(localLabel('en', 'barrier'));
    expect(localLabel('fr', 'UNKNOWN')).toBe('UNKNOWN');
  });
  it('does not present the route comparison as professional advice', () => {
    expect(needsCopy('en').disclaimer).toContain('cannot determine');
    expect(needsCopy('fr').disclaimer).toContain('ne détermine pas');
  });
  it('makes the export scope local-only in both languages', () => {
    expect(needsCopy('en').exportHelp).toContain('local');
    expect(needsCopy('fr').exportHelp).toContain('local');
  });
  it('makes return journeys an explicit option', () => {
    expect(needsCopy('en').includeReturn).toMatch(/return/i);
    expect(needsCopy('fr').includeReturn).toMatch(/retour/i);
  });
  it('makes blocked routes an explicit option', () => {
    expect(needsCopy('en').showBlocked).toMatch(/reported barriers/i);
    expect(needsCopy('fr').showBlocked).toMatch(/obstacles signalés/i);
  });
  it('provides a reset control in both locales', () => {
    expect(needsCopy('en').reset.length).toBeGreaterThan(5);
    expect(needsCopy('fr').reset.length).toBeGreaterThan(5);
  });
  it('has a label for the source date control', () => {
    expect(needsCopy('en').dateLabel).toContain('date');
    expect(needsCopy('fr').dateLabel).toContain('Date');
  });
  it('has a label for source age limitations', () => {
    expect(needsCopy('en').ageLabel).toContain('days');
    expect(needsCopy('fr').ageLabel).toContain('jours');
  });
  it('has separate labels for slope and distance', () => {
    expect(needsCopy('en').slopeLabel).not.toBe(needsCopy('en').distanceLabel);
    expect(needsCopy('fr').slopeLabel).not.toBe(needsCopy('fr').distanceLabel);
  });
  it('has a localized direction for inbound and outbound evidence', () => {
    expect(needsCopy('fr').outbound).not.toBe(needsCopy('fr').returning);
    expect(needsCopy('en').outbound).not.toBe(needsCopy('en').returning);
  });
});

describe('P15AD French typography', () => {
  it('accepts a normal French sentence', () => {
    expect(frenchTypography('L’accès reste UNKNOWN.')).toBe(true);
  });
  it('accepts a curly apostrophe', () => {
    expect(frenchTypography('L’observation est datée.')).toBe(true);
  });
  it('rejects a straight apostrophe between letters', () => {
    expect(frenchTypography("L'observation est datée.")).toBe(false);
  });
  it('requires a nonbreaking space before colon', () => {
    expect(frenchTypography('Source : inconnue')).toBe(false);
    expect(frenchTypography('Source\u00a0: inconnue')).toBe(true);
  });
  it('requires a narrow nonbreaking space before semicolon', () => {
    expect(frenchTypography('A ; B')).toBe(false);
    expect(frenchTypography('A\u202f; B')).toBe(true);
  });
  it('requires a narrow nonbreaking space before an exclamation', () => {
    expect(frenchTypography('Attention !')).toBe(false);
    expect(frenchTypography('Attention\u202f!')).toBe(true);
  });
  it('requires a narrow nonbreaking space before a question mark', () => {
    expect(frenchTypography('Quel parcours ?')).toBe(false);
    expect(frenchTypography('Quel parcours\u202f?')).toBe(true);
  });
  it('requires narrow spaces within guillemets', () => {
    expect(frenchTypography('«Texte»')).toBe(false);
    expect(frenchTypography('«\u202fTexte\u202f»')).toBe(true);
  });
  it('does not reject French sentences with no punctuation', () => {
    expect(frenchTypography('Parcours accessible selon les données')).toBe(true);
  });
  it('validates the actual French user copy', () => {
    const copy = needsCopy('fr');
    for (const [key, value] of Object.entries(copy)) {
      if (typeof value === 'string') expect(frenchTypography(value), key).toBe(true);
    }
  });
  it('validates every French requirement name', () => {
    expect(Object.values(needsCopy('fr').requirements).every(frenchTypography)).toBe(true);
  });
  it('validates every French status label', () => {
    expect(Object.values(needsCopy('fr').results).every(frenchTypography)).toBe(true);
  });
  it('validates every French priority label', () => {
    expect(Object.values(needsCopy('fr').priorities).every(frenchTypography)).toBe(true);
  });
  it('does not make an unsupported source claim in copy', () => {
    const copy = JSON.stringify(needsCopy('en')) + JSON.stringify(needsCopy('fr'));
    expect(copy).not.toMatch(/real-time|guarantee|partnership/iu);
  });
});
