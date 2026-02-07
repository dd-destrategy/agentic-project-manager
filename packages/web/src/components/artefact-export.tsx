'use client';

import { Copy, Download, FileText, FileJson } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  artefactToMarkdown,
  copyToClipboard,
  allArtefactsToMarkdown,
} from '@/lib/export';
import { useToast } from '@/lib/hooks/use-toast';
import type { ArtefactType } from '@/types';

interface ArtefactExportProps {
  artefacts: Array<{ type: ArtefactType; content: unknown }>;
  projectName?: string;
}

export function ArtefactExport({ artefacts, projectName }: ArtefactExportProps) {
  const { toast } = useToast();

  const handleCopyMarkdown = async () => {
    const markdown = allArtefactsToMarkdown(artefacts);
    const success = await copyToClipboard(markdown);
    toast({
      title: success ? 'Copied to clipboard' : 'Copy failed',
      description: success ? 'All artefacts copied as markdown' : 'Please try again',
      variant: success ? 'default' : 'destructive',
    });
  };

  const handleCopyJson = async () => {
    const json = JSON.stringify(
      artefacts.reduce(
        (acc, a) => {
          acc[a.type] = typeof a.content === 'string' ? JSON.parse(a.content) : a.content;
          return acc;
        },
        {} as Record<string, unknown>
      ),
      null,
      2
    );
    const success = await copyToClipboard(json);
    toast({
      title: success ? 'Copied to clipboard' : 'Copy failed',
      description: success ? 'All artefacts copied as JSON' : 'Please try again',
      variant: success ? 'default' : 'destructive',
    });
  };

  const handleDownloadMarkdown = () => {
    const markdown = allArtefactsToMarkdown(artefacts);
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName || 'artefacts'}-${new Date().toISOString().split('T')[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Downloaded', description: 'Artefacts downloaded as markdown' });
  };

  const handleDownloadJson = () => {
    const json = JSON.stringify(
      artefacts.reduce(
        (acc, a) => {
          acc[a.type] = typeof a.content === 'string' ? JSON.parse(a.content) : a.content;
          return acc;
        },
        {} as Record<string, unknown>
      ),
      null,
      2
    );
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName || 'artefacts'}-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Downloaded', description: 'Artefacts downloaded as JSON' });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleCopyMarkdown}>
          <Copy className="mr-2 h-4 w-4" />
          Copy as Markdown
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleCopyJson}>
          <FileJson className="mr-2 h-4 w-4" />
          Copy as JSON
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleDownloadMarkdown}>
          <FileText className="mr-2 h-4 w-4" />
          Download Markdown
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleDownloadJson}>
          <FileJson className="mr-2 h-4 w-4" />
          Download JSON
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
