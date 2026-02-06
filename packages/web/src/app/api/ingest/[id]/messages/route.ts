import { DynamoDBClient } from '@agentic-pm/core/db';
import { IngestionSessionRepository } from '@agentic-pm/core/db/repositories';
import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { ulid } from 'ulid';

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import { sendIngestionMessageSchema } from '@/schemas/ingest';

const SYSTEM_PROMPT = `You are a project management assistant embedded in the Agentic PM Workbench.
The user is pasting screenshots, chat logs, emails, or other project-related content for you to analyse.

Your role:
1. **Extract key information** — identify action items, risks, decisions, blockers, status updates, and stakeholder requests from whatever the user shares.
2. **Summarise clearly** — provide concise, structured summaries. Use bullet points and headings.
3. **Suggest next steps** — recommend what should be updated in the PM artefacts (RAID log, delivery state, backlog, decision log).
4. **Ask clarifying questions** — if the content is ambiguous or you need more context, ask.
5. **Support conversation** — the user may want to discuss the content, refine their understanding, or decide on actions. Be collaborative.

When analysing screenshots or images:
- Describe what you see in the image
- Extract any text, data, or status information visible
- Identify the source tool if recognisable (Jira, Teams, Outlook, Slack, etc.)

Keep responses focused and actionable. Use British English spelling. Do not make up information that isn't visible in the shared content.`;

/**
 * Build the Anthropic messages array from session history + new message
 */
function buildMessages(
  sessionMessages: Array<{
    role: 'user' | 'assistant';
    content: string;
    attachments?: Array<{ mimeType: string; dataUrl: string }>;
  }>,
  newContent: string,
  newAttachments?: Array<{ mimeType: string; dataUrl: string }>
): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [];

  // Add existing conversation history
  for (const msg of sessionMessages) {
    if (msg.role === 'user') {
      const contentBlocks: (
        | Anthropic.TextBlockParam
        | Anthropic.ImageBlockParam
      )[] = [];

      // Add image attachments
      if (msg.attachments?.length) {
        for (const att of msg.attachments) {
          const base64Data = att.dataUrl.replace(
            /^data:image\/\w+;base64,/,
            ''
          );
          contentBlocks.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: att.mimeType as
                | 'image/png'
                | 'image/jpeg'
                | 'image/gif'
                | 'image/webp',
              data: base64Data,
            },
          });
        }
      }

      contentBlocks.push({ type: 'text', text: msg.content });
      messages.push({ role: 'user', content: contentBlocks });
    } else {
      messages.push({ role: 'assistant', content: msg.content });
    }
  }

  // Add the new user message
  const newContentBlocks: (
    | Anthropic.TextBlockParam
    | Anthropic.ImageBlockParam
  )[] = [];

  if (newAttachments?.length) {
    for (const att of newAttachments) {
      const base64Data = att.dataUrl.replace(/^data:image\/\w+;base64,/, '');
      newContentBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: att.mimeType as
            | 'image/png'
            | 'image/jpeg'
            | 'image/gif'
            | 'image/webp',
          data: base64Data,
        },
      });
    }
  }

  newContentBlocks.push({ type: 'text', text: newContent });
  messages.push({ role: 'user', content: newContentBlocks });

  return messages;
}

/**
 * POST /api/ingest/[id]/messages
 *
 * Send a message (with optional image attachments) to an ingestion session.
 * The AI processes the content and responds.
 *
 * Body: { content: string, attachments?: Array<{ id, mimeType, dataUrl, filename? }> }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const parseResult = sendIngestionMessageSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { content, attachments } = parseResult.data;

    // Fetch the existing session
    const db = new DynamoDBClient();
    const repo = new IngestionSessionRepository(db);

    const ingestionSession = await repo.getById(id);
    if (!ingestionSession) {
      return NextResponse.json(
        { error: 'Ingestion session not found' },
        { status: 404 }
      );
    }

    // Create the user message record
    const userMessage = {
      id: ulid(),
      role: 'user' as const,
      content,
      attachments: attachments?.map((a) => ({
        id: a.id,
        mimeType: a.mimeType,
        dataUrl: a.dataUrl,
        filename: a.filename,
      })),
      createdAt: new Date().toISOString(),
    };

    // Build messages for Claude API call
    const anthropicMessages = buildMessages(
      ingestionSession.messages,
      content,
      attachments
    );

    // Call Claude API
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'LLM API key not configured' },
        { status: 500 }
      );
    }

    const anthropic = new Anthropic({ apiKey });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250514',
      max_tokens: 4096,
      temperature: 0.3,
      system: SYSTEM_PROMPT,
      messages: anthropicMessages,
    });

    // Extract text response
    const assistantContent = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    const assistantMessage = {
      id: ulid(),
      role: 'assistant' as const,
      content: assistantContent,
      createdAt: new Date().toISOString(),
    };

    // Store both messages — but strip image data from stored attachments
    // to keep DynamoDB item size manageable. We keep the metadata only.
    const storedUserMessage = {
      ...userMessage,
      attachments: userMessage.attachments?.map((a) => ({
        id: a.id,
        mimeType: a.mimeType,
        dataUrl: '', // Strip base64 data for storage
        filename: a.filename,
      })),
    };

    await repo.addMessages(id, [storedUserMessage, assistantMessage]);

    return NextResponse.json({
      userMessage,
      assistantMessage,
    });
  } catch (error) {
    console.error('Error processing ingestion message:', error);

    if (error instanceof Anthropic.AuthenticationError) {
      return NextResponse.json(
        { error: 'LLM authentication failed. Check API key configuration.' },
        { status: 500 }
      );
    }

    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: 'LLM rate limited. Please try again shortly.' },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to process message' },
      { status: 500 }
    );
  }
}
