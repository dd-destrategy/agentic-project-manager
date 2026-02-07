import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { MeetingMode } from '../meeting-mode';

describe('MeetingMode', () => {
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the meeting form with all fields', () => {
    render(<MeetingMode onSubmit={mockOnSubmit} />);

    expect(screen.getByText('Meeting Notes Ingestion')).toBeDefined();
    expect(screen.getByLabelText('Meeting Type')).toBeDefined();
    expect(screen.getByLabelText('Date')).toBeDefined();
    expect(screen.getByLabelText('Attendees (comma-separated)')).toBeDefined();
    expect(
      screen.getByLabelText('Meeting Notes / Transcript')
    ).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'Extract Items from Meeting' })
    ).toBeDefined();
  });

  it('defaults meeting type to standup', () => {
    render(<MeetingMode onSubmit={mockOnSubmit} />);

    const select = screen.getByLabelText('Meeting Type') as HTMLSelectElement;
    expect(select.value).toBe('standup');
  });

  it('allows selecting different meeting types', () => {
    render(<MeetingMode onSubmit={mockOnSubmit} />);

    const select = screen.getByLabelText('Meeting Type') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'retrospective' } });
    expect(select.value).toBe('retrospective');
  });

  it('disables submit button when transcript is empty', () => {
    render(<MeetingMode onSubmit={mockOnSubmit} />);

    const button = screen.getByRole('button', {
      name: 'Extract Items from Meeting',
    });
    expect(button).toBeDisabled();
  });

  it('enables submit button when transcript has content', () => {
    render(<MeetingMode onSubmit={mockOnSubmit} />);

    const textarea = screen.getByLabelText('Meeting Notes / Transcript');
    fireEvent.change(textarea, {
      target: { value: 'We discussed the sprint goals.' },
    });

    const button = screen.getByRole('button', {
      name: 'Extract Items from Meeting',
    });
    expect(button).not.toBeDisabled();
  });

  it('submits with correct metadata and transcript', () => {
    render(<MeetingMode onSubmit={mockOnSubmit} />);

    // Set meeting type
    const select = screen.getByLabelText('Meeting Type') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'sprint_review' } });

    // Set date
    const dateInput = screen.getByLabelText('Date');
    fireEvent.change(dateInput, { target: { value: '2026-02-07' } });

    // Set attendees
    const attendeesInput = screen.getByLabelText(
      'Attendees (comma-separated)'
    );
    fireEvent.change(attendeesInput, {
      target: { value: 'Alice, Bob, Carol' },
    });

    // Set transcript
    const textarea = screen.getByLabelText('Meeting Notes / Transcript');
    fireEvent.change(textarea, {
      target: { value: 'Sprint review notes here.' },
    });

    // Submit
    const button = screen.getByRole('button', {
      name: 'Extract Items from Meeting',
    });
    fireEvent.click(button);

    expect(mockOnSubmit).toHaveBeenCalledWith(
      {
        meetingType: 'sprint_review',
        date: '2026-02-07',
        attendees: ['Alice', 'Bob', 'Carol'],
      },
      'Sprint review notes here.'
    );
  });

  it('shows Processing text when isLoading is true', () => {
    render(<MeetingMode onSubmit={mockOnSubmit} isLoading />);

    expect(screen.getByRole('button', { name: 'Processing...' })).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'Processing...' })
    ).toBeDisabled();
  });

  it('renders attendee badges when attendees are entered', () => {
    render(<MeetingMode onSubmit={mockOnSubmit} />);

    const attendeesInput = screen.getByLabelText(
      'Attendees (comma-separated)'
    );
    fireEvent.change(attendeesInput, {
      target: { value: 'Alice, Bob' },
    });

    expect(screen.getByText('Alice')).toBeDefined();
    expect(screen.getByText('Bob')).toBeDefined();
  });

  it('filters out empty attendee entries from comma-separated input', () => {
    render(<MeetingMode onSubmit={mockOnSubmit} />);

    const attendeesInput = screen.getByLabelText(
      'Attendees (comma-separated)'
    );
    fireEvent.change(attendeesInput, {
      target: { value: 'Alice, , Bob, ' },
    });

    const textarea = screen.getByLabelText('Meeting Notes / Transcript');
    fireEvent.change(textarea, { target: { value: 'Notes' } });

    fireEvent.click(
      screen.getByRole('button', { name: 'Extract Items from Meeting' })
    );

    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        attendees: ['Alice', 'Bob'],
      }),
      'Notes'
    );
  });
});
