/**
 * Built-in Connector Descriptors
 *
 * Pre-configured descriptors for popular services. These ship with the
 * platform and are registered as builtIn=true in the connector registry.
 *
 * Users only need to provide credentials and configuration parameters
 * (baseUrl, project key, etc.) to connect these services.
 */

import type { ConnectorDescriptor } from './connector-schemas.js';

// ============================================================================
// GitHub Issues
// ============================================================================

export const githubIssuesDescriptor: ConnectorDescriptor = {
  id: 'github-issues',
  name: 'GitHub Issues',
  description:
    'Track issues, pull requests, and comments from GitHub repositories',
  category: 'code_devops',
  icon: 'github',
  kind: 'generic',
  auth: {
    method: 'pat',
    config: {
      delivery: 'bearer',
      paramName: 'Authorization',
      credentialFields: [
        {
          key: 'token',
          label: 'Personal Access Token',
          type: 'password',
          required: true,
          placeholder: 'ghp_xxxxxxxxxxxx',
          helpText:
            'Generate at GitHub → Settings → Developer settings → Personal access tokens. Needs "repo" scope.',
        },
      ],
    },
  },
  ingestion: {
    mode: 'polling',
    polling: {
      endpoint:
        'https://api.github.com/repos/{{owner}}/{{repo}}/issues?state=all&sort=updated&since={{checkpoint}}&per_page=100',
      method: 'GET',
      headers: {
        'X-GitHub-Api-Version': '2022-11-28',
      },
      delta: {
        type: 'timestamp_filter',
        queryParam: 'since',
        format: 'iso8601',
      },
      rateLimitRpm: 60,
      pagination: {
        type: 'link_header',
        pageSize: 100,
      },
    },
  },
  fieldMapping: {
    itemsPath: '$',
    idPath: 'id',
    timestampPath: 'updated_at',
    summaryTemplate: '{{repository.full_name}}#{{number}}: {{title}}',
    signalTypeRules: [
      {
        when: 'pull_request',
        operator: 'exists',
        then: 'pr_updated',
      },
      {
        when: 'state',
        operator: 'equals',
        value: 'open',
        then: 'ticket_created',
      },
      {
        when: 'state',
        operator: 'equals',
        value: 'closed',
        then: 'ticket_status_changed',
      },
    ],
    priorityMapping: [
      {
        when: 'labels[*].name',
        operator: 'contains',
        value: 'critical',
        then: 'critical',
      },
      {
        when: 'labels[*].name',
        operator: 'contains',
        value: 'bug',
        then: 'high',
      },
      {
        when: 'labels[*].name',
        operator: 'contains',
        value: 'enhancement',
        then: 'medium',
      },
    ],
    participantsPath: 'assignees[*].login',
    tagsPath: 'labels[*].name',
    rawFields: ['number', 'title', 'state', 'html_url', 'user.login', 'body'],
  },
  healthCheck: {
    endpoint: 'https://api.github.com/repos/{{owner}}/{{repo}}',
    method: 'GET',
    expectStatus: 200,
    timeoutMs: 10000,
  },
  version: '1.0.0',
};

// ============================================================================
// Linear
// ============================================================================

export const linearDescriptor: ConnectorDescriptor = {
  id: 'linear',
  name: 'Linear',
  description: 'Track issues, projects, and cycles from Linear',
  category: 'project_management',
  icon: 'square-kanban',
  kind: 'generic',
  auth: {
    method: 'api_key',
    config: {
      delivery: 'bearer',
      paramName: 'Authorization',
      credentialFields: [
        {
          key: 'apiKey',
          label: 'API Key',
          type: 'password',
          required: true,
          placeholder: 'lin_api_xxxxxxxxxxxx',
          helpText: 'Generate at Linear → Settings → API → Personal API keys.',
        },
      ],
    },
  },
  ingestion: {
    mode: 'polling',
    polling: {
      endpoint: 'https://api.linear.app/graphql',
      method: 'POST',
      body: JSON.stringify({
        query: `query($after: String, $filter: IssueFilter) {
          issues(first: 50, after: $after, filter: $filter, orderBy: updatedAt) {
            pageInfo { hasNextPage endCursor }
            nodes {
              id identifier title description state { name } priority
              assignee { name email } labels { nodes { name } }
              createdAt updatedAt url
              team { name key }
            }
          }
        }`,
        variables: {
          filter: { updatedAt: { gte: '{{checkpoint}}' } },
        },
      }),
      delta: {
        type: 'timestamp_filter',
        queryParam: 'filter.updatedAt.gte',
        format: 'iso8601',
      },
      rateLimitRpm: 60,
      pagination: {
        type: 'cursor',
        nextPath: 'data.issues.pageInfo.endCursor',
        nextParam: 'after',
        pageSize: 50,
      },
    },
  },
  fieldMapping: {
    itemsPath: 'data.issues.nodes',
    idPath: 'id',
    timestampPath: 'updatedAt',
    summaryTemplate: '{{team.key}}-{{identifier}}: {{title}} [{{state.name}}]',
    signalTypeRules: [
      {
        when: 'state.name',
        operator: 'equals',
        value: 'Done',
        then: 'ticket_status_changed',
      },
      {
        when: 'state.name',
        operator: 'equals',
        value: 'In Progress',
        then: 'ticket_status_changed',
      },
      {
        when: 'state.name',
        operator: 'exists',
        then: 'ticket_updated',
      },
    ],
    priorityMapping: [
      { when: 'priority', operator: 'equals', value: '0', then: 'low' },
      { when: 'priority', operator: 'equals', value: '1', then: 'critical' },
      { when: 'priority', operator: 'equals', value: '2', then: 'high' },
      { when: 'priority', operator: 'equals', value: '3', then: 'medium' },
      { when: 'priority', operator: 'equals', value: '4', then: 'low' },
    ],
    participantsPath: 'assignee.email',
    tagsPath: 'labels.nodes[*].name',
    rawFields: ['identifier', 'title', 'state.name', 'url', 'description'],
  },
  healthCheck: {
    endpoint: 'https://api.linear.app/graphql',
    method: 'GET',
    expectStatus: 200,
    timeoutMs: 10000,
  },
  version: '1.0.0',
};

// ============================================================================
// Trello
// ============================================================================

export const trelloDescriptor: ConnectorDescriptor = {
  id: 'trello',
  name: 'Trello',
  description: 'Track cards, lists, and board activity from Trello',
  category: 'project_management',
  icon: 'layout-grid',
  kind: 'generic',
  auth: {
    method: 'api_key',
    config: {
      delivery: 'query',
      paramName: 'key',
      credentialFields: [
        {
          key: 'apiKey',
          label: 'API Key',
          type: 'password',
          required: true,
          helpText: 'Get from https://trello.com/power-ups/admin',
        },
        {
          key: 'apiToken',
          label: 'API Token',
          type: 'password',
          required: true,
          helpText: 'Generate a token after getting your API key',
        },
      ],
    },
  },
  ingestion: {
    mode: 'polling',
    polling: {
      endpoint:
        'https://api.trello.com/1/boards/{{boardId}}/actions?filter=all&since={{checkpoint}}&limit=100&token={{apiToken}}',
      method: 'GET',
      delta: {
        type: 'timestamp_filter',
        queryParam: 'since',
        format: 'iso8601',
      },
      rateLimitRpm: 100,
      pagination: {
        type: 'cursor',
        nextPath: '$[-1].id',
        nextParam: 'before',
        pageSize: 100,
      },
    },
  },
  fieldMapping: {
    itemsPath: '$',
    idPath: 'id',
    timestampPath: 'date',
    summaryTemplate:
      'Trello: {{memberCreator.fullName}} {{type}} on {{data.card.name}}',
    signalTypeRules: [
      {
        when: 'type',
        operator: 'equals',
        value: 'createCard',
        then: 'ticket_created',
      },
      {
        when: 'type',
        operator: 'equals',
        value: 'updateCard',
        then: 'ticket_updated',
      },
      {
        when: 'type',
        operator: 'equals',
        value: 'commentCard',
        then: 'ticket_commented',
      },
      {
        when: 'type',
        operator: 'contains',
        value: 'Card',
        then: 'ticket_updated',
      },
    ],
    participantsPath: 'memberCreator.username',
    tagsPath: 'data.card.labels[*].name',
    rawFields: [
      'type',
      'data.card.name',
      'data.card.shortLink',
      'data.list.name',
    ],
  },
  healthCheck: {
    endpoint: 'https://api.trello.com/1/members/me?token={{apiToken}}',
    method: 'GET',
    expectStatus: 200,
    timeoutMs: 10000,
  },
  version: '1.0.0',
};

// ============================================================================
// Slack (Webhook-based)
// ============================================================================

export const slackDescriptor: ConnectorDescriptor = {
  id: 'slack',
  name: 'Slack',
  description: 'Receive messages, mentions, and reactions from Slack channels',
  category: 'communication',
  icon: 'message-square',
  kind: 'generic',
  auth: {
    method: 'webhook_secret',
    config: {
      signatureHeader: 'X-Slack-Signature',
      algorithm: 'hmac-sha256',
      credentialFields: [
        {
          key: 'webhookSecret',
          label: 'Signing Secret',
          type: 'password',
          required: true,
          helpText:
            'Found in your Slack App → Basic Information → App Credentials → Signing Secret',
        },
      ],
    },
  },
  ingestion: {
    mode: 'webhook',
    webhook: {
      eventTypes: [
        'message',
        'app_mention',
        'reaction_added',
        'message.channels',
      ],
      eventTypePath: 'event.type',
      verification: 'signature',
    },
  },
  fieldMapping: {
    itemsPath: 'event',
    idPath: 'event_id',
    timestampPath: 'event.ts',
    summaryTemplate:
      'Slack {{event.type}} from {{event.user}} in {{event.channel}}',
    signalTypeRules: [
      {
        when: 'event.type',
        operator: 'equals',
        value: 'message',
        then: 'email_received',
      },
      {
        when: 'event.type',
        operator: 'equals',
        value: 'app_mention',
        then: 'email_received',
      },
      {
        when: 'event.type',
        operator: 'equals',
        value: 'reaction_added',
        then: 'ticket_commented',
      },
    ],
    participantsPath: 'event.user',
    rawFields: ['event.type', 'event.text', 'event.channel', 'event.user'],
  },
  healthCheck: {
    endpoint: 'https://slack.com/api/auth.test',
    method: 'GET',
    expectStatus: 200,
    timeoutMs: 10000,
  },
  version: '1.0.0',
};

// ============================================================================
// Notion
// ============================================================================

export const notionDescriptor: ConnectorDescriptor = {
  id: 'notion',
  name: 'Notion',
  description: 'Track page updates and database changes in Notion workspaces',
  category: 'documents',
  icon: 'book-open',
  kind: 'generic',
  auth: {
    method: 'api_key',
    config: {
      delivery: 'bearer',
      paramName: 'Authorization',
      credentialFields: [
        {
          key: 'apiKey',
          label: 'Integration Token',
          type: 'password',
          required: true,
          placeholder: 'ntn_xxxxxxxxxxxx',
          helpText:
            'Create an internal integration at notion.so/my-integrations and share pages with it.',
        },
      ],
    },
  },
  ingestion: {
    mode: 'polling',
    polling: {
      endpoint: 'https://api.notion.com/v1/search',
      method: 'POST',
      headers: {
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        filter: { property: 'object', value: 'page' },
        sort: { direction: 'descending', timestamp: 'last_edited_time' },
        page_size: 50,
      }),
      delta: {
        type: 'timestamp_filter',
        queryParam: 'filter.last_edited_time.after',
        format: 'iso8601',
      },
      rateLimitRpm: 30,
      pagination: {
        type: 'cursor',
        nextPath: 'next_cursor',
        nextParam: 'start_cursor',
        pageSize: 50,
      },
    },
  },
  fieldMapping: {
    itemsPath: 'results',
    idPath: 'id',
    timestampPath: 'last_edited_time',
    summaryTemplate:
      'Notion page updated: {{properties.title.title[0].plain_text}}',
    signalTypeRules: [
      {
        when: 'object',
        operator: 'equals',
        value: 'page',
        then: 'ticket_updated',
      },
      {
        when: 'object',
        operator: 'equals',
        value: 'database',
        then: 'ticket_updated',
      },
    ],
    tagsPath: 'properties.Tags.multi_select[*].name',
    rawFields: ['id', 'url', 'last_edited_time', 'created_time'],
  },
  healthCheck: {
    endpoint: 'https://api.notion.com/v1/users/me',
    method: 'GET',
    expectStatus: 200,
    timeoutMs: 10000,
  },
  version: '1.0.0',
};

// ============================================================================
// Confluence
// ============================================================================

export const confluenceDescriptor: ConnectorDescriptor = {
  id: 'confluence',
  name: 'Confluence',
  description: 'Track page updates and comments in Confluence spaces',
  category: 'documents',
  icon: 'file-text',
  kind: 'generic',
  auth: {
    method: 'basic',
    config: {
      credentialFields: [
        {
          key: 'username',
          label: 'Email Address',
          type: 'text',
          required: true,
          placeholder: 'user@example.com',
        },
        {
          key: 'apiToken',
          label: 'API Token',
          type: 'password',
          required: true,
          helpText:
            'Generate at id.atlassian.com/manage-profile/security/api-tokens',
        },
      ],
    },
  },
  ingestion: {
    mode: 'polling',
    polling: {
      endpoint:
        '{{baseUrl}}/wiki/rest/api/content?type=page&expand=version,history.lastUpdated&orderby=lastmodified desc&limit=50',
      method: 'GET',
      delta: {
        type: 'timestamp_filter',
        queryParam: 'lastModified',
        format: 'iso8601',
      },
      rateLimitRpm: 60,
      pagination: {
        type: 'cursor',
        nextPath: '_links.next',
        nextParam: 'start',
        pageSize: 50,
      },
    },
  },
  fieldMapping: {
    itemsPath: 'results',
    idPath: 'id',
    timestampPath: 'history.lastUpdated.when',
    summaryTemplate:
      'Confluence: "{{title}}" updated by {{history.lastUpdated.by.displayName}}',
    signalTypeRules: [
      {
        when: 'version.number',
        operator: 'equals',
        value: '1',
        then: 'ticket_created',
      },
      {
        when: 'version.number',
        operator: 'exists',
        then: 'ticket_updated',
      },
    ],
    participantsPath: 'history.lastUpdated.by.displayName',
    rawFields: ['id', 'title', '_links.webui', 'space.key'],
  },
  healthCheck: {
    endpoint: '{{baseUrl}}/wiki/rest/api/user/current',
    method: 'GET',
    expectStatus: 200,
    timeoutMs: 10000,
  },
  version: '1.0.0',
};

// ============================================================================
// PagerDuty (Webhook-based)
// ============================================================================

export const pagerdutyDescriptor: ConnectorDescriptor = {
  id: 'pagerduty',
  name: 'PagerDuty',
  description:
    'Receive incident alerts and resolution notifications from PagerDuty',
  category: 'monitoring',
  icon: 'siren',
  kind: 'generic',
  auth: {
    method: 'webhook_secret',
    config: {
      signatureHeader: 'X-PagerDuty-Signature',
      algorithm: 'hmac-sha256',
      credentialFields: [
        {
          key: 'webhookSecret',
          label: 'Webhook Secret',
          type: 'password',
          required: true,
          helpText:
            'Found when creating a V3 webhook in PagerDuty → Integrations → Generic Webhooks',
        },
      ],
    },
  },
  ingestion: {
    mode: 'webhook',
    webhook: {
      eventTypes: [
        'incident.triggered',
        'incident.acknowledged',
        'incident.resolved',
        'incident.escalated',
      ],
      eventTypePath: 'event.event_type',
      verification: 'signature',
    },
  },
  fieldMapping: {
    itemsPath: 'event.data',
    idPath: 'id',
    timestampPath: 'event.occurred_at',
    summaryTemplate:
      'PagerDuty {{event.event_type}}: {{event.data.title}} ({{event.data.service.summary}})',
    signalTypeRules: [
      {
        when: 'event.event_type',
        operator: 'equals',
        value: 'incident.triggered',
        then: 'ticket_created',
      },
      {
        when: 'event.event_type',
        operator: 'equals',
        value: 'incident.resolved',
        then: 'ticket_status_changed',
      },
      {
        when: 'event.event_type',
        operator: 'contains',
        value: 'incident',
        then: 'ticket_updated',
      },
    ],
    priorityMapping: [
      {
        when: 'event.data.priority.summary',
        operator: 'equals',
        value: 'P1',
        then: 'critical',
      },
      {
        when: 'event.data.priority.summary',
        operator: 'equals',
        value: 'P2',
        then: 'high',
      },
      {
        when: 'event.data.priority.summary',
        operator: 'equals',
        value: 'P3',
        then: 'medium',
      },
    ],
    participantsPath: 'event.data.assignees[*].summary',
    rawFields: ['id', 'title', 'html_url', 'service.summary', 'urgency'],
  },
  healthCheck: {
    endpoint: 'https://api.pagerduty.com/abilities',
    method: 'GET',
    expectStatus: 200,
    timeoutMs: 10000,
  },
  version: '1.0.0',
};

// ============================================================================
// Sentry (Webhook-based)
// ============================================================================

export const sentryDescriptor: ConnectorDescriptor = {
  id: 'sentry',
  name: 'Sentry',
  description: 'Receive error and performance alerts from Sentry',
  category: 'code_devops',
  icon: 'bug',
  kind: 'generic',
  auth: {
    method: 'webhook_secret',
    config: {
      signatureHeader: 'sentry-hook-signature',
      algorithm: 'hmac-sha256',
      credentialFields: [
        {
          key: 'webhookSecret',
          label: 'Client Secret',
          type: 'password',
          required: true,
          helpText:
            'Found in Sentry → Settings → Developer Settings → your integration',
        },
      ],
    },
  },
  ingestion: {
    mode: 'webhook',
    webhook: {
      eventTypes: [
        'issue.created',
        'issue.resolved',
        'issue.assigned',
        'error.created',
      ],
      eventTypePath: 'action',
      verification: 'signature',
    },
  },
  fieldMapping: {
    itemsPath: 'data',
    idPath: 'data.issue.id',
    timestampPath: 'data.issue.lastSeen',
    summaryTemplate:
      'Sentry {{action}}: {{data.issue.title}} ({{data.issue.project.name}})',
    signalTypeRules: [
      {
        when: 'action',
        operator: 'equals',
        value: 'created',
        then: 'ticket_created',
      },
      {
        when: 'action',
        operator: 'equals',
        value: 'resolved',
        then: 'ticket_status_changed',
      },
      {
        when: 'action',
        operator: 'equals',
        value: 'assigned',
        then: 'ticket_assigned',
      },
    ],
    priorityMapping: [
      {
        when: 'data.issue.level',
        operator: 'equals',
        value: 'fatal',
        then: 'critical',
      },
      {
        when: 'data.issue.level',
        operator: 'equals',
        value: 'error',
        then: 'high',
      },
      {
        when: 'data.issue.level',
        operator: 'equals',
        value: 'warning',
        then: 'medium',
      },
    ],
    tagsPath: 'data.issue.tags[*].value',
    rawFields: [
      'data.issue.id',
      'data.issue.title',
      'data.issue.shortId',
      'data.issue.permalink',
      'data.issue.level',
    ],
  },
  healthCheck: {
    endpoint: 'https://sentry.io/api/0/',
    method: 'GET',
    expectStatus: 200,
    timeoutMs: 10000,
  },
  version: '1.0.0',
};

// ============================================================================
// Native Connector Stubs (Jira, Outlook, SES)
//
// These describe the existing native connectors in the registry catalogue
// so they appear alongside generic connectors in the UI. Their actual
// SignalSource implementation is used at runtime, not the generic engine.
// ============================================================================

export const jiraNativeDescriptor: ConnectorDescriptor = {
  id: 'jira',
  name: 'Jira Cloud',
  description:
    'Full-featured Jira integration with changelog tracking, sprint monitoring, and JQL-based polling',
  category: 'project_management',
  icon: 'ticket',
  kind: 'native',
  auth: {
    method: 'basic',
    config: {
      credentialFields: [
        {
          key: 'username',
          label: 'Email Address',
          type: 'text',
          required: true,
          placeholder: 'user@example.com',
        },
        {
          key: 'apiToken',
          label: 'API Token',
          type: 'password',
          required: true,
          helpText:
            'Generate at id.atlassian.com/manage-profile/security/api-tokens',
        },
        {
          key: 'baseUrl',
          label: 'Jira Site URL',
          type: 'url',
          required: true,
          placeholder: 'https://yoursite.atlassian.net',
        },
      ],
    },
  },
  ingestion: {
    mode: 'polling',
    polling: {
      endpoint: '{{baseUrl}}/rest/api/3/search',
      method: 'GET',
      delta: {
        type: 'timestamp_filter',
        queryParam: 'jql',
        format: 'iso8601',
      },
      rateLimitRpm: 100,
    },
  },
  fieldMapping: {
    itemsPath: 'issues',
    idPath: 'id',
    timestampPath: 'fields.updated',
    summaryTemplate: '{{key}}: {{fields.summary}}',
    signalTypeRules: [
      { when: 'changelog', operator: 'exists', then: 'ticket_updated' },
    ],
  },
  healthCheck: {
    endpoint: '{{baseUrl}}/rest/api/3/myself',
    method: 'GET',
    expectStatus: 200,
    timeoutMs: 10000,
  },
  version: '1.0.0',
};

export const outlookNativeDescriptor: ConnectorDescriptor = {
  id: 'outlook',
  name: 'Microsoft Outlook',
  description:
    'Email monitoring via Microsoft Graph API with delta query support',
  category: 'communication',
  icon: 'mail',
  kind: 'native',
  auth: {
    method: 'oauth2',
    config: {
      authoriseUrl:
        'https://login.microsoftonline.com/{{tenantId}}/oauth2/v2.0/authorize',
      tokenUrl:
        'https://login.microsoftonline.com/{{tenantId}}/oauth2/v2.0/token',
      scopes: ['Mail.Read', 'Mail.ReadWrite', 'User.Read'],
      credentialFields: [
        {
          key: 'tenantId',
          label: 'Azure AD Tenant ID',
          type: 'text',
          required: true,
        },
        {
          key: 'clientId',
          label: 'Application (client) ID',
          type: 'text',
          required: true,
        },
        {
          key: 'clientSecret',
          label: 'Client Secret',
          type: 'password',
          required: true,
        },
      ],
    },
  },
  ingestion: {
    mode: 'polling',
    polling: {
      endpoint:
        'https://graph.microsoft.com/v1.0/users/{{userId}}/messages/delta',
      method: 'GET',
      delta: {
        type: 'delta_token',
        tokenPath: '@odata.deltaLink',
        tokenParam: '$deltatoken',
      },
      rateLimitRpm: 60,
    },
  },
  fieldMapping: {
    itemsPath: 'value',
    idPath: 'id',
    timestampPath: 'receivedDateTime',
    summaryTemplate: 'Email from {{from.emailAddress.name}}: {{subject}}',
    signalTypeRules: [
      { when: 'id', operator: 'exists', then: 'email_received' },
    ],
  },
  healthCheck: {
    endpoint: 'https://graph.microsoft.com/v1.0/users/{{userId}}',
    method: 'GET',
    expectStatus: 200,
    timeoutMs: 10000,
  },
  version: '1.0.0',
};

export const sesNativeDescriptor: ConnectorDescriptor = {
  id: 'ses',
  name: 'Amazon SES',
  description: 'Outbound email notifications via Amazon Simple Email Service',
  category: 'communication',
  icon: 'send',
  kind: 'native',
  auth: {
    method: 'none',
  },
  ingestion: {
    mode: 'polling',
    polling: {
      endpoint: 'ses:GetSendQuota',
      method: 'GET',
      delta: {
        type: 'timestamp_filter',
        queryParam: 'unused',
        format: 'iso8601',
      },
      rateLimitRpm: 10,
    },
  },
  fieldMapping: {
    itemsPath: '$',
    idPath: 'messageId',
    timestampPath: 'sentAt',
    summaryTemplate: 'SES notification sent',
    signalTypeRules: [
      { when: 'messageId', operator: 'exists', then: 'unknown' },
    ],
  },
  healthCheck: {
    endpoint: 'ses:GetSendQuota',
    method: 'GET',
    expectStatus: 200,
    timeoutMs: 10000,
  },
  version: '1.0.0',
};

// ============================================================================
// All Built-in Descriptors
// ============================================================================

export const builtinDescriptors: ConnectorDescriptor[] = [
  // Native connectors (existing implementations)
  jiraNativeDescriptor,
  outlookNativeDescriptor,
  sesNativeDescriptor,
  // Generic connectors (descriptor-driven)
  githubIssuesDescriptor,
  linearDescriptor,
  trelloDescriptor,
  slackDescriptor,
  notionDescriptor,
  confluenceDescriptor,
  pagerdutyDescriptor,
  sentryDescriptor,
];
