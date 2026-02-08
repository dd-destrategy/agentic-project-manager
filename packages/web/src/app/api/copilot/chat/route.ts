import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/copilot/chat
 *
 * Proxies chat messages to the PM Copilot agent dev-server.
 * In production this would call AgentCore Runtime; locally it
 * calls the dev-server running on port 3001.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { sessionId, projectId, message, isBackground } = body as {
    sessionId: string;
    projectId: string;
    message: string;
    isBackground?: boolean;
  };

  if (!message?.trim()) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }

  const copilotUrl = process.env.COPILOT_URL ?? 'http://localhost:3001';

  const response = await fetch(`${copilotUrl}/invoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: sessionId || `web-${Date.now()}`,
      projectId: projectId || 'proj-atlas-001',
      message,
      isBackground: isBackground ?? false,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    return NextResponse.json(
      { error: `Copilot error: ${text}` },
      { status: response.status }
    );
  }

  const data = await response.json();
  return NextResponse.json(data);
}
