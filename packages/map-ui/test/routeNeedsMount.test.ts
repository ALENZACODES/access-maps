import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
function source(path: string): string { return readFileSync(join(root, 'src', path), 'utf8'); }

describe('P15AD live journey UI wiring', () => {
  it('mounts the panel in the existing JourneyResult component', () => {
    expect(source('JourneyResult.tsx')).toContain('<RouteNeedsPanel plan={plan} />');
  });
  it('imports the panel through the real component path', () => {
    expect(source('JourneyResult.tsx')).toContain('from "./RouteNeedsPanel.js"');
  });
  it('exports the panel from the public map-ui barrel', () => {
    expect(source('index.ts')).toContain('export { RouteNeedsPanel }');
  });
  it('exports the pure assessment helpers from the public barrel', () => {
    expect(source('index.ts')).toContain('export { compareRoutes');
  });
  it('exports source-inventory functions from the public barrel', () => {
    expect(source('index.ts')).toContain('sourceInventory');
    expect(source('index.ts')).toContain('exportNeedsJson');
  });
  it('imports the panel stylesheet from the mounted component entry', () => {
    expect(source('JourneyResult.tsx')).toContain('import "./route-needs.css";');
  });
  it('keeps emergency calling above the route-needs comparison in the DOM', () => {
    const file = source('JourneyResult.tsx');
    expect(file.indexOf('href="tel:911"')).toBeGreaterThan(0);
    expect(file.indexOf('<RouteNeedsPanel')).toBeGreaterThan(file.indexOf('href="tel:911"'));
  });
  it('does not replace the map feature list with the preferences panel', () => {
    const file = source('JourneyResult.tsx');
    expect(file).toContain('<AccessibleMap');
    expect(file).toContain('<AttributionSources');
    expect(file).toContain('<RouteNeedsPanel');
  });
  it('renders the comparison after the source attribution section', () => {
    const file = source('JourneyResult.tsx');
    expect(file.indexOf('<RouteNeedsPanel')).toBeGreaterThan(file.indexOf('<AttributionSources'));
  });
  it('keeps the existing emergency heading focus behavior', () => {
    const file = source('JourneyResult.tsx');
    expect(file).toContain('headingRef.current?.focus()');
  });
  it('keeps the original blocked route options accessible', () => {
    const file = source('JourneyResult.tsx');
    expect(file).toContain('plan.blocked.map(');
  });
  it('does not register a background job or scheduled workflow', () => {
    const file = source('RouteNeedsPanel.tsx');
    expect(file).not.toMatch(/setInterval|scheduleTask|cron/iu);
  });
  it('has an explicit 44 pixel minimum for all new interactive controls', () => {
    const file = source('route-needs.css');
    expect(file).toMatch(/\.route-needs button, \.route-needs input, \.route-needs select \{ min-height: 44px; min-width: 44px;/u);
  });
  it('has a keyboard-visible focus indicator', () => {
    const file = source('route-needs.css');
    expect(file).toContain(':focus-visible');
    expect(file).toContain('outline: 3px');
  });
  it('has an accessible label for every user-selectable preference', () => {
    const file = source('RouteNeedsPanel.tsx');
    expect(file).toContain('<label htmlFor={`${keyPrefix}-${id}-priority`}>');
    expect(file).toContain('<label htmlFor={`${keyPrefix}-${id}-limit`}>');
  });
  it('uses native buttons instead of interactive containers', () => {
    const file = source('RouteNeedsPanel.tsx');
    expect(file).toContain('<button type="button"');
    expect(file).not.toContain('role="button"');
  });
  it('uses an accessible expanded state on evidence disclosure', () => {
    const file = source('RouteNeedsPanel.tsx');
    expect(file).toContain('aria-expanded={isOpen}');
    expect(file).toContain('aria-controls={`${uid}-detail-${index}`}');
  });
  it('keeps preference state local to the user interface', () => {
    const file = source('RouteNeedsPanel.tsx');
    expect(file).toContain('useState<NeedsProfile>');
    expect(file).not.toContain('localStorage');
    expect(file).not.toContain('fetch(');
  });
  it('creates a user-triggered local file instead of sending data', () => {
    const file = source('RouteNeedsPanel.tsx');
    expect(file).toContain('URL.createObjectURL(blob)');
    expect(file).toContain('anchor.click()');
    expect(file).not.toContain('navigator.sendBeacon');
  });
  it('does not assume personal medical conditions in the form', () => {
    const copy = source('routeNeedsCopy.ts');
    expect(copy).not.toMatch(/diagnosis|medical eligibility|medical advice/iu);
  });
});
