import { DynamoDBClient } from '@agentic-pm/core/db';
import {
  IngestionSessionRepository,
  ExtractedItemRepository,
} from '@agentic-pm/core/db/repositories';
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

IMPORTANT: Whenever you identify concrete PM items (risks, action items, decisions, blockers, status updates, dependencies, or stakeholder requests), you MUST call the extract_items tool to capture them as structured data. Always call extract_items alongside your conversational response when there are items to extract. Each item needs a type, title, content, target artefact, and priority.

Keep responses focused and actionable. Use British English spelling. Do not make up information that isn't visible in the shared content.`;

/** Tool definition for structured item extraction */
const EXTRACT_ITEMS_TOOL: Anthropic.Tool = {
  name: 'extract_items',
  description:
    "Extract structured PM items from the conversation. Call this whenever you identify actionable items like risks, action items, decisions, blockers, status updates, dependencies, or stakeholder requests in the user's content. Each item will be added to a review queue for the PM to approve before applying to artefacts.",
  input_schema: {
    type: 'object' as const,
    properties: {
      items: {
        type: 'array',
        description: 'List of extracted PM items',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: [
                'risk',
                'action_item',
                'decision',
                'blocker',
                'status_update',
                'dependency',
                'stakeholder_request',
              ],
              description: 'Category of the extracted item',
            },
            title: {
              type: 'string',
              description: 'One-line summary of the item (max 120 chars)',
            },
            content: {
              type: 'string',
              description:
                'Full detail including context, impact, and any relevant specifics',
            },
            target_artefact: {
              type: 'string',
              enum: [
                'raid_log',
                'delivery_state',
                'backlog_summary',
                'decision_log',
              ],
              description: 'Which PM artefact this item should be added to',
            },
            priority: {
              type: 'string',
              enum: ['critical', 'high', 'medium', 'low'],
              description: 'Urgency / importance of the item',
            },
          },
          required: ['type', 'title', 'content', 'target_artefact', 'priority'],
        },
      },
    },
    required: ['items'],
  },
};

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

  for (const msg of sessionMessages) {
    if (msg.role === 'user') {
      const contentBlocks: (
        | Anthropic.TextBlockParam
        | Anthropic.ImageBlockParam
      )[] = [];

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
 * The AI processes the content, responds conversationally, and extracts
 * structured PM items via tool-use.
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

    const db = new DynamoDBClient();
    const sessionRepo = new IngestionSessionRepository(db);
    const extractRepo = new ExtractedItemRepository(db);

    const ingestionSession = await sessionRepo.getById(id);
    if (!ingestionSession) {
      return NextResponse.json(
        { error: 'Ingestion session not found' },
        { status: 404 }
      );
    }

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

    const anthropicMessages = buildMessages(
      ingestionSession.messages,
      content,
      attachments
    );

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'LLM API key not configured' },
        { status: 500 }
      );
    }

    const anthropic = new Anthropic({ apiKey });

    // Call Claude with tools — model responds with text AND calls extract_items
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250514',
      max_tokens: 4096,
      temperature: 0.3,
      system: SYSTEM_PROMPT,
      messages: anthropicMessages,
      tools: [EXTRACT_ITEMS_TOOL],
      tool_choice: { type: 'auto' },
    });

    // Parse response: text blocks for conversation, tool_use blocks for extraction
    const textParts: string[] = [];
    let extractedRawItems: Array<{
      type: string;
      title: string;
      content: string;
      target_artefact: string;
      priority: string;
    }> = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        textParts.push(block.text);
      } else if (block.type === 'tool_use' && block.name === 'extract_items') {
        const input = block.input as { items?: typeof extractedRawItems };
        if (input.items && Array.isArray(input.items)) {
          extractedRawItems = input.items;
        }
      }
    }

    const assistantContent =
      textParts.join('\n') || 'I have extracted the items from your content.';

    const assistantMessage = {
      id: ulid(),
      role: 'assistant' as const,
      content: assistantContent,
      createdAt: new Date().toISOString(),
    };

    // Store messages (strip base64 from stored attachments)
    const storedUserMessage = {
      ...userMessage,
      attachments: userMessage.attachments?.map((a) => ({
        id: a.id,
        mimeType: a.mimeType,
        dataUrl: '',
        filename: a.filename,
      })),
    };

    await sessionRepo.addMessages(id, [storedUserMessage, assistantMessage]);

    // Persist extracted items to DynamoDB
    const savedItems = [];
    if (extractedRawItems.length > 0) {
      const createOptions = extractedRawItems.map((raw) => ({
        sessionId: id,
        messageId: assistantMessage.id,
        type: raw.type as
          | 'risk'
          | 'action_item'
          | 'decision'
          | 'blocker'
          | 'status_update'
          | 'dependency'
          | 'stakeholder_request',
        title: raw.title,
        content: raw.content,
        targetArtefact: raw.target_artefact as
          | 'raid_log'
          | 'delivery_state'
          | 'backlog_summary'
          | 'decision_log',
        priority: raw.priority as 'critical' | 'high' | 'medium' | 'low',
        projectId: ingestionSession.projectId,
      }));

      const created = await extractRepo.createBatch(createOptions);
      savedItems.push(...created);
    }

    return NextResponse.json({
      userMessage,
      assistantMessage,
      extractedItems: savedItems.length > 0 ? savedItems : undefined,
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
