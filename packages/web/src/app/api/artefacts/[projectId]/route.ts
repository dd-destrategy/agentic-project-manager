import { DynamoDBClient } from '@agentic-pm/core/db';
import { ArtefactRepository } from '@agentic-pm/core/db/repositories';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import type { ArtefactType } from '@/types';

interface Artefact {
  id: string;
  projectId: string;
  type: ArtefactType;
  content: string;
  previousVersion?: string;
  version: number;
  updatedAt: string;
  createdAt: string;
}

interface ArtefactsResponse {
  artefacts: Artefact[];
  projectId: string;
}

/**
 * GET /api/artefacts/[projectId]
 *
 * Returns all artefacts for a specific project.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    // Verify authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { projectId } = await params;

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    // Fetch real artefacts from DynamoDB
    const db = new DynamoDBClient();
    const artefactRepo = new ArtefactRepository(db);

    const artefactsFromDb = await artefactRepo.getAllForProject(projectId);

    // Map repository entities to API response format
    const mappedArtefacts: Artefact[] = artefactsFromDb.map((art) => ({
      id: art.id,
      projectId: art.projectId,
      type: art.type,
      content: JSON.stringify(art.content),
      previousVersion: art.previousVersion ? JSON.stringify(art.previousVersion) : undefined,
      version: art.version,
      updatedAt: art.updatedAt,
      createdAt: art.createdAt,
    }));

    const response: ArtefactsResponse = {
      artefacts: mappedArtefacts,
      projectId,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching artefacts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch artefacts' },
      { status: 500 }
    );
  }
}
