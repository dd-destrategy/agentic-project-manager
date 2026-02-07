/**
 * Stakeholder Extractor Tests
 *
 * Tests for deterministic actor extraction from Jira and Outlook signals.
 */

import { describe, it, expect } from 'vitest';
import {
  extractActorsFromJiraSignal,
  extractActorsFromOutlookSignal,
} from '../stakeholder-extractor.js';

describe('extractActorsFromJiraSignal', () => {
  it('should extract assignee from Jira signal', () => {
    const signal = {
      assignee: {
        displayName: 'Alice Smith',
        emailAddress: 'alice@example.com',
      },
    };

    const actors = extractActorsFromJiraSignal(signal);

    expect(actors).toHaveLength(1);
    expect(actors[0]).toEqual({
      name: 'Alice Smith',
      email: 'alice@example.com',
      role: 'assignee',
      source: 'jira',
      actionType: 'assigned',
    });
  });

  it('should extract reporter from Jira signal', () => {
    const signal = {
      reporter: {
        displayName: 'Bob Jones',
        emailAddress: 'bob@example.com',
      },
    };

    const actors = extractActorsFromJiraSignal(signal);

    expect(actors).toHaveLength(1);
    expect(actors[0]).toEqual({
      name: 'Bob Jones',
      email: 'bob@example.com',
      role: 'reporter',
      source: 'jira',
      actionType: 'reported',
    });
  });

  it('should extract comment author from Jira signal', () => {
    const signal = {
      author: {
        displayName: 'Carol White',
        emailAddress: 'carol@example.com',
      },
    };

    const actors = extractActorsFromJiraSignal(signal);

    expect(actors).toHaveLength(1);
    expect(actors[0]).toEqual({
      name: 'Carol White',
      email: 'carol@example.com',
      role: 'commenter',
      source: 'jira',
      actionType: 'commented',
    });
  });

  it('should extract multiple actors from a single signal', () => {
    const signal = {
      assignee: {
        displayName: 'Alice Smith',
        emailAddress: 'alice@example.com',
      },
      reporter: {
        displayName: 'Bob Jones',
        emailAddress: 'bob@example.com',
      },
      author: {
        displayName: 'Carol White',
        emailAddress: 'carol@example.com',
      },
    };

    const actors = extractActorsFromJiraSignal(signal);

    expect(actors).toHaveLength(3);
    expect(actors.map((a) => a.name)).toEqual([
      'Alice Smith',
      'Bob Jones',
      'Carol White',
    ]);
  });

  it('should return empty array for empty signal', () => {
    const actors = extractActorsFromJiraSignal({});

    expect(actors).toHaveLength(0);
  });

  it('should skip fields without displayName', () => {
    const signal = {
      assignee: { emailAddress: 'no-name@example.com' },
      reporter: 'not-an-object',
    };

    const actors = extractActorsFromJiraSignal(signal);

    expect(actors).toHaveLength(0);
  });

  it('should handle missing email gracefully', () => {
    const signal = {
      assignee: { displayName: 'No Email Person' },
    };

    const actors = extractActorsFromJiraSignal(signal);

    expect(actors).toHaveLength(1);
    expect(actors[0]!.name).toBe('No Email Person');
    expect(actors[0]!.email).toBeUndefined();
  });
});

describe('extractActorsFromOutlookSignal', () => {
  it('should extract sender from Outlook signal', () => {
    const signal = {
      from: {
        emailAddress: {
          name: 'David Brown',
          address: 'david@example.com',
        },
      },
    };

    const actors = extractActorsFromOutlookSignal(signal);

    expect(actors).toHaveLength(1);
    expect(actors[0]).toEqual({
      name: 'David Brown',
      email: 'david@example.com',
      role: 'sender',
      source: 'outlook',
      actionType: 'emailed',
    });
  });

  it('should return empty array for empty signal', () => {
    const actors = extractActorsFromOutlookSignal({});

    expect(actors).toHaveLength(0);
  });

  it('should return empty array when from has no emailAddress', () => {
    const signal = {
      from: { someOtherField: 'value' },
    };

    const actors = extractActorsFromOutlookSignal(signal);

    expect(actors).toHaveLength(0);
  });

  it('should return empty array when emailAddress has no name', () => {
    const signal = {
      from: {
        emailAddress: {
          address: 'noname@example.com',
        },
      },
    };

    const actors = extractActorsFromOutlookSignal(signal);

    expect(actors).toHaveLength(0);
  });

  it('should handle missing address gracefully', () => {
    const signal = {
      from: {
        emailAddress: {
          name: 'Name Only',
        },
      },
    };

    const actors = extractActorsFromOutlookSignal(signal);

    expect(actors).toHaveLength(1);
    expect(actors[0]!.name).toBe('Name Only');
    expect(actors[0]!.email).toBeUndefined();
  });
});
