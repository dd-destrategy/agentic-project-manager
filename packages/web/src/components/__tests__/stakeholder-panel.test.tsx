import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { StakeholderPanel } from '../stakeholder-panel';
import { useStakeholders } from '@/lib/hooks/use-stakeholders';

vi.mock('@/lib/hooks/use-stakeholders', () => ({
  useStakeholders: vi.fn(),
}));

const now = new Date().toISOString();
const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

describe('StakeholderPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading skeleton when isLoading', () => {
    (useStakeholders as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { container } = render(<StakeholderPanel projectId="proj-1" />);

    // Skeleton elements should be present
    const skeletons = container.querySelectorAll('[class*="animate-pulse"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows error message when isError', () => {
    (useStakeholders as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    render(<StakeholderPanel projectId="proj-1" />);

    expect(screen.getByText('Unable to load stakeholder data')).toBeDefined();
  });

  it('renders stakeholder list with names', () => {
    (useStakeholders as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        stakeholders: [
          {
            id: 'sh-1',
            projectId: 'proj-1',
            name: 'Alice Smith',
            role: 'Product Owner',
            interactionCount: 12,
            lastSeenAt: now,
            firstSeenAt: oneHourAgo,
            sources: ['jira'],
            communicationFrequency: 5,
            lastInteractionTypes: ['comment'],
            isActive: true,
          },
          {
            id: 'sh-2',
            projectId: 'proj-1',
            name: 'Bob Jones',
            role: 'Developer',
            interactionCount: 8,
            lastSeenAt: oneHourAgo,
            firstSeenAt: oneHourAgo,
            sources: ['outlook'],
            communicationFrequency: 3,
            lastInteractionTypes: ['email'],
            isActive: true,
          },
        ],
        anomalies: [],
        count: 2,
      },
      isLoading: false,
      isError: false,
    });

    render(<StakeholderPanel projectId="proj-1" />);

    expect(screen.getByText('Alice Smith')).toBeDefined();
    expect(screen.getByText('Bob Jones')).toBeDefined();
  });

  it('shows anomaly warning banner when anomalies exist', () => {
    (useStakeholders as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        stakeholders: [
          {
            id: 'sh-1',
            projectId: 'proj-1',
            name: 'Alice Smith',
            role: 'Product Owner',
            interactionCount: 12,
            lastSeenAt: now,
            firstSeenAt: oneHourAgo,
            sources: ['jira'],
            communicationFrequency: 5,
            lastInteractionTypes: ['comment'],
            isActive: true,
          },
        ],
        anomalies: [
          {
            id: 'sh-1',
            projectId: 'proj-1',
            name: 'Alice Smith',
            role: 'Product Owner',
            interactionCount: 12,
            lastSeenAt: now,
            firstSeenAt: oneHourAgo,
            sources: ['jira'],
            communicationFrequency: 5,
            lastInteractionTypes: ['comment'],
            isActive: true,
          },
        ],
        count: 1,
      },
      isLoading: false,
      isError: false,
    });

    render(<StakeholderPanel projectId="proj-1" />);

    expect(screen.getByText('1 stakeholder gone silent')).toBeDefined();
  });

  it('shows "No stakeholders detected" when empty', () => {
    (useStakeholders as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        stakeholders: [],
        anomalies: [],
        count: 0,
      },
      isLoading: false,
      isError: false,
    });

    render(<StakeholderPanel projectId="proj-1" />);

    expect(screen.getByText(/No stakeholders detected yet/)).toBeDefined();
  });

  it('shows stakeholder details (initials, interaction count)', () => {
    (useStakeholders as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        stakeholders: [
          {
            id: 'sh-1',
            projectId: 'proj-1',
            name: 'Alice Smith',
            role: 'Product Owner',
            interactionCount: 12,
            lastSeenAt: now,
            firstSeenAt: oneHourAgo,
            sources: ['jira'],
            communicationFrequency: 5,
            lastInteractionTypes: ['comment'],
            isActive: true,
          },
        ],
        anomalies: [],
        count: 1,
      },
      isLoading: false,
      isError: false,
    });

    render(<StakeholderPanel projectId="proj-1" />);

    // Initials
    expect(screen.getByText('AS')).toBeDefined();
    // Interaction count
    expect(screen.getByText('12 interactions')).toBeDefined();
    // Role badge
    expect(screen.getByText('Product Owner')).toBeDefined();
  });
});
