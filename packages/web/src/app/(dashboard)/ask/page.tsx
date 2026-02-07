'use client';

import { useState } from 'react';
import { Loader2, Send, MessageSquare, HelpCircle } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useProjectQuery } from '@/lib/hooks/use-query-project';
import { useProjects } from '@/lib/hooks';

interface ConversationEntry {
  id: string;
  question: string;
  answer: string;
  projectId?: string;
  contextUsed: number;
  timestamp: string;
}

export default function AskPage() {
  const [question, setQuestion] = useState('');
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [history, setHistory] = useState<ConversationEntry[]>([]);

  const queryMutation = useProjectQuery();
  const { data: projectsData } = useProjects();
  const projects = projectsData?.projects ?? [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || queryMutation.isPending) return;

    queryMutation.mutate(
      {
        question: question.trim(),
        projectId: selectedProject || undefined,
      },
      {
        onSuccess: (data) => {
          setHistory((prev) => [
            {
              id: crypto.randomUUID(),
              question: data.question,
              answer: data.answer,
              projectId: data.projectId,
              contextUsed: data.contextUsed,
              timestamp: data.timestamp,
            },
            ...prev,
          ]);
          setQuestion('');
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Ask Your Project</h1>
        <p className="text-sm text-muted-foreground">
          Ask questions about your projects and get answers based on current
          artefacts and events.
        </p>
      </div>

      {/* Query Form */}
      <Card variant="glass">
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="project-select"
                className="text-sm font-medium text-muted-foreground"
              >
                Project (optional)
              </label>
              <select
                id="project-select"
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">All projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <Input
                id="question-input"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. What are the current blockers? What risks are open?"
                disabled={queryMutation.isPending}
                aria-label="Question"
              />
              <Button
                type="submit"
                disabled={!question.trim() || queryMutation.isPending}
                aria-label="Ask question"
              >
                {queryMutation.isPending ? (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Send className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Conversation History */}
      {history.length === 0 ? (
        <Card variant="glass">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <HelpCircle
              className="mb-4 h-12 w-12 text-muted-foreground/30"
              aria-hidden="true"
            />
            <h3 className="text-lg font-medium text-muted-foreground">
              Ask a question to get started
            </h3>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Try asking about blockers, risks, project status, or recent
              activity. Answers are based on your current project artefacts.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {history.map((entry) => (
            <Card key={entry.id} variant="glass">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare
                      className="h-4 w-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <CardTitle className="text-base">
                      {entry.question}
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    {entry.projectId && (
                      <Badge variant="outline" className="text-xs">
                        {projects.find((p) => p.id === entry.projectId)?.name ??
                          entry.projectId}
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-xs">
                      {entry.contextUsed} source
                      {entry.contextUsed !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                </div>
                <CardDescription>
                  {new Date(entry.timestamp).toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="whitespace-pre-wrap text-sm">{entry.answer}</pre>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
