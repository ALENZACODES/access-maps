import { planJourney } from '@access-maps/journey';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { JourneyResult } from '../src/JourneyResult.js';

afterEach(() => cleanup());

function frenchPlan() {
  return planJourney({
    locale: 'fr',
    data: { stops: [], paths: [], venues: [], washrooms: [] },
    origin: { id: 'home', name: 'Domicile', lon: -79.4, lat: 43.7 },
    destination: { id: 'clinic', name: 'Clinique', lon: -79.39, lat: 43.7 },
    departAt: '2026-06-15T08:00:00-04:00',
    now: '2026-06-15T07:00:00-04:00',
    winterMode: false,
    profile: { chair: 'manual' },
  });
}

describe('French journey comparison disclosure', () => {
  it('preserves the established French result labels on first render', () => {
    const view = render(<JourneyResult plan={frenchPlan()} />);
    expect(screen.getByRole('heading', { name: 'Résultats du trajet' })).toBeTruthy();
    expect(view.container.textContent).not.toMatch(/UNKNOWN|INCONNU|Gradient:|Steps:/);
    expect(view.container.querySelector('.route-needs')).toBeNull();
    const toggle = screen.getByRole('button', {
      name: 'Comparer les parcours selon vos préférences d’accessibilité',
    });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBeTruthy();
    expect(toggle.getAttribute('style')).toContain('min-height: 44px');
  });

  it('opens and closes the bilingual comparison on request without changing the plan', async () => {
    const user = userEvent.setup();
    const plan = frenchPlan();
    render(<JourneyResult plan={plan} />);
    const toggle = screen.getByRole('button', {
      name: 'Comparer les parcours selon vos préférences d’accessibilité',
    });
    await user.click(toggle);
    expect(screen.getByRole('heading', {
      name: 'Comparer les parcours selon vos préférences d’accessibilité',
    })).toBeTruthy();
    const close = screen.getByRole('button', { name: 'Masquer la comparaison des parcours' });
    expect(close.getAttribute('aria-expanded')).toBe('true');
    await user.click(close);
    expect(screen.queryByRole('heading', {
      name: 'Comparer les parcours selon vos préférences d’accessibilité',
    })).toBeNull();
    expect(plan.locale).toBe('fr');
  });
});
