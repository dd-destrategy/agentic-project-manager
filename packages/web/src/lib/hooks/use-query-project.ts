'use client';

import { useMutation } from '@tanstack/react-query';

interface QueryResult {
  question: string;
  answer: string;
  projectId?: string;
  contextUsed: number;
  timestamp: string;
}

export function useProjectQuery() {
  return useMutation({
    mutationFn: async ({
      question,
      projectId,
    }: {
      question: string;
      projectId?: string;
    }): Promise<QueryResult> => {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, projectId }),
      });
      if (!res.ok) throw new Error('Failed to query');
      return res.json();
    },
  });
}
