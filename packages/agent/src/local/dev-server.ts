/**
 * Local Development Server
 *
 * Mirrors the AgentCore Runtime HTTP API surface so the full
 * copilot stack runs locally. Same endpoints, same request/response
 * shapes, same session management.
 *
 * Production:  AgentCore Runtime (microVM per session)
 * Local:       This server (Node.js HTTP, in-memory sessions)
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... npx tsx src/local/dev-server.ts
 *   # or without an API key for canned responses:
 *   npx tsx src/local/dev-server.ts
 *
 * Endpoints:
 *   POST /invoke       — process a user message (same as AgentCore)
 *   GET  /ping         — health check (same as AgentCore)
 *   GET  /sessions     — list active sessions (dev-only)
 *   DELETE /sessions/:id — terminate a session (dev-only)
 */

import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';

import { EnsembleOrchestrator } from '../ensemble/orchestrator.js';
import type { SessionState } from '../ensemble/orchestrator.js';
import { InMemoryStore } from '../memory/index.js';
import { CopilotRuntime, SessionManager } from '../runtime/index.js';

import { MockLlm } from './mock-llm.js';
import { MockToolExecutor } from './mock-tools.js';

// ─── Configuration ─────────────────────────────────────────────

const PORT = parseInt(process.env.COPILOT_PORT ?? '3001', 10);
const LLM_MODE = process.env.ANTHROPIC_API_KEY ? 'live' : 'canned';

// ─── Shared Dependencies ───────────────────────────────────────

const llm = new MockLlm({
  mode: LLM_MODE as 'live' | 'canned',
  recordCalls: true,
});

const tools = new MockToolExecutor({ verbose: true });
const memory = new InMemoryStore();

// Seed memory with some project knowledge (simulates LTM)
memory.addMemory(
  'Project Atlas uses 2-week sprints starting on Mondays',
  'semantic'
);
memory.addMemory(
  'Sarah Chen is the project sponsor. Prefers email, formal tone.',
  'semantic'
);
memory.addMemory(
  'Jamie Park is the DevOps lead. Direct communicator.',
  'semantic'
);
memory.addMemory(
  'Acme Studios is the design vendor. Has missed 3 of 5 delivery dates.',
  'semantic'
);
memory.addMemory(
  'On Project Beacon in November 2025, a similar vendor delay was handled by ' +
    'communicating proactively. The sponsor responded positively to early warning. ' +
    'Delivered on revised date (19 Nov instead of 1 Nov).',
  'episodic'
);
memory.addMemory(
  'User prefers scope reduction over timeline extension when forced to choose.',
  'preference'
);
memory.addMemory(
  'User writes concise emails with bullet points. No hedging.',
  'preference'
);
memory.setSessionSummary(
  'Friday session: Reviewed sprint 14 progress (62%). Discussed Acme vendor ' +
    'delay (3rd miss). Approved Phase 2 scope reduction. Updated RAID log.'
);

// ─── Session Factory ───────────────────────────────────────────

function createOrchestrator(session: SessionState): EnsembleOrchestrator {
  return new EnsembleOrchestrator({
    llm,
    tools,
    memory,
    session,
  });
}

const sessionManager = new SessionManager(createOrchestrator);
const runtime = new CopilotRuntime({ sessionManager, version: '0.1.0-local' });

// ─── HTTP Server ───────────────────────────────────────────────

function parseBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data, null, 2));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, null);
    return;
  }

  try {
    // POST /invoke — main agent invocation (mirrors AgentCore)
    if (req.method === 'POST' && url.pathname === '/invoke') {
      const body = JSON.parse(await parseBody(req));
      const { runtimeSessionId, input, projectId, isBackground } = body as {
        runtimeSessionId?: string;
        input?: string;
        projectId?: string;
        isBackground?: boolean;
      };

      if (!input) {
        sendJson(res, 400, { error: 'Missing required field: input' });
        return;
      }

      const sessionId = runtimeSessionId ?? `local-${Date.now()}`;

      console.log(`\n${'─'.repeat(60)}`);
      console.log(
        `[Session: ${sessionId}] ${isBackground ? '(background)' : '(interactive)'}`
      );
      console.log(`[Input] ${input.substring(0, 200)}`);
      console.log(`${'─'.repeat(60)}`);

      const startMs = Date.now();
      const result = await runtime.invoke({
        runtimeSessionId: sessionId,
        input,
        projectId,
        isBackground,
      });

      const durationMs = Date.now() - startMs;

      console.log(
        `[Response] (${durationMs}ms, mode: ${result.response.mode})`
      );
      console.log(result.response.message.substring(0, 300));
      if (result.response.challenge) {
        console.log(`[Challenge] ${result.response.challenge.question}`);
      }
      console.log(`${'─'.repeat(60)}\n`);

      sendJson(res, 200, result);
      return;
    }

    // GET /ping — health check (mirrors AgentCore)
    if (req.method === 'GET' && url.pathname === '/ping') {
      sendJson(res, 200, runtime.health());
      return;
    }

    // GET /sessions — list active sessions (dev-only)
    if (req.method === 'GET' && url.pathname === '/sessions') {
      sendJson(res, 200, {
        sessions: sessionManager.listSessions(),
        count: sessionManager.activeCount(),
      });
      return;
    }

    // DELETE /sessions/:id — terminate session (dev-only)
    if (req.method === 'DELETE' && url.pathname.startsWith('/sessions/')) {
      const sessionId = url.pathname.split('/sessions/')[1];
      const terminated = runtime.terminateSession(sessionId);
      sendJson(res, 200, { terminated, sessionId });
      return;
    }

    // GET /debug/llm-calls — inspect LLM call history (dev-only)
    if (req.method === 'GET' && url.pathname === '/debug/llm-calls') {
      sendJson(res, 200, {
        totalCalls: llm.getCallCount(),
        calls: llm.getCalls().map((c) => ({
          model: c.model,
          userMessage: c.userMessage.substring(0, 100),
          responsePreview: c.response.substring(0, 200),
          timestamp: new Date(c.timestamp).toISOString(),
        })),
      });
      return;
    }

    // GET /debug/tool-calls — inspect tool call history (dev-only)
    if (req.method === 'GET' && url.pathname === '/debug/tool-calls') {
      sendJson(res, 200, {
        calls: tools.getCallLog(),
      });
      return;
    }

    // GET /debug/memory — inspect memory state (dev-only)
    if (req.method === 'GET' && url.pathname === '/debug/memory') {
      const allMemories = await memory.retrieveRelevant('', 100);
      sendJson(res, 200, {
        memories: allMemories,
        events: memory.getEvents(),
        sessionSummary: await memory.getLastSessionSummary(),
      });
      return;
    }

    sendJson(res, 404, { error: `Not found: ${req.method} ${url.pathname}` });
  } catch (err) {
    console.error('[Error]', err);
    sendJson(res, 500, {
      error: err instanceof Error ? err.message : 'Internal server error',
    });
  }
});

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║  PM Copilot — Local Development Server                   ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  URL:        http://localhost:${String(PORT).padEnd(29)}║
║  LLM Mode:   ${String(LLM_MODE).padEnd(41)}║
║  Tools:      Mock (fake project data)                    ║
║  Memory:     In-memory (seeded with project context)     ║
║                                                          ║
║  Endpoints:                                              ║
║    POST /invoke          Agent invocation                ║
║    GET  /ping            Health check                    ║
║    GET  /sessions        List active sessions            ║
║    GET  /debug/llm-calls LLM call history                ║
║    GET  /debug/tool-calls Tool call history              ║
║    GET  /debug/memory    Memory state                    ║
║                                                          ║
║  Try it:                                                 ║
║    curl -X POST http://localhost:${PORT}/invoke \\          ║
║      -H "Content-Type: application/json" \\               ║
║      -d '{"input":"What is the state of Atlas?"}'        ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
  `);
});
