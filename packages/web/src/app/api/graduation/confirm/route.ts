import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import { confirmGraduationSchema } from '@/schemas/api';

/**
 * Graduation confirmation response
 */
interface GraduationConfirmResponse {
  success: boolean;
  previousLevel: number;
  newLevel: number;
  message: string;
  graduatedAt: string;
}

/**
 * POST /api/graduation/confirm
 *
 * Confirms graduation to the next autonomy level.
 * This is a significant action that increases the agent's
 * ability to act autonomously.
 *
 * Body:
 * - targetLevel: number (2 or 3)
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const body = await request.json();
    const result = confirmGraduationSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.flatten() }, { status: 400 });
    }

    const { targetLevel } = result.data;

    // In production, this would:
    // 1. Validate graduation criteria are still met
    // 2. Update autonomy level in DynamoDB
    // 3. Log the graduation event
    // 4. Notify the agent of the level change

    // For demo purposes, simulate graduation
    const previousLevel = targetLevel - 1;
    const newLevel = targetLevel;
    const graduatedAt = new Date().toISOString();

    const response: GraduationConfirmResponse = {
      success: true,
      previousLevel,
      newLevel,
      message: `Successfully graduated from Level ${previousLevel} to Level ${newLevel}`,
      graduatedAt,
    };

    // Log graduation event (in production this would persist to DynamoDB)
    console.log('Graduation confirmed:', {
      previousLevel,
      newLevel,
      graduatedAt,
      user: session.user?.email,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error confirming graduation:', error);
    return NextResponse.json(
      { error: 'Failed to confirm graduation' },
      { status: 500 }
    );
  }
}
