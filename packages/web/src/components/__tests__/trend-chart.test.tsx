import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { TrendChart, StatusTrendChart } from '../trend-chart';
import type { TrendDataPoint, StatusDataPoint } from '../trend-chart';

describe('TrendChart', () => {
  it('shows "No data yet" when data is empty', () => {
    render(<TrendChart data={[]} title="Test Chart" />);

    expect(screen.getByText('No data yet')).toBeDefined();
  });

  it('renders bars for data points', () => {
    const data: TrendDataPoint[] = [
      { timestamp: '2026-02-01T00:00:00Z', value: 10 },
      { timestamp: '2026-02-02T00:00:00Z', value: 20 },
      { timestamp: '2026-02-03T00:00:00Z', value: 15 },
    ];

    render(<TrendChart data={data} title="Signals" />);

    // Each data point should render a bar with an aria-label
    const bars = screen.getAllByRole('img');
    expect(bars.length).toBe(1); // The whole chart is one img role element

    // Verify individual bar aria-labels
    const bar1 = screen.getByLabelText(/1 Feb: 10/);
    const bar2 = screen.getByLabelText(/2 Feb: 20/);
    const bar3 = screen.getByLabelText(/3 Feb: 15/);
    expect(bar1).toBeDefined();
    expect(bar2).toBeDefined();
    expect(bar3).toBeDefined();
  });

  it('shows title', () => {
    const data: TrendDataPoint[] = [
      { timestamp: '2026-02-01T00:00:00Z', value: 5 },
    ];

    render(<TrendChart data={data} title="My Trend" />);

    expect(screen.getByText('My Trend')).toBeDefined();
  });

  it('shows latest value', () => {
    const data: TrendDataPoint[] = [
      { timestamp: '2026-02-01T00:00:00Z', value: 5 },
      { timestamp: '2026-02-02T00:00:00Z', value: 42 },
    ];

    render(<TrendChart data={data} title="Values" />);

    expect(screen.getByText('42')).toBeDefined();
  });

  it('shows time axis labels when multiple data points', () => {
    const data: TrendDataPoint[] = [
      { timestamp: '2026-02-01T00:00:00Z', value: 10 },
      { timestamp: '2026-02-05T00:00:00Z', value: 20 },
    ];

    render(<TrendChart data={data} title="Timeline" />);

    // Should show first and last timestamps formatted as "d Mon"
    expect(screen.getByText('1 Feb')).toBeDefined();
    expect(screen.getByText('5 Feb')).toBeDefined();
  });

  it('uses aria-label for accessibility', () => {
    const data: TrendDataPoint[] = [
      { timestamp: '2026-02-01T00:00:00Z', value: 10 },
      { timestamp: '2026-02-02T00:00:00Z', value: 20 },
    ];

    render(<TrendChart data={data} title="Accessible Chart" />);

    const chart = screen.getByRole('img');
    expect(chart.getAttribute('aria-label')).toBe(
      'Accessible Chart trend chart with 2 data points'
    );
  });
});

describe('StatusTrendChart', () => {
  it('shows "No data yet" when empty', () => {
    render(<StatusTrendChart data={[]} title="Health Status" />);

    expect(screen.getByText('No data yet')).toBeDefined();
  });

  it('renders status segments', () => {
    const data: StatusDataPoint[] = [
      { timestamp: '2026-02-01T00:00:00Z', status: 'green' },
      { timestamp: '2026-02-02T00:00:00Z', status: 'amber' },
      { timestamp: '2026-02-03T00:00:00Z', status: 'red' },
    ];

    render(<StatusTrendChart data={data} title="Project Health" />);

    expect(screen.getByText('Project Health')).toBeDefined();

    // The chart container should exist with an img role
    const chart = screen.getByRole('img');
    expect(chart.getAttribute('aria-label')).toBe(
      'Project Health status timeline with 3 data points'
    );

    // Each segment should have a title attribute with its status
    expect(chart.children.length).toBe(3);
  });
});
