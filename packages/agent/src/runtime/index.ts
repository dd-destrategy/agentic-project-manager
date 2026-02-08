/**
 * AgentCore Runtime Entry Point
 *
 * Handles HTTP endpoints required by AgentCore Runtime:
 * - POST /invoke — process a user message or background cycle
 * - GET /ping — health check
 *
 * In production, this runs inside a Docker container deployed
 * to AgentCore Runtime. For development, it can run as a
 * standalone HTTP server.
 */

import { EnsembleOrchestrator } from '../ensemble/orchestrator.js';
import type { SessionState } from '../ensemble/orchestrator.js';
import type { CopilotResponse } from '../ensemble/types.js';

// ─── Request / Response Types ──────────────────────────────────

export interface InvokeRequest {
  runtimeSessionId: string;
  input: string;
  projectId?: string;
  isBackground?: boolean;
}

export interface InvokeResponse {
  sessionId: string;
  response: CopilotResponse;
}

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  activeSessions: number;
}

// ─── Session Manager ───────────────────────────────────────────

/**
 * Manages active orchestrator sessions. AgentCore Runtime provides
 * session isolation at the microVM level — this layer maps
 * session IDs to orchestrator instances.
 */
export class SessionManager {
  private sessions = new Map<string, EnsembleOrchestrator>();
  private readonly orchestratorFactory: (
    session: SessionState
  ) => EnsembleOrchestrator;

  constructor(factory: (session: SessionState) => EnsembleOrchestrator) {
    this.orchestratorFactory = factory;
  }

  getOrCreate(sessionId: string, projectId?: string): EnsembleOrchestrator {
    let orchestrator = this.sessions.get(sessionId);
    if (!orchestrator) {
      const session: SessionState = {
        sessionId,
        projectId,
        turns: [],
      };
      orchestrator = this.orchestratorFactory(session);
      this.sessions.set(sessionId, orchestrator);
    }
    return orchestrator;
  }

  terminate(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  activeCount(): number {
    return this.sessions.size;
  }

  listSessions(): string[] {
    return Array.from(this.sessions.keys());
  }
}

// ─── Runtime Handler ───────────────────────────────────────────

export class CopilotRuntime {
  private readonly sessionManager: SessionManager;
  private readonly startTime = Date.now();
  private readonly version: string;

  constructor(deps: { sessionManager: SessionManager; version?: string }) {
    this.sessionManager = deps.sessionManager;
    this.version = deps.version ?? '0.1.0';
  }

  /**
   * Handle an invoke request — the main entry point for both
   * interactive and background invocations.
   */
  async invoke(request: InvokeRequest): Promise<InvokeResponse> {
    const orchestrator = this.sessionManager.getOrCreate(
      request.runtimeSessionId,
      request.projectId
    );

    const response = await orchestrator.processMessage(request.input, {
      isBackground: request.isBackground,
    });

    return {
      sessionId: request.runtimeSessionId,
      response,
    };
  }

  /**
   * Health check endpoint (GET /ping).
   */
  health(): HealthResponse {
    return {
      status: 'healthy',
      version: this.version,
      uptime: Date.now() - this.startTime,
      activeSessions: this.sessionManager.activeCount(),
    };
  }

  /**
   * Terminate a session explicitly.
   */
  terminateSession(sessionId: string): boolean {
    return this.sessionManager.terminate(sessionId);
  }
}
