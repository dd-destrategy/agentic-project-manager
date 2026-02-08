/**
 * Memory Interface
 *
 * Defines the contract for AgentCore Memory integration.
 * In production, this wraps the AgentCore Memory SDK.
 * For development/testing, an in-memory implementation is provided.
 */

import type { MemoryStore, MemoryRecord } from '../ensemble/orchestrator.js';

export type { MemoryStore, MemoryRecord };

// ─── In-Memory Implementation (dev/testing) ────────────────────

export class InMemoryStore implements MemoryStore {
  private records: MemoryRecord[] = [];
  private events: Array<{
    event: string;
    metadata?: Record<string, unknown>;
    timestamp: number;
  }> = [];
  private sessionSummary: string | null = null;

  async retrieveRelevant(query: string, limit = 5): Promise<MemoryRecord[]> {
    // Simple keyword matching for development — AgentCore Memory
    // uses semantic search in production
    const queryTerms = query
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(Boolean);

    return this.records
      .map((record) => {
        const contentLower = record.content.toLowerCase();
        const matchCount = queryTerms.filter((term) =>
          contentLower.includes(term)
        ).length;
        return {
          ...record,
          relevanceScore: matchCount / Math.max(queryTerms.length, 1),
        };
      })
      .filter((r) => r.relevanceScore > 0)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit);
  }

  async getLastSessionSummary(): Promise<string | null> {
    return this.sessionSummary;
  }

  async recordEvent(
    event: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    this.events.push({ event, metadata, timestamp: Date.now() });
  }

  // ─── Test Helpers ──────────────────────────────────────────

  addMemory(content: string, type: MemoryRecord['type']): void {
    this.records.push({
      content,
      type,
      relevanceScore: 0,
      createdAt: new Date().toISOString(),
    });
  }

  setSessionSummary(summary: string): void {
    this.sessionSummary = summary;
  }

  getEvents(): typeof this.events {
    return [...this.events];
  }

  clear(): void {
    this.records = [];
    this.events = [];
    this.sessionSummary = null;
  }
}
