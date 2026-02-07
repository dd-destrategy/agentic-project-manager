import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { CommandPalette } from '../command-palette';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing (initially closed)', () => {
    const { container } = render(<CommandPalette />);
    // Dialog content should not be visible when closed
    expect(container).toBeDefined();
    expect(screen.queryByLabelText('Command palette')).toBeNull();
  });

  it('opens on Ctrl+K keydown', () => {
    render(<CommandPalette />);

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });

    expect(screen.getByLabelText('Command palette')).toBeDefined();
  });

  it('shows all 10 commands when open', () => {
    render(<CommandPalette />);

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });

    expect(screen.getByText('Dashboard')).toBeDefined();
    expect(screen.getByText('Ingest')).toBeDefined();
    expect(screen.getByText('Extracted Items')).toBeDefined();
    expect(screen.getByText('Reports')).toBeDefined();
    expect(screen.getByText('Projects')).toBeDefined();
    expect(screen.getByText('Activity')).toBeDefined();
    expect(screen.getByText('Escalations')).toBeDefined();
    expect(screen.getByText('Catch-up')).toBeDefined();
    expect(screen.getByText('Ask a Question')).toBeDefined();
    expect(screen.getByText('Settings')).toBeDefined();
  });

  it('filters commands based on search input', () => {
    render(<CommandPalette />);

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });

    const searchInput = screen.getByLabelText('Search commands');
    fireEvent.change(searchInput, { target: { value: 'dash' } });

    expect(screen.getByText('Dashboard')).toBeDefined();
    // Other commands should be filtered out
    expect(screen.queryByText('Settings')).toBeNull();
    expect(screen.queryByText('Reports')).toBeNull();
  });

  it('shows "No results found." for non-matching queries', () => {
    render(<CommandPalette />);

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });

    const searchInput = screen.getByLabelText('Search commands');
    fireEvent.change(searchInput, { target: { value: 'xyznonexistent' } });

    expect(screen.getByText('No results found.')).toBeDefined();
  });

  it('navigates on command click (calls router.push)', () => {
    render(<CommandPalette />);

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });

    const dashboardOption = screen.getByText('Dashboard');
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    fireEvent.click(dashboardOption.closest('button')!);

    expect(mockPush).toHaveBeenCalledWith('/dashboard');
  });

  it('closes on Escape key', () => {
    render(<CommandPalette />);

    // Open the palette
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(screen.getByLabelText('Command palette')).toBeDefined();

    // Press Escape
    fireEvent.keyDown(document, { key: 'Escape' });

    // Dialog content should be removed
    expect(screen.queryByLabelText('Command palette')).toBeNull();
  });
});
