import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ArtefactExport } from '../artefact-export';

vi.mock('@/lib/export', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
  allArtefactsToMarkdown: vi.fn().mockReturnValue('# Markdown'),
}));

vi.mock('@/lib/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const mockArtefacts = [
  {
    type: 'delivery_state' as const,
    content: { overallStatus: 'green', statusSummary: 'On track' },
  },
  {
    type: 'raid_log' as const,
    content: { items: [] },
  },
];

describe('ArtefactExport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Export button', () => {
    render(<ArtefactExport artefacts={mockArtefacts} />);

    expect(screen.getByText('Export')).toBeDefined();
  });

  it('opens dropdown menu on click', async () => {
    const user = userEvent.setup();
    render(<ArtefactExport artefacts={mockArtefacts} />);

    const exportButton = screen.getByRole('button', { name: /export/i });
    await user.click(exportButton);

    expect(screen.getByText('Copy as Markdown')).toBeDefined();
  });

  it('shows all 4 export options', async () => {
    const user = userEvent.setup();
    render(
      <ArtefactExport artefacts={mockArtefacts} projectName="My Project" />
    );

    const exportButton = screen.getByRole('button', { name: /export/i });
    await user.click(exportButton);

    expect(screen.getByText('Copy as Markdown')).toBeDefined();
    expect(screen.getByText('Copy as JSON')).toBeDefined();
    expect(screen.getByText('Download Markdown')).toBeDefined();
    expect(screen.getByText('Download JSON')).toBeDefined();
  });
});
