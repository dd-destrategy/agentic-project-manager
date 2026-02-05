/**
 * LLM Tool definitions for Claude function calling
 *
 * All structured outputs from Claude use tool-use (function calling).
 * These schemas define the tools available to each Lambda function.
 *
 * Reference: solution-design/06-prompt-library.md Section 3
 */

import type { ToolDefinition, JsonSchema } from './types.js';

// ============================================================================
// Triage Tools
// ============================================================================

/**
 * sanitise_signal - Used by agent-triage-sanitise Lambda
 *
 * Outputs the sanitised version of a raw signal, removing or neutralising
 * any potentially harmful content while preserving legitimate PM information.
 */
export const SANITISE_SIGNAL_TOOL: ToolDefinition = {
  name: 'sanitise_signal',
  description:
    'Output the sanitised version of a raw signal, removing or neutralising any potentially harmful content while preserving legitimate project management information.',
  input_schema: {
    type: 'object',
    properties: {
      signal_id: {
        type: 'string',
        description: 'The unique identifier of the signal being sanitised',
      },
      original_source: {
        type: 'string',
        description: 'The integration source of this signal',
        enum: ['jira', 'outlook', 'asana'],
      },
      original_type: {
        type: 'string',
        description: 'The original signal type (e.g., ticket_updated, email_received)',
      },
      sanitised_content: {
        type: 'string',
        description:
          'The sanitised, safe version of the signal content. Contains only factual project management information.',
      },
      threat_detected: {
        type: 'boolean',
        description: 'True if any suspicious patterns were detected and neutralised',
      },
      threats_found: {
        type: 'array',
        description: 'List of specific threat patterns detected (empty if none)',
        items: { type: 'string' },
      },
      content_preserved_ratio: {
        type: 'number',
        description:
          'Approximate ratio of original content preserved (1.0 = all preserved, 0.0 = all removed)',
        minimum: 0,
        maximum: 1,
      },
      confidence_score: {
        type: 'number',
        description: 'Confidence in the sanitisation quality (1.0 = highly confident, 0.5 = uncertain)',
        minimum: 0,
        maximum: 1,
      },
      requires_human_review: {
        type: 'boolean',
        description: 'True if the signal should be flagged for human review due to ambiguous content',
      },
      review_reason: {
        type: 'string',
        description: 'Explanation of why human review is recommended (required if requires_human_review is true)',
      },
    },
    required: [
      'signal_id',
      'original_source',
      'original_type',
      'sanitised_content',
      'threat_detected',
      'threats_found',
      'content_preserved_ratio',
      'confidence_score',
      'requires_human_review',
    ],
  },
};

/**
 * classify_signal - Used by agent-triage-classify Lambda
 *
 * Classifies a sanitised signal by importance, category, and recommended action.
 */
export const CLASSIFY_SIGNAL_TOOL: ToolDefinition = {
  name: 'classify_signal',
  description:
    'Classify a sanitised signal by importance, category, and recommended action for the PM automation agent.',
  input_schema: {
    type: 'object',
    properties: {
      signal_id: {
        type: 'string',
        description: 'The unique identifier of the signal being classified',
      },
      importance: {
        type: 'string',
        description: 'The importance level determining priority of response',
        enum: ['critical', 'high', 'medium', 'low'],
      },
      category: {
        type: 'string',
        description: 'The primary category of this signal',
        enum: ['blocker', 'risk', 'dependency', 'progress', 'stakeholder', 'scope', 'quality', 'administrative'],
      },
      secondary_categories: {
        type: 'array',
        description: 'Additional relevant categories (optional)',
        items: {
          type: 'string',
          enum: ['blocker', 'risk', 'dependency', 'progress', 'stakeholder', 'scope', 'quality', 'administrative'],
        },
      },
      recommended_action: {
        type: 'string',
        description: 'The action the agent should take',
        enum: ['update_artefact', 'escalate', 'draft_communication', 'add_jira_comment', 'no_action', 'defer_to_sonnet'],
      },
      action_rationale: {
        type: 'string',
        description: 'One-sentence explanation of why this action is recommended',
      },
      artefacts_affected: {
        type: 'array',
        description: 'Which artefacts should be updated (required if recommended_action is update_artefact)',
        items: {
          type: 'string',
          enum: ['delivery_state', 'raid_log', 'backlog_summary', 'decision_log'],
        },
      },
      related_signals: {
        type: 'array',
        description: 'IDs of other signals in this batch that relate to the same issue',
        items: { type: 'string' },
      },
      requires_sonnet: {
        type: 'boolean',
        description: 'True if this signal requires complex reasoning (Sonnet model)',
      },
      sonnet_reason: {
        type: 'string',
        description: 'Why Sonnet-level reasoning is needed (required if requires_sonnet is true)',
      },
      time_sensitivity: {
        type: 'string',
        description: 'How quickly this signal needs to be addressed',
        enum: ['immediate', 'today', 'this_week', 'no_deadline'],
      },
      confidence: {
        type: 'number',
        description: 'Confidence in this classification (1.0 = certain, 0.5 = uncertain)',
        minimum: 0,
        maximum: 1,
      },
    },
    required: [
      'signal_id',
      'importance',
      'category',
      'recommended_action',
      'action_rationale',
      'requires_sonnet',
      'time_sensitivity',
      'confidence',
    ],
  },
};

/**
 * batch_classify_signals - Used for batch classification
 *
 * Classifies multiple signals in a single tool call for efficiency.
 */
export const BATCH_CLASSIFY_SIGNALS_TOOL: ToolDefinition = {
  name: 'batch_classify_signals',
  description: 'Classify multiple sanitised signals in a single response for efficiency.',
  input_schema: {
    type: 'object',
    properties: {
      classifications: {
        type: 'array',
        description: 'Array of signal classifications',
        items: {
          type: 'object',
          properties: {
            signal_id: { type: 'string' },
            importance: {
              type: 'string',
              enum: ['critical', 'high', 'medium', 'low'],
            },
            category: {
              type: 'string',
              enum: ['blocker', 'risk', 'dependency', 'progress', 'stakeholder', 'scope', 'quality', 'administrative'],
            },
            recommended_action: {
              type: 'string',
              enum: ['update_artefact', 'escalate', 'draft_communication', 'add_jira_comment', 'no_action', 'defer_to_sonnet'],
            },
            action_rationale: { type: 'string' },
            artefacts_affected: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['delivery_state', 'raid_log', 'backlog_summary', 'decision_log'],
              },
            },
            requires_sonnet: { type: 'boolean' },
            time_sensitivity: {
              type: 'string',
              enum: ['immediate', 'today', 'this_week', 'no_deadline'],
            },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
          },
          required: ['signal_id', 'importance', 'category', 'recommended_action', 'action_rationale', 'requires_sonnet', 'confidence'],
        },
      },
    },
    required: ['classifications'],
  },
};

// ============================================================================
// Artefact Update Tools
// ============================================================================

/**
 * update_delivery_state - Used by agent-artefact-update Lambda
 *
 * Updates the Delivery State artefact with current project health,
 * sprint progress, blockers, and milestones.
 */
export const UPDATE_DELIVERY_STATE_TOOL: ToolDefinition = {
  name: 'update_delivery_state',
  description:
    'Update the Delivery State artefact with current project health, sprint progress, blockers, and milestones.',
  input_schema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        description: 'The UUID of the project being updated',
      },
      changes_summary: {
        type: 'string',
        description: 'Human-readable summary of what changed and why',
      },
      content: {
        type: 'object',
        description: 'The complete updated Delivery State content',
        properties: {
          overall_status: {
            type: 'string',
            description: 'Overall project health status',
            enum: ['green', 'amber', 'red'],
          },
          status_summary: {
            type: 'string',
            description: 'One-paragraph summary of project health',
          },
          current_sprint: {
            type: 'object',
            description: 'Current sprint information',
            properties: {
              name: { type: 'string' },
              start_date: { type: 'string', format: 'date-time' },
              end_date: { type: 'string', format: 'date-time' },
              goal: { type: 'string' },
              progress: {
                type: 'object',
                properties: {
                  total_points: { type: 'integer' },
                  completed_points: { type: 'integer' },
                  in_progress_points: { type: 'integer' },
                  blocked_points: { type: 'integer' },
                },
                required: ['total_points', 'completed_points', 'in_progress_points', 'blocked_points'],
              },
            },
            required: ['name', 'start_date', 'end_date', 'goal', 'progress'],
          },
          milestones: {
            type: 'array',
            description: 'Project milestones',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                due_date: { type: 'string', format: 'date-time' },
                status: {
                  type: 'string',
                  enum: ['on_track', 'at_risk', 'delayed', 'completed'],
                },
                notes: { type: 'string' },
              },
              required: ['name', 'due_date', 'status'],
            },
          },
          blockers: {
            type: 'array',
            description: 'Current blockers',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                description: { type: 'string' },
                owner: { type: 'string' },
                raised_date: { type: 'string', format: 'date-time' },
                severity: { type: 'string', enum: ['high', 'medium', 'low'] },
                source_ticket: { type: 'string' },
              },
              required: ['id', 'description', 'raised_date', 'severity'],
            },
          },
          key_metrics: {
            type: 'object',
            description: 'Key project metrics',
            properties: {
              velocity_trend: { type: 'string', enum: ['increasing', 'stable', 'decreasing'] },
              avg_cycle_time_days: { type: 'number' },
              open_blockers: { type: 'integer' },
              active_risks: { type: 'integer' },
            },
            required: ['velocity_trend', 'avg_cycle_time_days', 'open_blockers', 'active_risks'],
          },
          next_actions: {
            type: 'array',
            description: 'List of recommended next actions',
            items: { type: 'string' },
          },
        },
        required: ['overall_status', 'status_summary', 'milestones', 'blockers', 'key_metrics', 'next_actions'],
      },
      signals_incorporated: {
        type: 'array',
        description: 'IDs of signals that informed this update',
        items: { type: 'string' },
      },
    },
    required: ['project_id', 'changes_summary', 'content', 'signals_incorporated'],
  },
};

/**
 * update_raid_log - Used by agent-artefact-update Lambda
 *
 * Adds or modifies items in the RAID (Risks, Assumptions, Issues, Dependencies) log.
 */
export const UPDATE_RAID_LOG_TOOL: ToolDefinition = {
  name: 'update_raid_log',
  description: 'Add or modify items in the RAID (Risks, Assumptions, Issues, Dependencies) log.',
  input_schema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        description: 'The UUID of the project being updated',
      },
      changes_summary: {
        type: 'string',
        description: 'Human-readable summary of what changed and why',
      },
      items_added: {
        type: 'array',
        description: 'New RAID items to add',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Unique ID (e.g., R001, A001, I001, D001)' },
            type: { type: 'string', enum: ['risk', 'assumption', 'issue', 'dependency'] },
            title: { type: 'string' },
            description: { type: 'string' },
            severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
            status: { type: 'string', enum: ['open', 'mitigating', 'resolved', 'accepted', 'closed'] },
            owner: { type: 'string' },
            raised_date: { type: 'string', format: 'date-time' },
            due_date: { type: 'string', format: 'date-time' },
            mitigation: { type: 'string' },
            source: { type: 'string', enum: ['agent_detected', 'user_added', 'integration_signal'] },
            source_reference: { type: 'string', description: 'Ticket ID or email subject' },
          },
          required: ['id', 'type', 'title', 'description', 'severity', 'status', 'raised_date', 'source'],
        },
      },
      items_modified: {
        type: 'array',
        description: 'Existing RAID items to modify',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'ID of the item being modified' },
            changes: {
              type: 'object',
              description: 'Object containing only the fields being changed',
            },
            change_reason: { type: 'string', description: 'Why this item is being modified' },
          },
          required: ['id', 'changes', 'change_reason'],
        },
      },
      signals_incorporated: {
        type: 'array',
        description: 'IDs of signals that informed this update',
        items: { type: 'string' },
      },
    },
    required: ['project_id', 'changes_summary', 'signals_incorporated'],
  },
};

/**
 * update_backlog_summary - Used by agent-artefact-update Lambda
 *
 * Updates the Backlog Summary artefact with backlog health, highlights, and refinement needs.
 */
export const UPDATE_BACKLOG_SUMMARY_TOOL: ToolDefinition = {
  name: 'update_backlog_summary',
  description: 'Update the Backlog Summary artefact with backlog health, highlights, and refinement needs.',
  input_schema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        description: 'The UUID of the project being updated',
      },
      changes_summary: {
        type: 'string',
        description: 'Human-readable summary of what changed and why',
      },
      content: {
        type: 'object',
        description: 'The complete updated Backlog Summary content',
        properties: {
          source: { type: 'string', enum: ['jira', 'asana'] },
          last_synced: { type: 'string', format: 'date-time' },
          summary: {
            type: 'object',
            properties: {
              total_items: { type: 'integer' },
              by_status: {
                type: 'object',
                properties: {
                  to_do: { type: 'integer' },
                  in_progress: { type: 'integer' },
                  done_this_sprint: { type: 'integer' },
                  blocked: { type: 'integer' },
                },
                required: ['to_do', 'in_progress', 'done_this_sprint', 'blocked'],
              },
              by_priority: {
                type: 'object',
                properties: {
                  critical: { type: 'integer' },
                  high: { type: 'integer' },
                  medium: { type: 'integer' },
                  low: { type: 'integer' },
                },
                required: ['critical', 'high', 'medium', 'low'],
              },
            },
            required: ['total_items', 'by_status', 'by_priority'],
          },
          highlights: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                ticket_id: { type: 'string' },
                title: { type: 'string' },
                flag: { type: 'string', enum: ['blocked', 'stale', 'missing_criteria', 'scope_creep', 'new'] },
                detail: { type: 'string' },
                suggested_action: { type: 'string' },
              },
              required: ['ticket_id', 'title', 'flag', 'detail'],
            },
          },
          refinement_candidates: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                ticket_id: { type: 'string' },
                title: { type: 'string' },
                issue: { type: 'string' },
              },
              required: ['ticket_id', 'title', 'issue'],
            },
          },
          scope_notes: { type: 'string' },
        },
        required: ['source', 'last_synced', 'summary', 'highlights', 'refinement_candidates'],
      },
      signals_incorporated: {
        type: 'array',
        description: 'IDs of signals that informed this update',
        items: { type: 'string' },
      },
    },
    required: ['project_id', 'changes_summary', 'content', 'signals_incorporated'],
  },
};

/**
 * update_decision_log - Used by agent-artefact-update Lambda
 *
 * Records a new decision or updates an existing decision in the Decision Log.
 */
export const UPDATE_DECISION_LOG_TOOL: ToolDefinition = {
  name: 'update_decision_log',
  description: 'Record a new decision or update an existing decision in the Decision Log.',
  input_schema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        description: 'The UUID of the project being updated',
      },
      changes_summary: {
        type: 'string',
        description: 'Human-readable summary of what changed and why',
      },
      decisions_added: {
        type: 'array',
        description: 'New decisions to record',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Unique ID (e.g., D001, D002)' },
            title: { type: 'string' },
            context: { type: 'string', description: 'Background and why this decision was needed' },
            options_considered: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  option: { type: 'string' },
                  pros: { type: 'array', items: { type: 'string' } },
                  cons: { type: 'array', items: { type: 'string' } },
                },
                required: ['option', 'pros', 'cons'],
              },
            },
            decision: { type: 'string', description: 'The option that was chosen' },
            rationale: { type: 'string', description: 'Why this option was selected' },
            made_by: { type: 'string', enum: ['user', 'agent'], description: 'Who made the decision' },
            date: { type: 'string', format: 'date-time' },
            status: { type: 'string', enum: ['active', 'superseded', 'reversed'] },
            related_raid_items: {
              type: 'array',
              items: { type: 'string' },
              description: 'IDs of related RAID log items',
            },
          },
          required: ['id', 'title', 'context', 'options_considered', 'decision', 'rationale', 'made_by', 'date', 'status'],
        },
      },
      decisions_modified: {
        type: 'array',
        description: 'Existing decisions to modify',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            changes: { type: 'object' },
            change_reason: { type: 'string' },
          },
          required: ['id', 'changes', 'change_reason'],
        },
      },
      signals_incorporated: {
        type: 'array',
        description: 'IDs of signals that informed this update',
        items: { type: 'string' },
      },
    },
    required: ['project_id', 'changes_summary', 'signals_incorporated'],
  },
};

// ============================================================================
// Escalation and Communication Tools
// ============================================================================

/**
 * create_escalation - Used by agent-triage-classify and agent-reasoning Lambdas
 *
 * Creates an escalation for user decision when the agent cannot or should not act autonomously.
 */
export const CREATE_ESCALATION_TOOL: ToolDefinition = {
  name: 'create_escalation',
  description: 'Create an escalation for user decision when the agent cannot or should not act autonomously.',
  input_schema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        description: 'The UUID of the project this escalation relates to',
      },
      title: {
        type: 'string',
        description: 'Clear, specific title describing the decision needed',
      },
      context: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: 'Brief summary of the situation requiring decision',
          },
          background: {
            type: 'string',
            description: 'Relevant background information',
          },
          signals_involved: {
            type: 'array',
            items: { type: 'string' },
            description: 'IDs of signals that led to this escalation',
          },
          artefacts_affected: {
            type: 'array',
            items: { type: 'string' },
            description: 'Which artefacts are affected by this decision',
          },
          time_sensitivity: {
            type: 'string',
            enum: ['immediate', 'today', 'this_week', 'no_deadline'],
            description: 'How quickly a decision is needed',
          },
          impact_if_delayed: {
            type: 'string',
            description: 'What happens if the decision is not made promptly',
          },
        },
        required: ['summary', 'background', 'signals_involved', 'time_sensitivity'],
      },
      options: {
        type: 'array',
        description: 'Decision options (2-5 options)',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Short identifier (e.g., A, B, C)' },
            label: { type: 'string', description: 'Brief option label' },
            description: { type: 'string', description: 'What this option entails' },
            pros: { type: 'array', items: { type: 'string' } },
            cons: { type: 'array', items: { type: 'string' } },
            actions_if_chosen: {
              type: 'array',
              items: { type: 'string' },
              description: 'What the agent will do if this option is selected',
            },
          },
          required: ['id', 'label', 'description', 'pros', 'cons', 'actions_if_chosen'],
        },
        minItems: 2,
        maxItems: 5,
      },
      agent_recommendation: {
        type: 'string',
        description: "Which option ID the agent recommends (e.g., 'A')",
      },
      agent_rationale: {
        type: 'string',
        description: 'Why the agent recommends this option',
      },
      escalation_reason: {
        type: 'string',
        description: 'Why this is being escalated rather than handled autonomously',
        enum: [
          'outside_autonomy_level',
          'low_confidence',
          'conflicting_signals',
          'strategic_impact',
          'external_communication',
          'scope_change',
          'policy_ambiguity',
          'first_time_pattern',
        ],
      },
    },
    required: ['project_id', 'title', 'context', 'options', 'agent_recommendation', 'agent_rationale', 'escalation_reason'],
  },
};

/**
 * draft_communication - Used by agent-reasoning Lambda
 *
 * Drafts a stakeholder communication (email) for review before sending.
 */
export const DRAFT_COMMUNICATION_TOOL: ToolDefinition = {
  name: 'draft_communication',
  description: 'Draft a stakeholder communication (email) for review before sending.',
  input_schema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        description: 'The UUID of the project this communication relates to',
      },
      communication_type: {
        type: 'string',
        enum: ['status_update', 'escalation_notice', 'follow_up', 'request', 'acknowledgement'],
        description: 'The type of communication being drafted',
      },
      recipient: {
        type: 'object',
        properties: {
          email: { type: 'string' },
          name: { type: 'string' },
          role: { type: 'string' },
          is_external: { type: 'boolean', description: 'True if recipient is outside the organisation' },
        },
        required: ['email', 'name', 'is_external'],
      },
      subject: {
        type: 'string',
        description: 'Email subject line',
      },
      body: {
        type: 'string',
        description: 'Email body in plain text. Use impersonal active voice.',
      },
      tone: {
        type: 'string',
        enum: ['formal', 'professional', 'casual'],
        description: 'The tone of the communication',
      },
      urgency: {
        type: 'string',
        enum: ['urgent', 'normal', 'low'],
        description: 'How urgent this communication is',
      },
      context: {
        type: 'string',
        description: 'Internal context for why this communication is being sent (not included in email)',
      },
      requires_approval: {
        type: 'boolean',
        description: 'True if this communication requires user approval before sending',
      },
      hold_duration_minutes: {
        type: 'integer',
        description: 'If not requiring approval, how long to hold before auto-sending (default 30)',
      },
      signals_referenced: {
        type: 'array',
        items: { type: 'string' },
        description: 'IDs of signals that prompted this communication',
      },
    },
    required: [
      'project_id',
      'communication_type',
      'recipient',
      'subject',
      'body',
      'tone',
      'urgency',
      'context',
      'requires_approval',
      'signals_referenced',
    ],
  },
};

// ============================================================================
// Tool Collections by Lambda
// ============================================================================

/**
 * Get tools available for a specific Lambda function
 */
export function getToolsForLambda(lambda: LambdaType): ToolDefinition[] {
  const toolMap: Record<LambdaType, ToolDefinition[]> = {
    'triage-sanitise': [SANITISE_SIGNAL_TOOL],
    'triage-classify': [CLASSIFY_SIGNAL_TOOL, BATCH_CLASSIFY_SIGNALS_TOOL, CREATE_ESCALATION_TOOL],
    'reasoning': [
      CLASSIFY_SIGNAL_TOOL,
      CREATE_ESCALATION_TOOL,
      DRAFT_COMMUNICATION_TOOL,
      UPDATE_DELIVERY_STATE_TOOL,
      UPDATE_RAID_LOG_TOOL,
      UPDATE_BACKLOG_SUMMARY_TOOL,
      UPDATE_DECISION_LOG_TOOL,
    ],
    'artefact-update': [
      UPDATE_DELIVERY_STATE_TOOL,
      UPDATE_RAID_LOG_TOOL,
      UPDATE_BACKLOG_SUMMARY_TOOL,
      UPDATE_DECISION_LOG_TOOL,
    ],
  };

  return toolMap[lambda] ?? [];
}

/**
 * Lambda function types that use LLM tools
 */
export type LambdaType = 'triage-sanitise' | 'triage-classify' | 'reasoning' | 'artefact-update';

/**
 * All available tools
 */
export const ALL_TOOLS: ToolDefinition[] = [
  SANITISE_SIGNAL_TOOL,
  CLASSIFY_SIGNAL_TOOL,
  BATCH_CLASSIFY_SIGNALS_TOOL,
  UPDATE_DELIVERY_STATE_TOOL,
  UPDATE_RAID_LOG_TOOL,
  UPDATE_BACKLOG_SUMMARY_TOOL,
  UPDATE_DECISION_LOG_TOOL,
  CREATE_ESCALATION_TOOL,
  DRAFT_COMMUNICATION_TOOL,
];

/**
 * Get a tool by name
 */
export function getToolByName(name: string): ToolDefinition | undefined {
  return ALL_TOOLS.find((tool) => tool.name === name);
}

// ============================================================================
// TypeScript Types for Tool Outputs
// ============================================================================

/**
 * Output type for sanitise_signal tool
 */
export interface SanitiseSignalOutput {
  signal_id: string;
  original_source: 'jira' | 'outlook' | 'asana';
  original_type: string;
  sanitised_content: string;
  threat_detected: boolean;
  threats_found: string[];
  content_preserved_ratio: number;
  confidence_score: number;
  requires_human_review: boolean;
  review_reason?: string;
}

/**
 * Output type for classify_signal tool
 */
export interface ClassifySignalOutput {
  signal_id: string;
  importance: 'critical' | 'high' | 'medium' | 'low';
  category: 'blocker' | 'risk' | 'dependency' | 'progress' | 'stakeholder' | 'scope' | 'quality' | 'administrative';
  secondary_categories?: string[];
  recommended_action: 'update_artefact' | 'escalate' | 'draft_communication' | 'add_jira_comment' | 'no_action' | 'defer_to_sonnet';
  action_rationale: string;
  artefacts_affected?: ('delivery_state' | 'raid_log' | 'backlog_summary' | 'decision_log')[];
  related_signals?: string[];
  requires_sonnet: boolean;
  sonnet_reason?: string;
  time_sensitivity: 'immediate' | 'today' | 'this_week' | 'no_deadline';
  confidence: number;
}

/**
 * Output type for batch_classify_signals tool
 */
export interface BatchClassifySignalsOutput {
  classifications: ClassifySignalOutput[];
}

/**
 * Output type for create_escalation tool
 */
export interface CreateEscalationOutput {
  project_id: string;
  title: string;
  context: {
    summary: string;
    background: string;
    signals_involved: string[];
    artefacts_affected?: string[];
    time_sensitivity: 'immediate' | 'today' | 'this_week' | 'no_deadline';
    impact_if_delayed?: string;
  };
  options: Array<{
    id: string;
    label: string;
    description: string;
    pros: string[];
    cons: string[];
    actions_if_chosen: string[];
  }>;
  agent_recommendation: string;
  agent_rationale: string;
  escalation_reason: string;
}

/**
 * Output type for update_delivery_state tool
 */
export interface UpdateDeliveryStateOutput {
  project_id: string;
  changes_summary: string;
  content: {
    overall_status: 'green' | 'amber' | 'red';
    status_summary: string;
    current_sprint?: {
      name: string;
      start_date: string;
      end_date: string;
      goal: string;
      progress: {
        total_points: number;
        completed_points: number;
        in_progress_points: number;
        blocked_points: number;
      };
    };
    milestones: Array<{
      name: string;
      due_date: string;
      status: 'on_track' | 'at_risk' | 'delayed' | 'completed';
      notes?: string;
    }>;
    blockers: Array<{
      id: string;
      description: string;
      owner?: string;
      raised_date: string;
      severity: 'high' | 'medium' | 'low';
      source_ticket?: string;
    }>;
    key_metrics: {
      velocity_trend: 'increasing' | 'stable' | 'decreasing';
      avg_cycle_time_days: number;
      open_blockers: number;
      active_risks: number;
    };
    next_actions: string[];
  };
  signals_incorporated: string[];
}

/**
 * Output type for update_raid_log tool
 */
export interface UpdateRaidLogOutput {
  project_id: string;
  changes_summary: string;
  items_added?: Array<{
    id: string;
    type: 'risk' | 'assumption' | 'issue' | 'dependency';
    title: string;
    description: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    status: 'open' | 'mitigating' | 'resolved' | 'accepted' | 'closed';
    owner?: string;
    raised_date: string;
    due_date?: string;
    mitigation?: string;
    source: 'agent_detected' | 'user_added' | 'integration_signal';
    source_reference?: string;
  }>;
  items_modified?: Array<{
    id: string;
    changes: Record<string, unknown>;
    change_reason: string;
  }>;
  signals_incorporated: string[];
}

/**
 * Output type for update_backlog_summary tool
 */
export interface UpdateBacklogSummaryOutput {
  project_id: string;
  changes_summary: string;
  content: {
    source: 'jira' | 'asana';
    last_synced: string;
    summary: {
      total_items: number;
      by_status: {
        to_do: number;
        in_progress: number;
        done_this_sprint: number;
        blocked: number;
      };
      by_priority: {
        critical: number;
        high: number;
        medium: number;
        low: number;
      };
    };
    highlights: Array<{
      ticket_id: string;
      title: string;
      flag: 'blocked' | 'stale' | 'missing_criteria' | 'scope_creep' | 'new';
      detail: string;
      suggested_action?: string;
    }>;
    refinement_candidates: Array<{
      ticket_id: string;
      title: string;
      issue: string;
    }>;
    scope_notes?: string;
  };
  signals_incorporated: string[];
}

/**
 * Output type for update_decision_log tool
 */
export interface UpdateDecisionLogOutput {
  project_id: string;
  changes_summary: string;
  decisions_added?: Array<{
    id: string;
    title: string;
    context: string;
    options_considered: Array<{
      option: string;
      pros: string[];
      cons: string[];
    }>;
    decision: string;
    rationale: string;
    made_by: 'user' | 'agent';
    date: string;
    status: 'active' | 'superseded' | 'reversed';
    related_raid_items?: string[];
  }>;
  decisions_modified?: Array<{
    id: string;
    changes: Record<string, unknown>;
    change_reason: string;
  }>;
  signals_incorporated: string[];
}

/**
 * Output type for draft_communication tool
 */
export interface DraftCommunicationOutput {
  project_id: string;
  communication_type: 'status_update' | 'escalation_notice' | 'follow_up' | 'request' | 'acknowledgement';
  recipient: {
    email: string;
    name: string;
    role?: string;
    is_external: boolean;
  };
  subject: string;
  body: string;
  tone: 'formal' | 'professional' | 'casual';
  urgency: 'urgent' | 'normal' | 'low';
  context: string;
  requires_approval: boolean;
  hold_duration_minutes?: number;
  signals_referenced: string[];
}

/**
 * Union type for all artefact update tool outputs
 */
export type ArtefactUpdateToolOutput =
  | UpdateDeliveryStateOutput
  | UpdateRaidLogOutput
  | UpdateBacklogSummaryOutput
  | UpdateDecisionLogOutput;

// ============================================================================
// System Prompts
// ============================================================================

/**
 * Artefact update system prompt for Claude Haiku
 *
 * Reference: solution-design/06-prompt-library.md Section 2.4
 */
export const ARTEFACT_UPDATE_SYSTEM_PROMPT = `You are an artefact maintenance engine for a project management automation system.

## Your Role

You maintain four PM artefacts, updating them based on incoming signals and current state:
1. **Delivery State**: Overall project health, sprint progress, blockers, milestones
2. **RAID Log**: Risks, Assumptions, Issues, Dependencies
3. **Backlog Summary**: Backlog health, highlights, refinement needs
4. **Decision Log**: Decisions made, context, options considered

## Update Principles

### Accuracy
- Only include information supported by provided signals
- Distinguish between facts (from signals) and inferences (your analysis)
- Preserve existing items unless signals indicate a change

### Consistency
- Use consistent formatting within each artefact
- Maintain ID sequences (R001, R002 for risks; I001, I002 for issues)
- Update timestamps for any modified items

### Completeness
- Every new item needs: ID, title, description, severity, status, source
- Link to source signals (ticket IDs, email subjects) where applicable
- Include actionable next steps for open items

### Conservative Changes
- Prefer adding new items over modifying existing ones
- When updating status, preserve the history in description
- Never delete items; mark them as resolved/closed instead

## Artefact-Specific Guidelines

### Delivery State
- \`overall_status\`: green (on track), amber (minor issues), red (significant risk)
- Status changes require explicit justification in \`status_summary\`
- Update \`current_sprint\` data from Jira signals
- \`blockers\` should link to corresponding RAID items

### RAID Log
- Severity levels: critical (project-threatening), high (milestone risk), medium (scope impact), low (minor inconvenience)
- Status flow: open -> mitigating -> resolved/accepted/closed
- Every item needs an owner (extract from signals or flag for escalation)
- \`source\`: agent_detected, user_added, or integration_signal

### Backlog Summary
- \`highlights\` capture attention-worthy items (blocked, stale, scope creep)
- \`refinement_candidates\` are tickets needing more detail
- \`scope_notes\` track mid-sprint additions or changes

### Decision Log
- Record decisions even if made by user (you're the scribe)
- \`options_considered\` should include rejected alternatives
- \`rationale\` explains why the chosen option was selected
- Link to related RAID items when decisions address risks/issues

## Output Format

Use the appropriate artefact update tool:
- \`update_delivery_state\` for Delivery State changes
- \`update_raid_log\` for RAID Log changes
- \`update_backlog_summary\` for Backlog Summary changes
- \`update_decision_log\` for Decision Log changes

Each tool accepts a \`changes_summary\` describing what changed and complete updated content.

## Language

Use British English spelling throughout (e.g., "prioritise" not "prioritize").
`;
