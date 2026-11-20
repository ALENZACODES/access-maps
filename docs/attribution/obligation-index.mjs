/** Public entry point for local placement audits. Importing it performs no I/O. */
export {
  OBLIGATION_SCHEMA, OBLIGATION_UNKNOWN, MAX_OBLIGATION_BYTES,
  OBLIGATION_PROVIDERS, OBLIGATION_STATES, OBLIGATION_TIERS,
  OBLIGATION_LIFECYCLE, OBLIGATION_DISPLAYS, OBLIGATION_KINDS,
  OBLIGATION_VISIBILITY, OBLIGATION_WITNESS_TYPES,
  ObligationInputError, parseObligationSource, parseObligationPage,
  parseObligationPlacement, parseObligationWitness,
  parseObligationRegister, parseObligationJson, canonicalObligationJson,
  sourcePageIndex, placementIndex, witnessIndex,
} from './obligation-core.mjs';
export {
  OBLIGATION_MIN_TARGET, requiredKinds, auditObligationRegister,
  buildObligationChecklist,
} from './obligation-audit.mjs';
export {
  OBLIGATION_CHANGE_FIELDS, compareObligationRegisters, affectedPages,
} from './obligation-change.mjs';
export {
  OBLIGATION_COPY, escapeObligationHtml, obligationPair,
  renderObligationText, renderObligationHtml,
  renderObligationJson, renderObligationReport,
} from './obligation-report.mjs';
