import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { RouteNeedsPanel } from '../src/RouteNeedsPanel.js';
import { barredLeg, journey, leg, plan, uncertainLeg, varyingPlan } from './routeNeedsFixtures.js';

/**
 * Interactive tests run in the map-ui workspace's jsdom environment. The
 * underlying source records are fictional; the panel must not alter them.
 */
afterEach(() => cleanup());

describe('P15AD mounted preference controls', () => {
  it('renders its purpose without hiding the uncertainty disclaimer', () => {
    render(<RouteNeedsPanel plan={plan()} />);
    expect(screen.getByRole('heading', { name: 'Compare routes with your accessibility preferences' })).toBeTruthy();
    expect(screen.getByText(/cannot determine personal safety or suitability/)).toBeTruthy();
  });
  it('renders all nine requirements as actual form inputs', () => {
    render(<RouteNeedsPanel plan={plan()} />);
    expect(screen.getAllByRole('combobox').length).toBeGreaterThan(9);
  });
  it('renders a labelled return journey checkbox', () => {
    render(<RouteNeedsPanel plan={plan()} />);
    const input = screen.getByRole('checkbox', { name: 'Include return journey in each assessment' });
    expect((input as HTMLInputElement).checked).toBe(true);
  });
  it('allows people to omit the return trip explicitly', async () => {
    const user = userEvent.setup();
    render(<RouteNeedsPanel plan={plan()} />);
    const input = screen.getByRole('checkbox', { name: 'Include return journey in each assessment' });
    await user.click(input);
    expect((input as HTMLInputElement).checked).toBe(false);
  });
  it('does not show blocked alternatives until selected', () => {
    const sample = plan([journey('normal')], [journey('stairs', [barredLeg('step')])]);
    render(<RouteNeedsPanel plan={sample} />);
    expect(screen.queryByText(/Fictional route stairs/)).toBeNull();
  });
  it('adds blocked alternatives only after choosing to view them', async () => {
    const user = userEvent.setup();
    const sample = plan([journey('normal')], [journey('stairs', [barredLeg('step')])]);
    render(<RouteNeedsPanel plan={sample} />);
    await user.click(screen.getByRole('checkbox', { name: 'Include routes with reported barriers' }));
    expect(screen.getByText(/Fictional route stairs/)).toBeTruthy();
  });
  it('shows UNKNOWN distinctly from a reported barrier', () => {
    render(<RouteNeedsPanel plan={varyingPlan()} />);
    expect(screen.getAllByText('UNKNOWN').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Recorded barrier or exceeded limit').length).toBeGreaterThan(0);
  });
  it('does not silently select an unsupported route as sufficient', () => {
    render(<RouteNeedsPanel plan={plan([journey('unknown', [uncertainLeg('gap')])])} />);
    expect(screen.getByText('No option is selected.')).toBeTruthy();
  });
  it('shows a human-readable route label', () => {
    render(<RouteNeedsPanel plan={plan([journey('selected')])} />);
    expect(screen.getByRole('heading', { name: /Journey option 1: Fictional route selected/ })).toBeTruthy();
  });
  it('provides a local export command with a clear explanation', () => {
    render(<RouteNeedsPanel plan={plan()} />);
    expect(screen.getByRole('button', { name: 'Save comparison as JSON' })).toBeTruthy();
    expect(screen.getByText(/Nothing is sent to a server/)).toBeTruthy();
  });
  it('calls the export callback with parseable local JSON', async () => {
    const user = userEvent.setup();
    let value = '';
    render(<RouteNeedsPanel plan={plan()} onExport={(json) => { value = json; }} />);
    await user.click(screen.getByRole('button', { name: 'Save comparison as JSON' }));
    expect(JSON.parse(value).version).toBe(1);
  });
  it('includes the selected locale in the exported comparison', async () => {
    const user = userEvent.setup();
    let value = '';
    render(<RouteNeedsPanel plan={plan([], [], { locale: 'fr' })} onExport={(json) => { value = json; }} />);
    await user.click(screen.getByRole('button', { name: 'Enregistrer la comparaison en JSON' }));
    expect(JSON.parse(value).locale).toBe('fr');
  });
  it('shows an empty result instead of a fabricated route', () => {
    render(<RouteNeedsPanel plan={plan([])} />);
    expect(screen.getByText('No route options are provided in this plan.')).toBeTruthy();
  });
  it('has accessible labels for source date and age controls', () => {
    render(<RouteNeedsPanel plan={plan()} />);
    expect(screen.getByLabelText('Assessment date')).toBeTruthy();
    expect(screen.getByLabelText('Maximum age of source information, days')).toBeTruthy();
  });
  it('permits editing the assessment date explicitly', () => {
    render(<RouteNeedsPanel plan={plan()} />);
    const input = screen.getByLabelText('Assessment date');
    fireEvent.change(input, { target: { value: '2026-11-18' } });
    expect((input as HTMLInputElement).value).toBe('2026-11-18');
  });
  it('permits editing the maximum source age', () => {
    render(<RouteNeedsPanel plan={plan()} />);
    const input = screen.getByLabelText('Maximum age of source information, days');
    fireEvent.change(input, { target: { value: '30' } });
    expect((input as HTMLInputElement).value).toBe('30');
  });
});

describe('P15AD evidence details and keyboard behavior', () => {
  it('starts with evidence details collapsed', () => {
    render(<RouteNeedsPanel plan={plan()} />);
    const control = screen.getByRole('button', { name: 'Show evidence details' });
    expect(control.getAttribute('aria-expanded')).toBe('false');
  });
  it('opens evidence details with a keyboard activation', async () => {
    const user = userEvent.setup();
    render(<RouteNeedsPanel plan={plan()} />);
    const control = screen.getByRole('button', { name: 'Show evidence details' });
    control.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Hide evidence details' })).toBeTruthy();
  });
  it('closes evidence details with another activation', async () => {
    const user = userEvent.setup();
    render(<RouteNeedsPanel plan={plan()} />);
    await user.click(screen.getByRole('button', { name: 'Show evidence details' }));
    await user.click(screen.getByRole('button', { name: 'Hide evidence details' }));
    expect(screen.getByRole('button', { name: 'Show evidence details' })).toBeTruthy();
  });
  it('shows source and licence in expanded evidence', async () => {
    const user = userEvent.setup();
    render(<RouteNeedsPanel plan={plan()} />);
    await user.click(screen.getByRole('button', { name: 'Show evidence details' }));
    expect(screen.getAllByText('municipal-fixture').length).toBeGreaterThan(0);
    expect(screen.getAllByText('OGL-ON-1.0').length).toBeGreaterThan(0);
  });
  it('shows the retrieval date from the source', async () => {
    const user = userEvent.setup();
    render(<RouteNeedsPanel plan={plan()} />);
    await user.click(screen.getByRole('button', { name: 'Show evidence details' }));
    expect(screen.getAllByText('2026-11-18').length).toBeGreaterThan(0);
  });
  it('includes the direction for outbound and return observations', async () => {
    const user = userEvent.setup();
    render(<RouteNeedsPanel plan={plan()} />);
    await user.click(screen.getByRole('button', { name: 'Show evidence details' }));
    expect(screen.getAllByText('Outbound').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Return').length).toBeGreaterThan(0);
  });
  it('makes the detail toggle unique to its route', async () => {
    const user = userEvent.setup();
    render(<RouteNeedsPanel plan={plan([journey('one'), journey('two')])} />);
    const buttons = screen.getAllByRole('button', { name: 'Show evidence details' });
    await user.click(buttons[0]!);
    expect(screen.getAllByRole('button', { name: 'Hide evidence details' })).toHaveLength(1);
  });
  it('allows filtering to a requirement without changing the underlying route', async () => {
    const user = userEvent.setup();
    render(<RouteNeedsPanel plan={plan()} />);
    await user.selectOptions(screen.getByLabelText('Review this issue'), 'distance');
    const routeList = document.querySelector('.route-needs-results');
    expect(routeList).toBeTruthy();
    expect(within(routeList as HTMLElement).getByText('Route distance')).toBeTruthy();
  });
  it('restores defaults after modifying controls', async () => {
    const user = userEvent.setup();
    render(<RouteNeedsPanel plan={plan()} />);
    const control = screen.getByRole('checkbox', { name: 'Include return journey in each assessment' });
    await user.click(control);
    await user.click(screen.getByRole('button', { name: 'Restore initial preferences' }));
    expect((control as HTMLInputElement).checked).toBe(true);
  });
  it('does not need a pointer to reach the local export command', async () => {
    const user = userEvent.setup();
    let value = '';
    render(<RouteNeedsPanel plan={plan()} onExport={(json) => { value = json; }} />);
    const control = screen.getByRole('button', { name: 'Save comparison as JSON' });
    control.focus();
    await user.keyboard('{Enter}');
    expect(value).toContain('sourceInventory');
  });
});

describe('P15AD French route-needs surface', () => {
  const french = plan([], [], { locale: 'fr' });
  it('shows French headings without an English heading fallback', () => {
    render(<RouteNeedsPanel plan={french} />);
    expect(screen.getByRole('heading', { name: 'Comparer les parcours selon vos préférences d’accessibilité' })).toBeTruthy();
    expect(screen.queryByText('Your route preferences')).toBeNull();
  });
  it('uses the literal UNKNOWN token for missing data', () => {
    render(<RouteNeedsPanel plan={plan([journey('a', [uncertainLeg('gap')])], [], { locale: 'fr' })} />);
    expect(screen.getAllByText('UNKNOWN').length).toBeGreaterThan(0);
  });
  it('renders the local-only export explanation in French', () => {
    render(<RouteNeedsPanel plan={french} />);
    expect(screen.getByText('Enregistre un rapport local. Rien n’est envoyé à un serveur.')).toBeTruthy();
  });
  it('uses correct French punctuation around computed labels', () => {
    const view = render(<RouteNeedsPanel plan={plan([journey('a', [leg('a')])], [], { locale: 'fr' })} />);
    expect(view.container.textContent).toContain('Options sans conflit essentiel signalé\u00a0:');
    expect(view.container.textContent).not.toContain('signalé:');
  });
});
