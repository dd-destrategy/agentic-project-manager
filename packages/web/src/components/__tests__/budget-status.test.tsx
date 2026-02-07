import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { BudgetStatus, BudgetStatusCompact } from '../budget-status';
import type { BudgetStatusData } from '../budget-status';

const baseBudget: BudgetStatusData = {
  dailySpend: 0.35,
  dailyLimit: 0.5,
  monthSpend: 4.2,
  monthLimit: 7.0,
  dailyAverage: 0.3,
  tier: 0,
  tierName: 'Normal',
  daysRemaining: 21,
  projectedMonthSpend: 6.3,
  onTrack: true,
  usageHistory: [
    { date: '2026-02-01', spend: 0.25, tokens: 5000 },
    { date: '2026-02-02', spend: 0.35, tokens: 7000 },
  ],
};

describe('BudgetStatus', () => {
  it('renders month and daily spend', () => {
    render(<BudgetStatus budget={baseBudget} />);

    // Monthly spend display
    expect(screen.getByText('Month to date')).toBeDefined();
    expect(screen.getByText('$4.20 / $7.00')).toBeDefined();

    // Daily spend display
    expect(screen.getByText('Today')).toBeDefined();
    expect(screen.getByText('$0.35 / $0.50')).toBeDefined();
  });

  it('shows tier badge', () => {
    render(<BudgetStatus budget={baseBudget} />);

    expect(screen.getByText('Normal')).toBeDefined();
  });

  it('shows "On Track" when onTrack is true', () => {
    render(<BudgetStatus budget={baseBudget} />);

    expect(screen.getByText('On Track')).toBeDefined();
  });

  it('shows "Over Budget" when onTrack is false', () => {
    const overBudget: BudgetStatusData = {
      ...baseBudget,
      onTrack: false,
      projectedMonthSpend: 9.5,
    };

    render(<BudgetStatus budget={overBudget} />);

    expect(screen.getByText('Over Budget')).toBeDefined();
  });

  it('shows tier description when tier > 0', () => {
    const degradedBudget: BudgetStatusData = {
      ...baseBudget,
      tier: 1,
      tierName: 'Degradation Tier 1',
    };

    render(<BudgetStatus budget={degradedBudget} />);

    expect(screen.getByText('Degradation Tier 1')).toBeDefined();
    expect(screen.getByText('Degradation 1')).toBeDefined();
    expect(
      screen.getByText('Skipping low-priority signals to conserve budget.')
    ).toBeDefined();
  });
});

describe('BudgetStatusCompact', () => {
  it('renders compact budget display', () => {
    render(<BudgetStatusCompact budget={baseBudget} />);

    expect(screen.getByText('Budget')).toBeDefined();
    expect(screen.getByText('$4.20 / $7.00')).toBeDefined();
    expect(screen.getByText('Tier 0')).toBeDefined();
  });
});
