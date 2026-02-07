import {
  ArtefactRepository,
  EventRepository,
  ProjectRepository,
} from '@agentic-pm/core/db/repositories';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import { unauthorised, badRequest, internalError } from '@/lib/api-error';
import { getDbClient } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return unauthorised();

    const body = await request.json();
    const { question, projectId } = body;

    if (!question || typeof question !== 'string') {
      return badRequest('Question is required');
    }

    const db = getDbClient();
    const artefactRepo = new ArtefactRepository(db);
    const eventRepo = new EventRepository(db);
    const projectRepo = new ProjectRepository(db);

    // Get project context
    const contextParts: string[] = [];

    if (projectId) {
      // Get artefacts for the specific project
      const artefacts = await artefactRepo.getAllForProject(projectId);
      for (const art of artefacts) {
        contextParts.push(
          `## ${art.type}\n${JSON.stringify(art.content, null, 2)}`
        );
      }

      // Get recent events
      const today = new Date().toISOString().split('T')[0]!;
      const events = await eventRepo.getByDate(today, { limit: 50 });
      const projectEvents = events.items.filter(
        (e) => e.projectId === projectId
      );
      if (projectEvents.length > 0) {
        contextParts.push(
          `## Recent Events\n${projectEvents.map((e) => `- [${e.severity}] ${e.summary}`).join('\n')}`
        );
      }
    } else {
      // Get all active projects
      const projects = await projectRepo.getActive({ limit: 10 });
      contextParts.push(
        `Active projects: ${projects.items.map((p) => p.name).join(', ')}`
      );
    }

    // For now, return a structured answer without LLM call
    // This avoids budget concerns and keeps the feature functional
    const answer = generateDeterministicAnswer(question, contextParts);

    return NextResponse.json({
      question,
      answer,
      projectId,
      contextUsed: contextParts.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Query error:', error);
    return internalError('Failed to process query');
  }
}

function generateDeterministicAnswer(
  question: string,
  context: string[]
): string {
  const lowerQ = question.toLowerCase();
  const contextStr = context.join('\n');

  if (lowerQ.includes('blocker') || lowerQ.includes('blocked')) {
    // Extract blockers from context
    const blockerMatch = contextStr.match(/"blockers":\s*\[(.*?)\]/s);
    if (blockerMatch) {
      return `Based on the current delivery state, here are the blockers:\n${blockerMatch[1]}`;
    }
    return 'No blockers currently recorded in the delivery state artefact.';
  }

  if (lowerQ.includes('risk')) {
    return `Here is the current project context that may help answer your question about risks:\n\n${context.slice(0, 2).join('\n\n')}`;
  }

  if (lowerQ.includes('status') || lowerQ.includes('how')) {
    return `Here is the current project state:\n\n${context.slice(0, 2).join('\n\n')}`;
  }

  return `Here is the relevant project context:\n\n${context.join('\n\n')}\n\nNote: Full AI-powered answers will be available in a future update.`;
}
