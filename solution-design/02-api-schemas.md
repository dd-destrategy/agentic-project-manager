# API and Schema Specifications

> **Document:** `solution-design/02-api-schemas.md`
> **Status:** Implementation-ready
> **Source of truth:** `SPEC.md` sections 3, 4, 5, 7, 8

---

## Table of Contents

1. [DynamoDB Access Patterns](#1-dynamodb-access-patterns)
2. [API Routes](#2-api-routes)
3. [TypeScript Interfaces](#3-typescript-interfaces)
4. [Zod Schemas](#4-zod-schemas)

---

## 1. DynamoDB Access Patterns

### 1.1 Table Configuration

| Property | Value |
|----------|-------|
| Table name | `AgenticPM` |
| Billing mode | On-demand (PAY_PER_REQUEST) |
| Partition key | `PK` (String) |
| Sort key | `SK` (String) |
| TTL attribute | `TTL` (Number, Unix epoch) |
| Point-in-time recovery | Enabled |

### 1.2 Global Secondary Index (GSI1)

| Property | Value |
|----------|-------|
| Index name | `GSI1` |
| Partition key | `GSI1PK` (String) |
| Sort key | `GSI1SK` (String) |
| Projection | ALL |

### 1.3 Primary Key Access Patterns

#### Projects

| Operation | Access Pattern | PK | SK | Est. RCU | Est. WCU | Frequency |
|-----------|---------------|----|----|----------|----------|-----------|
| Get project metadata | Query | `PROJECT#<uuid>` | `METADATA` | 0.5 | - | Per request |
| Create project | PutItem | `PROJECT#<uuid>` | `METADATA` | - | 1 | Rare |
| Update project | UpdateItem | `PROJECT#<uuid>` | `METADATA` | - | 1 | Rare |
| Get project with all artefacts | Query | `PROJECT#<uuid>` | `begins_with(SK, "ARTEFACT#")` | 2-4 | - | Per page load |
| Get all project items | Query | `PROJECT#<uuid>` | - (all) | 5-10 | - | Debug only |

```typescript
// Get project metadata
const getProject = {
  TableName: 'AgenticPM',
  Key: {
    PK: `PROJECT#${projectId}`,
    SK: 'METADATA'
  }
};

// Get project with artefacts
const getProjectWithArtefacts = {
  TableName: 'AgenticPM',
  KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
  ExpressionAttributeValues: {
    ':pk': `PROJECT#${projectId}`,
    ':prefix': 'ARTEFACT#'
  }
};
```

#### Artefacts

| Operation | Access Pattern | PK | SK | Est. RCU | Est. WCU | Frequency |
|-----------|---------------|----|----|----------|----------|-----------|
| Get single artefact | GetItem | `PROJECT#<uuid>` | `ARTEFACT#<type>` | 1-2 | - | Per view |
| Get all project artefacts | Query | `PROJECT#<uuid>` | `begins_with(SK, "ARTEFACT#")` | 2-4 | - | Per page load |
| Update artefact | UpdateItem | `PROJECT#<uuid>` | `ARTEFACT#<type>` | - | 2-4 | Per agent cycle |
| Bootstrap artefacts | BatchWriteItem | `PROJECT#<uuid>` | `ARTEFACT#*` (4 items) | - | 4-8 | Once per project |

```typescript
// Get specific artefact
const getArtefact = {
  TableName: 'AgenticPM',
  Key: {
    PK: `PROJECT#${projectId}`,
    SK: `ARTEFACT#${artefactType}` // delivery_state | raid_log | backlog_summary | decision_log
  }
};

// Update artefact with previous version tracking
const updateArtefact = {
  TableName: 'AgenticPM',
  Key: {
    PK: `PROJECT#${projectId}`,
    SK: `ARTEFACT#${artefactType}`
  },
  UpdateExpression: 'SET content = :newContent, previousVersion = :oldContent, version = version + :inc, updatedAt = :now',
  ExpressionAttributeValues: {
    ':newContent': newContent,
    ':oldContent': currentContent,
    ':inc': 1,
    ':now': new Date().toISOString()
  }
};
```

#### Events

| Operation | Access Pattern | PK | SK | Est. RCU | Est. WCU | Frequency |
|-----------|---------------|----|----|----------|----------|-----------|
| Get project events (recent) | Query (reverse) | `PROJECT#<uuid>` | `begins_with(SK, "EVENT#")` | 2-4 | - | Dashboard poll |
| Write event | PutItem | `PROJECT#<uuid>` | `EVENT#<timestamp>#<ulid>` | - | 1 | Per agent action |
| Write global event | PutItem | `GLOBAL` | `EVENT#<timestamp>#<ulid>` | - | 1 | Per agent cycle |

```typescript
// Get recent project events (most recent first)
const getProjectEvents = {
  TableName: 'AgenticPM',
  KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
  ExpressionAttributeValues: {
    ':pk': `PROJECT#${projectId}`,
    ':prefix': 'EVENT#'
  },
  ScanIndexForward: false, // Descending order
  Limit: 50
};

// Write event with TTL
const writeEvent = {
  TableName: 'AgenticPM',
  Item: {
    PK: `PROJECT#${projectId}`,
    SK: `EVENT#${timestamp}#${ulid}`,
    id: ulid,
    projectId,
    eventType,
    severity,
    summary,
    detail,
    createdAt: timestamp,
    TTL: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 days
    GSI1PK: `EVENT#${dateOnly}`,
    GSI1SK: `${timestamp}#${ulid}`
  }
};
```

#### Escalations

| Operation | Access Pattern | PK | SK | Est. RCU | Est. WCU | Frequency |
|-----------|---------------|----|----|----------|----------|-----------|
| Get escalation | GetItem | `PROJECT#<uuid>` | `ESCALATION#<uuid>` | 0.5 | - | Per view |
| Get project escalations | Query | `PROJECT#<uuid>` | `begins_with(SK, "ESCALATION#")` | 1-2 | - | Dashboard |
| Create escalation | PutItem | `PROJECT#<uuid>` | `ESCALATION#<uuid>` | - | 1 | Per escalation |
| Update escalation (decide) | UpdateItem | `PROJECT#<uuid>` | `ESCALATION#<uuid>` | - | 1 | Per decision |

```typescript
// Get single escalation
const getEscalation = {
  TableName: 'AgenticPM',
  Key: {
    PK: `PROJECT#${projectId}`,
    SK: `ESCALATION#${escalationId}`
  }
};

// Update escalation with user decision
const decideEscalation = {
  TableName: 'AgenticPM',
  Key: {
    PK: `PROJECT#${projectId}`,
    SK: `ESCALATION#${escalationId}`
  },
  UpdateExpression: 'SET #status = :status, userDecision = :decision, userNotes = :notes, decidedAt = :now, GSI1PK = :newGsi1pk',
  ExpressionAttributeNames: {
    '#status': 'status'
  },
  ExpressionAttributeValues: {
    ':status': 'decided',
    ':decision': userDecision,
    ':notes': userNotes,
    ':now': new Date().toISOString(),
    ':newGsi1pk': 'ESCALATION#decided'
  },
  ConditionExpression: '#status = :pending',
  ExpressionAttributeValues: {
    ':pending': 'pending'
  }
};
```

#### Agent Actions

| Operation | Access Pattern | PK | SK | Est. RCU | Est. WCU | Frequency |
|-----------|---------------|----|----|----------|----------|-----------|
| Get project actions | Query (reverse) | `PROJECT#<uuid>` | `begins_with(SK, "ACTION#")` | 2-4 | - | Dashboard |
| Write action | PutItem | `PROJECT#<uuid>` | `ACTION#<timestamp>#<ulid>` | - | 1 | Per action |
| Update action (executed) | UpdateItem | `PROJECT#<uuid>` | `ACTION#<timestamp>#<ulid>` | - | 1 | Hold queue |

```typescript
// Write action with hold queue
const writeAction = {
  TableName: 'AgenticPM',
  Item: {
    PK: `PROJECT#${projectId}`,
    SK: `ACTION#${timestamp}#${ulid}`,
    id: ulid,
    projectId,
    actionType,
    description,
    detail,
    confidence,
    executed: false,
    heldUntil: holdUntilTimestamp, // Optional
    createdAt: timestamp,
    TTL: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90 days
  }
};
```

#### Checkpoints

| Operation | Access Pattern | PK | SK | Est. RCU | Est. WCU | Frequency |
|-----------|---------------|----|----|----------|----------|-----------|
| Get checkpoint | GetItem | `PROJECT#<uuid>` | `CHECKPOINT#<integration>#<key>` | 0.5 | - | Per cycle |
| Update checkpoint | PutItem | `PROJECT#<uuid>` | `CHECKPOINT#<integration>#<key>` | - | 1 | Per cycle |

```typescript
// Get integration checkpoint
const getCheckpoint = {
  TableName: 'AgenticPM',
  Key: {
    PK: `PROJECT#${projectId}`,
    SK: `CHECKPOINT#${integration}#${key}` // e.g., CHECKPOINT#jira#last_sync
  }
};

// Update checkpoint
const updateCheckpoint = {
  TableName: 'AgenticPM',
  Item: {
    PK: `PROJECT#${projectId}`,
    SK: `CHECKPOINT#${integration}#${key}`,
    projectId,
    integration,
    checkpointKey: key,
    checkpointValue: value,
    updatedAt: new Date().toISOString()
  }
};
```

#### Integration Config

| Operation | Access Pattern | PK | SK | Est. RCU | Est. WCU | Frequency |
|-----------|---------------|----|----|----------|----------|-----------|
| Get integration config | GetItem | `INTEGRATION#<name>` | `CONFIG` | 0.5 | - | Per cycle |
| Update integration config | PutItem | `INTEGRATION#<name>` | `CONFIG` | - | 1 | Rare |
| Get all integrations | Query | `INTEGRATION#*` | - | 1-2 | - | Settings page |

```typescript
// Get integration config
const getIntegrationConfig = {
  TableName: 'AgenticPM',
  Key: {
    PK: `INTEGRATION#${integrationName}`, // jira | outlook | ses
    SK: 'CONFIG'
  }
};
```

#### Agent Config

| Operation | Access Pattern | PK | SK | Est. RCU | Est. WCU | Frequency |
|-----------|---------------|----|----|----------|----------|-----------|
| Get config value | GetItem | `AGENT` | `CONFIG#<key>` | 0.5 | - | Per cycle |
| Update config value | PutItem | `AGENT` | `CONFIG#<key>` | - | 1 | Rare |
| Get all config | Query | `AGENT` | `begins_with(SK, "CONFIG#")` | 1 | - | Settings page |

```typescript
// Get all agent config
const getAllAgentConfig = {
  TableName: 'AgenticPM',
  KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
  ExpressionAttributeValues: {
    ':pk': 'AGENT',
    ':prefix': 'CONFIG#'
  }
};

// Update daily budget tracking
const updateDailySpend = {
  TableName: 'AgenticPM',
  Key: {
    PK: 'AGENT',
    SK: `CONFIG#daily_spend_${dateOnly}`
  },
  UpdateExpression: 'SET #value = if_not_exists(#value, :zero) + :amount, updatedAt = :now',
  ExpressionAttributeNames: {
    '#value': 'value'
  },
  ExpressionAttributeValues: {
    ':zero': 0,
    ':amount': spendAmount,
    ':now': new Date().toISOString()
  }
};
```

### 1.4 GSI1 Access Patterns

| Operation | Access Pattern | GSI1PK | GSI1SK | Est. RCU | Frequency |
|-----------|---------------|--------|--------|----------|-----------|
| Get active projects | Query | `STATUS#active` | - | 1 | Dashboard |
| Get pending escalations (global) | Query | `ESCALATION#pending` | - | 1-2 | Dashboard poll |
| Get events by date (global) | Query | `EVENT#<date>` | `<timestamp>#<ulid>` | 2-4 | Activity feed |
| Get held actions (ready) | Query | `ACTIONS#held` | `<= now` | 1-2 | 1-min schedule |

```typescript
// Get all active projects
const getActiveProjects = {
  TableName: 'AgenticPM',
  IndexName: 'GSI1',
  KeyConditionExpression: 'GSI1PK = :status',
  ExpressionAttributeValues: {
    ':status': 'STATUS#active'
  }
};

// Get all pending escalations (cross-project)
const getPendingEscalations = {
  TableName: 'AgenticPM',
  IndexName: 'GSI1',
  KeyConditionExpression: 'GSI1PK = :status',
  ExpressionAttributeValues: {
    ':status': 'ESCALATION#pending'
  },
  ScanIndexForward: false // Most recent first
};

// Get events for today (activity feed)
const getTodayEvents = {
  TableName: 'AgenticPM',
  IndexName: 'GSI1',
  KeyConditionExpression: 'GSI1PK = :dateKey',
  ExpressionAttributeValues: {
    ':dateKey': `EVENT#${todayDateOnly}` // EVENT#2026-02-05
  },
  ScanIndexForward: false,
  Limit: 100
};

// Get held actions ready for execution
const getReadyHeldActions = {
  TableName: 'AgenticPM',
  IndexName: 'GSI1',
  KeyConditionExpression: 'GSI1PK = :held AND GSI1SK <= :now',
  ExpressionAttributeValues: {
    ':held': 'ACTIONS#held',
    ':now': new Date().toISOString()
  }
};
```

### 1.5 Scan Operations

**Policy:** Scans are discouraged. All current access patterns use Query operations. If a scan is ever needed, it should be flagged as a design issue.

| Operation | When used | Mitigation |
|-----------|-----------|------------|
| Full table scan | Never in production | Use GSI or redesign access pattern |
| Debug/admin scan | Development only | Paginate with 1MB limit |

### 1.6 Capacity Estimates (Monthly)

Based on single user, 1-2 active projects, 96 cycles/day:

| Operation Type | Est. Monthly Volume | Est. RCU/WCU |
|----------------|---------------------|--------------|
| Dashboard reads | ~5,000 | 10,000 RCU |
| Activity feed reads | ~3,000 | 12,000 RCU |
| Agent cycle writes (events) | ~90,000 | 90,000 WCU |
| Agent cycle writes (checkpoints) | ~6,000 | 6,000 WCU |
| Artefact updates | ~3,000 | 9,000 WCU |
| Escalation reads/writes | ~500 | 500 RCU + 500 WCU |
| **Total estimated** | | **~23,000 RCU + ~106,000 WCU** |
| **Monthly cost** | | **~$0.25** |

---

## 2. API Routes

### 2.1 Route Overview

All routes are Next.js API routes (`/app/api/**/route.ts`) deployed to AWS Amplify.

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/projects` | GET | List all projects | Required |
| `/api/projects/[id]` | GET | Get project details | Required |
| `/api/projects/[id]/artefacts` | GET | Get all artefacts for project | Required |
| `/api/projects/[id]/autonomy` | POST | Update project autonomy level | Required |
| `/api/events` | GET | Get activity feed (paginated) | Required |
| `/api/escalations` | GET | Get pending escalations | Required |
| `/api/escalations/[id]` | GET | Get escalation details | Required |
| `/api/escalations/[id]/decide` | POST | Submit user decision | Required |
| `/api/agent/status` | GET | Get agent health status | Required |
| `/api/agent/config` | GET | Get agent configuration | Required |
| `/api/agent/config` | POST | Update agent configuration | Required |
| `/api/integrations` | GET | Get integration status | Required |

### 2.2 Detailed Route Specifications

#### GET /api/projects

List all projects with summary information.

**Query Parameters:**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| status | string | No | `active` | Filter by status: `active`, `paused`, `archived`, `all` |

**Response:** `200 OK`
```typescript
interface ProjectListResponse {
  projects: ProjectSummary[];
  count: number;
}

interface ProjectSummary {
  id: string;
  name: string;
  status: ProjectStatus;
  source: IntegrationSource;
  sourceProjectKey: string;
  autonomyLevel: AutonomyLevel;
  healthStatus: 'healthy' | 'warning' | 'error';
  pendingEscalations: number;
  lastActivity: string; // ISO 8601
  updatedAt: string; // ISO 8601
}
```

**DynamoDB Query:** GSI1 query on `STATUS#<status>`

---

#### GET /api/projects/[id]

Get full project details including metadata.

**Path Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| id | string (UUID) | Project ID |

**Response:** `200 OK`
```typescript
interface ProjectDetailResponse {
  project: Project;
  stats: ProjectStats;
}

interface ProjectStats {
  eventsLast24h: number;
  actionsLast24h: number;
  pendingEscalations: number;
  lastHeartbeat: string | null;
}
```

**Error Responses:**
- `404 Not Found`: Project does not exist

---

#### GET /api/projects/[id]/artefacts

Get all artefacts for a project.

**Path Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| id | string (UUID) | Project ID |

**Query Parameters:**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| type | string | No | all | Filter by type: `delivery_state`, `raid_log`, `backlog_summary`, `decision_log` |
| includePrevious | boolean | No | false | Include previousVersion for diff view |

**Response:** `200 OK`
```typescript
interface ArtefactsResponse {
  artefacts: Artefact[];
  projectId: string;
}
```

---

#### POST /api/projects/[id]/autonomy

Update project autonomy level.

**Path Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| id | string (UUID) | Project ID |

**Request Body:**
```typescript
interface AutonomyUpdateRequest {
  level: AutonomyLevel; // 'monitoring' | 'artefact' | 'tactical'
  reason?: string; // Optional audit note
}
```

**Response:** `200 OK`
```typescript
interface AutonomyUpdateResponse {
  project: Project;
  previousLevel: AutonomyLevel;
  newLevel: AutonomyLevel;
  updatedAt: string;
}
```

**Validation:**
- Level must be valid AutonomyLevel
- Cannot skip levels (must graduate through monitoring -> artefact -> tactical)
- Downgrade is always allowed

---

#### GET /api/events

Get activity feed with pagination.

**Query Parameters:**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| projectId | string | No | all | Filter by project |
| eventType | string | No | all | Filter by event type |
| severity | string | No | all | Filter by severity |
| limit | number | No | 50 | Max items to return (max 200) |
| cursor | string | No | - | Pagination cursor (base64 encoded LastEvaluatedKey) |
| since | string | No | - | ISO 8601 timestamp, only events after this time |

**Response:** `200 OK`
```typescript
interface EventsResponse {
  events: Event[];
  nextCursor: string | null;
  hasMore: boolean;
}
```

**DynamoDB Query:**
- If projectId specified: Query on `PROJECT#<id>` with SK prefix `EVENT#`
- If no projectId: GSI1 query on `EVENT#<date>`

---

#### GET /api/escalations

Get pending escalations across all projects.

**Query Parameters:**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| status | string | No | `pending` | Filter: `pending`, `decided`, `expired`, `all` |
| projectId | string | No | all | Filter by project |
| limit | number | No | 20 | Max items to return |

**Response:** `200 OK`
```typescript
interface EscalationsResponse {
  escalations: Escalation[];
  count: number;
}
```

**DynamoDB Query:** GSI1 query on `ESCALATION#<status>`

---

#### GET /api/escalations/[id]

Get full escalation details.

**Path Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| id | string (UUID) | Escalation ID |

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| projectId | string | Yes | Project ID (required for DynamoDB key) |

**Response:** `200 OK`
```typescript
interface EscalationDetailResponse {
  escalation: Escalation;
  project: ProjectSummary;
  relatedEvents: Event[];
}
```

---

#### POST /api/escalations/[id]/decide

Submit user decision on an escalation.

**Path Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| id | string (UUID) | Escalation ID |

**Request Body:**
```typescript
interface EscalationDecisionRequest {
  projectId: string; // Required for DynamoDB key
  decision: string; // Selected option
  notes?: string; // Optional user notes
}
```

**Response:** `200 OK`
```typescript
interface EscalationDecisionResponse {
  escalation: Escalation;
  decidedAt: string;
}
```

**Validation:**
- Decision must match one of the escalation options
- Escalation must be in `pending` status
- Uses conditional write to prevent race conditions

**Error Responses:**
- `400 Bad Request`: Invalid decision or missing projectId
- `404 Not Found`: Escalation not found
- `409 Conflict`: Escalation already decided

---

#### GET /api/agent/status

Get current agent health and status.

**Response:** `200 OK`
```typescript
interface AgentStatusResponse {
  status: 'active' | 'paused' | 'error' | 'starting';
  lastHeartbeat: string | null;
  nextScheduledRun: string;
  currentCycleState: string | null;
  integrations: IntegrationHealth[];
  budgetStatus: BudgetStatus;
  error?: string;
}

interface IntegrationHealth {
  name: IntegrationSource;
  status: 'healthy' | 'degraded' | 'error';
  lastCheck: string;
  errorMessage?: string;
}

interface BudgetStatus {
  dailySpendUsd: number;
  dailyLimitUsd: number;
  monthlySpendUsd: number;
  monthlyLimitUsd: number;
  degradationTier: 0 | 1 | 2 | 3;
}
```

**Data Sources:**
- Last heartbeat event from GLOBAL partition
- Budget from AGENT config
- Integration health from last cycle

---

#### GET /api/agent/config

Get agent configuration.

**Response:** `200 OK`
```typescript
interface AgentConfigResponse {
  config: AgentConfig;
}

interface AgentConfig {
  pollingIntervalMinutes: number;
  budgetCeilingDailyUsd: number;
  holdQueueMinutes: number;
  workingHours: {
    start: string; // HH:mm
    end: string; // HH:mm
    timezone: string;
  };
  llmSplit: {
    haikuPercent: number;
    sonnetPercent: number;
  };
}
```

---

#### POST /api/agent/config

Update agent configuration.

**Request Body:**
```typescript
interface AgentConfigUpdateRequest {
  pollingIntervalMinutes?: number; // 5-60
  holdQueueMinutes?: number; // 1-120
  workingHours?: {
    start: string;
    end: string;
    timezone: string;
  };
}
```

**Response:** `200 OK`
```typescript
interface AgentConfigUpdateResponse {
  config: AgentConfig;
  updatedFields: string[];
  updatedAt: string;
}
```

**Validation:**
- pollingIntervalMinutes: 5-60
- holdQueueMinutes: 1-120
- Budget ceiling is not user-configurable (hardcoded)
- LLM split is not user-configurable (hardcoded)

---

#### GET /api/integrations

Get status of all integrations.

**Response:** `200 OK`
```typescript
interface IntegrationsResponse {
  integrations: IntegrationConfig[];
}
```

---

### 2.3 Error Response Format

All error responses follow a consistent format:

```typescript
interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  requestId: string;
  timestamp: string;
}
```

**Standard Error Codes:**
| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid session |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request body/params |
| `CONFLICT` | 409 | Resource state conflict |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `SERVICE_UNAVAILABLE` | 503 | DynamoDB or external service down |

---

## 3. TypeScript Interfaces

### 3.1 Core Entity Types

```typescript
// ============================================================================
// Core Entity Types
// ============================================================================

/**
 * Project status values
 */
export type ProjectStatus = 'active' | 'paused' | 'archived';

/**
 * Integration source types
 */
export type IntegrationSource = 'jira' | 'outlook' | 'asana' | 'ses';

/**
 * Autonomy levels (mapped to numeric values for graduation logic)
 */
export type AutonomyLevel = 'monitoring' | 'artefact' | 'tactical';

export const AutonomyLevelValue: Record<AutonomyLevel, number> = {
  monitoring: 1,
  artefact: 2,
  tactical: 3,
};

/**
 * Artefact types
 */
export type ArtefactType =
  | 'delivery_state'
  | 'raid_log'
  | 'backlog_summary'
  | 'decision_log';

/**
 * Event severity levels
 */
export type EventSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * Event types
 */
export type EventType =
  | 'heartbeat'
  | 'heartbeat_with_changes'
  | 'signal_detected'
  | 'action_taken'
  | 'action_held'
  | 'action_approved'
  | 'action_rejected'
  | 'escalation_created'
  | 'escalation_decided'
  | 'escalation_expired'
  | 'artefact_updated'
  | 'integration_error'
  | 'budget_warning'
  | 'error';

/**
 * Escalation status
 */
export type EscalationStatus = 'pending' | 'decided' | 'expired' | 'superseded';

/**
 * Agent action types
 */
export type ActionType =
  | 'artefact_update'
  | 'email_sent'
  | 'email_held'
  | 'jira_comment'
  | 'jira_status_change'
  | 'jira_status_change_held'
  | 'escalation_created'
  | 'notification_sent';

/**
 * Integration status
 */
export type IntegrationStatus = 'active' | 'inactive' | 'error';
```

### 3.2 Entity Interfaces

```typescript
// ============================================================================
// Entity Interfaces
// ============================================================================

/**
 * Project entity
 */
export interface Project {
  id: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  source: IntegrationSource;
  sourceProjectKey: string;
  autonomyLevel: AutonomyLevel;
  config: ProjectConfig;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface ProjectConfig {
  /** Custom polling interval override (optional) */
  pollingIntervalMinutes?: number;
  /** Custom hold queue duration override (optional) */
  holdQueueMinutes?: number;
  /** Jira board ID for this project */
  jiraBoardId?: string;
  /** Email addresses to monitor for this project */
  monitoredEmails?: string[];
}

/**
 * Artefact entity
 */
export interface Artefact<T extends ArtefactContent = ArtefactContent> {
  id: string;
  projectId: string;
  type: ArtefactType;
  content: T;
  previousVersion?: T;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Event entity
 */
export interface Event {
  id: string; // ULID
  projectId?: string; // null for global events
  eventType: EventType;
  severity: EventSeverity;
  summary: string;
  detail?: EventDetail;
  createdAt: string;
}

export interface EventDetail {
  /** Source of the event (integration name) */
  source?: string;
  /** Related entity IDs */
  relatedIds?: {
    artefactId?: string;
    escalationId?: string;
    actionId?: string;
    signalId?: string;
  };
  /** Metrics for this event */
  metrics?: {
    durationMs?: number;
    tokensUsed?: number;
    costUsd?: number;
  };
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Escalation entity
 */
export interface Escalation {
  id: string;
  projectId: string;
  title: string;
  context: EscalationContext;
  options: EscalationOption[];
  agentRecommendation?: string;
  agentRationale?: string;
  status: EscalationStatus;
  userDecision?: string;
  userNotes?: string;
  decidedAt?: string;
  createdAt: string;
}

export interface EscalationContext {
  /** Summary of the situation requiring decision */
  summary: string;
  /** Signals that triggered this escalation */
  triggeringSignals: SignalReference[];
  /** Relevant artefact excerpts */
  relevantArtefacts?: ArtefactExcerpt[];
  /** Historical context */
  precedents?: string[];
}

export interface EscalationOption {
  id: string;
  label: string;
  description: string;
  pros: string[];
  cons: string[];
  riskLevel: 'low' | 'medium' | 'high';
}

export interface SignalReference {
  source: IntegrationSource;
  type: string;
  summary: string;
  timestamp: string;
}

export interface ArtefactExcerpt {
  artefactType: ArtefactType;
  excerpt: string;
}

/**
 * Agent Action entity
 */
export interface AgentAction {
  id: string; // ULID
  projectId?: string;
  actionType: ActionType;
  description: string;
  detail?: ActionDetail;
  confidence?: ConfidenceScore;
  executed: boolean;
  heldUntil?: string;
  executedAt?: string;
  createdAt: string;
}

export interface ActionDetail {
  /** Target of the action */
  target?: {
    type: 'artefact' | 'jira_ticket' | 'email' | 'escalation';
    id: string;
    name?: string;
  };
  /** Before/after for updates */
  changes?: {
    before?: unknown;
    after?: unknown;
  };
  /** Draft content for held actions */
  draftContent?: string;
  /** Reason for hold queue */
  holdReason?: string;
}

/**
 * Agent Checkpoint entity
 */
export interface AgentCheckpoint {
  projectId: string;
  integration: IntegrationSource;
  checkpointKey: string;
  checkpointValue: string;
  updatedAt: string;
}

/**
 * Integration Config entity
 */
export interface IntegrationConfig {
  id: string;
  integration: IntegrationSource;
  configEncrypted: string; // Base64 KMS-encrypted
  status: IntegrationStatus;
  lastHealthCheck?: string;
  createdAt: string;
  updatedAt: string;
}
```

### 3.3 Signal Types

```typescript
// ============================================================================
// Signal Processing Types
// ============================================================================

/**
 * Raw signal from integration (before normalisation)
 */
export interface RawSignal {
  source: IntegrationSource;
  timestamp: string;
  rawPayload: unknown;
}

/**
 * Normalised signal (after normalisation, before triage)
 */
export interface NormalisedSignal {
  id: string; // Generated ULID
  source: IntegrationSource;
  timestamp: string;
  type: SignalType;
  summary: string;
  raw: Record<string, unknown>;
  projectId: string;
  metadata?: SignalMetadata;
}

export type SignalType =
  // Jira signals
  | 'ticket_created'
  | 'ticket_updated'
  | 'ticket_status_changed'
  | 'ticket_assigned'
  | 'ticket_commented'
  | 'sprint_started'
  | 'sprint_closed'
  | 'sprint_scope_changed'
  // Outlook signals
  | 'email_received'
  | 'email_thread_updated'
  // Generic
  | 'unknown';

export interface SignalMetadata {
  /** Priority/urgency from source system */
  priority?: 'critical' | 'high' | 'medium' | 'low';
  /** People involved */
  participants?: string[];
  /** Related ticket IDs */
  relatedTickets?: string[];
  /** Tags/labels from source */
  tags?: string[];
}

/**
 * Sanitised signal (after triage sanitisation, safe for reasoning)
 */
export interface SanitisedSignal extends NormalisedSignal {
  /** Original content has been sanitised */
  sanitised: true;
  /** Content stripped of potential injection attempts */
  sanitisedSummary: string;
  /** Sanitisation applied */
  sanitisationNotes?: string[];
}

/**
 * Classified signal (after triage classification)
 */
export interface ClassifiedSignal extends SanitisedSignal {
  classification: SignalClassification;
}

export interface SignalClassification {
  /** Overall importance */
  importance: 'critical' | 'high' | 'medium' | 'low' | 'noise';
  /** Categories this signal belongs to */
  categories: SignalCategory[];
  /** Recommended action type */
  recommendedAction: RecommendedAction;
  /** Should this go to Sonnet for complex reasoning? */
  requiresComplexReasoning: boolean;
  /** Reasoning for classification */
  rationale: string;
}

export type SignalCategory =
  | 'blocker'
  | 'risk'
  | 'scope_change'
  | 'deadline_impact'
  | 'stakeholder_communication'
  | 'routine_update'
  | 'noise';

export type RecommendedAction =
  | 'update_artefact'
  | 'create_escalation'
  | 'send_notification'
  | 'hold_for_review'
  | 'ignore';
```

### 3.4 Confidence Scoring Types

```typescript
// ============================================================================
// Confidence Scoring Types
// ============================================================================

/**
 * Multi-dimensional confidence score (never LLM self-reported)
 */
export interface ConfidenceScore {
  /** Overall pass/fail (all dimensions must pass) */
  pass: boolean;
  /** Individual dimension scores */
  dimensions: ConfidenceDimensions;
  /** Timestamp of scoring */
  scoredAt: string;
}

export interface ConfidenceDimensions {
  /**
   * Source Agreement: Do multiple sources corroborate?
   * Computed deterministically by counting confirming signals
   */
  sourceAgreement: DimensionScore;

  /**
   * Boundary Compliance: Is action within defined boundaries?
   * Computed deterministically via decisionBoundaries lookup
   */
  boundaryCompliance: DimensionScore;

  /**
   * Schema Validity: Did Claude return valid structured output?
   * Computed deterministically via Zod validation
   */
  schemaValidity: DimensionScore;

  /**
   * Precedent Match: Has this type of action succeeded before?
   * Computed via query of similar past actions
   */
  precedentMatch: DimensionScore;
}

export interface DimensionScore {
  pass: boolean;
  score: number; // 0.0 - 1.0
  evidence: string;
}

/**
 * Decision boundary definitions
 */
export interface DecisionBoundaries {
  canAutoExecute: ActionType[];
  requireHoldQueue: ActionType[];
  requireApproval: ActionType[];
  neverDo: string[];
}

export const decisionBoundaries: DecisionBoundaries = {
  canAutoExecute: [
    'artefact_update',
    'notification_sent',
    'jira_comment',
  ],
  requireHoldQueue: [
    'email_sent',
    'jira_status_change',
  ],
  requireApproval: [
    'escalation_created', // For external email or new tickets
  ],
  neverDo: [
    'delete_data',
    'share_confidential',
    'modify_integration_config',
    'change_own_autonomy_level',
  ],
};
```

### 3.5 Artefact Content Types

```typescript
// ============================================================================
// Artefact Content Types
// ============================================================================

/**
 * Union type for all artefact content
 */
export type ArtefactContent =
  | DeliveryStateContent
  | RaidLogContent
  | BacklogSummaryContent
  | DecisionLogContent;

/**
 * Delivery State artefact content
 */
export interface DeliveryStateContent {
  overallStatus: 'green' | 'amber' | 'red';
  statusSummary: string;
  currentSprint?: SprintInfo;
  milestones: Milestone[];
  blockers: Blocker[];
  keyMetrics: KeyMetrics;
  nextActions: string[];
}

export interface SprintInfo {
  name: string;
  startDate: string;
  endDate: string;
  goal: string;
  progress: SprintProgress;
}

export interface SprintProgress {
  totalPoints: number;
  completedPoints: number;
  inProgressPoints: number;
  blockedPoints: number;
}

export interface Milestone {
  name: string;
  dueDate: string;
  status: 'on_track' | 'at_risk' | 'delayed' | 'completed';
  notes?: string;
}

export interface Blocker {
  id: string;
  description: string;
  owner: string;
  raisedDate: string;
  severity: 'high' | 'medium' | 'low';
  sourceTicket?: string;
}

export interface KeyMetrics {
  velocityTrend: 'increasing' | 'stable' | 'decreasing';
  avgCycleTimeDays: number;
  openBlockers: number;
  activeRisks: number;
}

/**
 * RAID Log artefact content
 */
export interface RaidLogContent {
  items: RaidItem[];
}

export interface RaidItem {
  id: string;
  type: 'risk' | 'assumption' | 'issue' | 'dependency';
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'mitigating' | 'resolved' | 'accepted' | 'closed';
  owner: string;
  raisedDate: string;
  dueDate?: string;
  mitigation?: string;
  resolution?: string;
  resolvedDate?: string;
  source: 'agent_detected' | 'user_added' | 'integration_signal';
  sourceReference?: string;
  lastReviewed: string;
}

/**
 * Decision Log artefact content
 */
export interface DecisionLogContent {
  decisions: Decision[];
}

export interface Decision {
  id: string;
  title: string;
  context: string;
  optionsConsidered: DecisionOption[];
  decision: string;
  rationale: string;
  madeBy: 'user' | 'agent';
  date: string;
  status: 'active' | 'superseded' | 'reversed';
  relatedRaidItems?: string[];
}

export interface DecisionOption {
  option: string;
  pros: string[];
  cons: string[];
}

/**
 * Backlog Summary artefact content
 */
export interface BacklogSummaryContent {
  source: IntegrationSource;
  lastSynced: string;
  summary: BacklogStats;
  highlights: BacklogHighlight[];
  refinementCandidates: RefinementCandidate[];
  scopeNotes?: string;
}

export interface BacklogStats {
  totalItems: number;
  byStatus: {
    toDo: number;
    inProgress: number;
    doneThisSprint: number;
    blocked: number;
  };
  byPriority: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

export interface BacklogHighlight {
  ticketId: string;
  title: string;
  flag: 'blocked' | 'stale' | 'missing_criteria' | 'scope_creep' | 'new';
  detail: string;
  suggestedAction?: string;
}

export interface RefinementCandidate {
  ticketId: string;
  title: string;
  issue: string;
}
```

### 3.6 API Request/Response Types

```typescript
// ============================================================================
// API Request/Response Types
// ============================================================================

// ---- Projects ----

export interface ProjectListResponse {
  projects: ProjectSummary[];
  count: number;
}

export interface ProjectSummary {
  id: string;
  name: string;
  status: ProjectStatus;
  source: IntegrationSource;
  sourceProjectKey: string;
  autonomyLevel: AutonomyLevel;
  healthStatus: 'healthy' | 'warning' | 'error';
  pendingEscalations: number;
  lastActivity: string;
  updatedAt: string;
}

export interface ProjectDetailResponse {
  project: Project;
  stats: ProjectStats;
}

export interface ProjectStats {
  eventsLast24h: number;
  actionsLast24h: number;
  pendingEscalations: number;
  lastHeartbeat: string | null;
}

export interface ArtefactsResponse {
  artefacts: Artefact[];
  projectId: string;
}

export interface AutonomyUpdateRequest {
  level: AutonomyLevel;
  reason?: string;
}

export interface AutonomyUpdateResponse {
  project: Project;
  previousLevel: AutonomyLevel;
  newLevel: AutonomyLevel;
  updatedAt: string;
}

// ---- Events ----

export interface EventsRequest {
  projectId?: string;
  eventType?: EventType;
  severity?: EventSeverity;
  limit?: number;
  cursor?: string;
  since?: string;
}

export interface EventsResponse {
  events: Event[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ---- Escalations ----

export interface EscalationsResponse {
  escalations: Escalation[];
  count: number;
}

export interface EscalationDetailResponse {
  escalation: Escalation;
  project: ProjectSummary;
  relatedEvents: Event[];
}

export interface EscalationDecisionRequest {
  projectId: string;
  decision: string;
  notes?: string;
}

export interface EscalationDecisionResponse {
  escalation: Escalation;
  decidedAt: string;
}

// ---- Agent ----

export interface AgentStatusResponse {
  status: 'active' | 'paused' | 'error' | 'starting';
  lastHeartbeat: string | null;
  nextScheduledRun: string;
  currentCycleState: string | null;
  integrations: IntegrationHealthStatus[];
  budgetStatus: BudgetStatus;
  error?: string;
}

export interface IntegrationHealthStatus {
  name: IntegrationSource;
  status: 'healthy' | 'degraded' | 'error';
  lastCheck: string;
  errorMessage?: string;
}

export interface BudgetStatus {
  dailySpendUsd: number;
  dailyLimitUsd: number;
  monthlySpendUsd: number;
  monthlyLimitUsd: number;
  degradationTier: 0 | 1 | 2 | 3;
}

export interface AgentConfigResponse {
  config: AgentConfigData;
}

export interface AgentConfigData {
  pollingIntervalMinutes: number;
  budgetCeilingDailyUsd: number;
  holdQueueMinutes: number;
  workingHours: WorkingHours;
  llmSplit: LlmSplit;
}

export interface WorkingHours {
  start: string;
  end: string;
  timezone: string;
}

export interface LlmSplit {
  haikuPercent: number;
  sonnetPercent: number;
}

export interface AgentConfigUpdateRequest {
  pollingIntervalMinutes?: number;
  holdQueueMinutes?: number;
  workingHours?: WorkingHours;
}

export interface AgentConfigUpdateResponse {
  config: AgentConfigData;
  updatedFields: string[];
  updatedAt: string;
}

// ---- Integrations ----

export interface IntegrationsResponse {
  integrations: IntegrationConfig[];
}

// ---- Error Response ----

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  requestId: string;
  timestamp: string;
}
```

---

## 4. Zod Schemas

### 4.1 Core Validation Schemas

```typescript
import { z } from 'zod';

// ============================================================================
// Primitive Schemas
// ============================================================================

export const ProjectStatusSchema = z.enum(['active', 'paused', 'archived']);

export const IntegrationSourceSchema = z.enum(['jira', 'outlook', 'asana', 'ses']);

export const AutonomyLevelSchema = z.enum(['monitoring', 'artefact', 'tactical']);

export const ArtefactTypeSchema = z.enum([
  'delivery_state',
  'raid_log',
  'backlog_summary',
  'decision_log',
]);

export const EventSeveritySchema = z.enum(['info', 'warning', 'error', 'critical']);

export const EventTypeSchema = z.enum([
  'heartbeat',
  'heartbeat_with_changes',
  'signal_detected',
  'action_taken',
  'action_held',
  'action_approved',
  'action_rejected',
  'escalation_created',
  'escalation_decided',
  'escalation_expired',
  'artefact_updated',
  'integration_error',
  'budget_warning',
  'error',
]);

export const EscalationStatusSchema = z.enum([
  'pending',
  'decided',
  'expired',
  'superseded',
]);

export const ActionTypeSchema = z.enum([
  'artefact_update',
  'email_sent',
  'email_held',
  'jira_comment',
  'jira_status_change',
  'jira_status_change_held',
  'escalation_created',
  'notification_sent',
]);

export const IntegrationStatusSchema = z.enum(['active', 'inactive', 'error']);

// ISO 8601 datetime string
export const IsoDateTimeSchema = z.string().datetime();

// UUID v4
export const UuidSchema = z.string().uuid();

// ULID
export const UlidSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
```

### 4.2 Entity Schemas

```typescript
// ============================================================================
// Entity Schemas
// ============================================================================

export const ProjectConfigSchema = z.object({
  pollingIntervalMinutes: z.number().min(5).max(60).optional(),
  holdQueueMinutes: z.number().min(1).max(120).optional(),
  jiraBoardId: z.string().optional(),
  monitoredEmails: z.array(z.string().email()).optional(),
});

export const ProjectSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  status: ProjectStatusSchema,
  source: IntegrationSourceSchema,
  sourceProjectKey: z.string().min(1).max(50),
  autonomyLevel: AutonomyLevelSchema,
  config: ProjectConfigSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export const EventDetailSchema = z.object({
  source: z.string().optional(),
  relatedIds: z.object({
    artefactId: z.string().optional(),
    escalationId: z.string().optional(),
    actionId: z.string().optional(),
    signalId: z.string().optional(),
  }).optional(),
  metrics: z.object({
    durationMs: z.number().optional(),
    tokensUsed: z.number().optional(),
    costUsd: z.number().optional(),
  }).optional(),
  context: z.record(z.unknown()).optional(),
});

export const EventSchema = z.object({
  id: UlidSchema,
  projectId: UuidSchema.optional(),
  eventType: EventTypeSchema,
  severity: EventSeveritySchema,
  summary: z.string().min(1).max(500),
  detail: EventDetailSchema.optional(),
  createdAt: IsoDateTimeSchema,
});

export const EscalationOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(100),
  description: z.string().max(1000),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
  riskLevel: z.enum(['low', 'medium', 'high']),
});

export const SignalReferenceSchema = z.object({
  source: IntegrationSourceSchema,
  type: z.string(),
  summary: z.string(),
  timestamp: IsoDateTimeSchema,
});

export const ArtefactExcerptSchema = z.object({
  artefactType: ArtefactTypeSchema,
  excerpt: z.string(),
});

export const EscalationContextSchema = z.object({
  summary: z.string().min(1).max(2000),
  triggeringSignals: z.array(SignalReferenceSchema),
  relevantArtefacts: z.array(ArtefactExcerptSchema).optional(),
  precedents: z.array(z.string()).optional(),
});

export const EscalationSchema = z.object({
  id: UuidSchema,
  projectId: UuidSchema,
  title: z.string().min(1).max(200),
  context: EscalationContextSchema,
  options: z.array(EscalationOptionSchema).min(2).max(5),
  agentRecommendation: z.string().optional(),
  agentRationale: z.string().max(1000).optional(),
  status: EscalationStatusSchema,
  userDecision: z.string().optional(),
  userNotes: z.string().max(2000).optional(),
  decidedAt: IsoDateTimeSchema.optional(),
  createdAt: IsoDateTimeSchema,
});

export const DimensionScoreSchema = z.object({
  pass: z.boolean(),
  score: z.number().min(0).max(1),
  evidence: z.string(),
});

export const ConfidenceDimensionsSchema = z.object({
  sourceAgreement: DimensionScoreSchema,
  boundaryCompliance: DimensionScoreSchema,
  schemaValidity: DimensionScoreSchema,
  precedentMatch: DimensionScoreSchema,
});

export const ConfidenceScoreSchema = z.object({
  pass: z.boolean(),
  dimensions: ConfidenceDimensionsSchema,
  scoredAt: IsoDateTimeSchema,
});

export const ActionDetailSchema = z.object({
  target: z.object({
    type: z.enum(['artefact', 'jira_ticket', 'email', 'escalation']),
    id: z.string(),
    name: z.string().optional(),
  }).optional(),
  changes: z.object({
    before: z.unknown().optional(),
    after: z.unknown().optional(),
  }).optional(),
  draftContent: z.string().optional(),
  holdReason: z.string().optional(),
});

export const AgentActionSchema = z.object({
  id: UlidSchema,
  projectId: UuidSchema.optional(),
  actionType: ActionTypeSchema,
  description: z.string().min(1).max(500),
  detail: ActionDetailSchema.optional(),
  confidence: ConfidenceScoreSchema.optional(),
  executed: z.boolean(),
  heldUntil: IsoDateTimeSchema.optional(),
  executedAt: IsoDateTimeSchema.optional(),
  createdAt: IsoDateTimeSchema,
});

export const AgentCheckpointSchema = z.object({
  projectId: UuidSchema,
  integration: IntegrationSourceSchema,
  checkpointKey: z.string().min(1).max(100),
  checkpointValue: z.string(),
  updatedAt: IsoDateTimeSchema,
});

export const IntegrationConfigSchema = z.object({
  id: UuidSchema,
  integration: IntegrationSourceSchema,
  configEncrypted: z.string(), // Base64
  status: IntegrationStatusSchema,
  lastHealthCheck: IsoDateTimeSchema.optional(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
```

### 4.3 Artefact Content Schemas

```typescript
// ============================================================================
// Artefact Content Schemas
// ============================================================================

// ---- Delivery State ----

export const SprintProgressSchema = z.object({
  totalPoints: z.number().min(0),
  completedPoints: z.number().min(0),
  inProgressPoints: z.number().min(0),
  blockedPoints: z.number().min(0),
});

export const SprintInfoSchema = z.object({
  name: z.string().min(1).max(100),
  startDate: IsoDateTimeSchema,
  endDate: IsoDateTimeSchema,
  goal: z.string().max(500),
  progress: SprintProgressSchema,
});

export const MilestoneSchema = z.object({
  name: z.string().min(1).max(200),
  dueDate: IsoDateTimeSchema,
  status: z.enum(['on_track', 'at_risk', 'delayed', 'completed']),
  notes: z.string().max(500).optional(),
});

export const BlockerSchema = z.object({
  id: z.string().min(1).max(20),
  description: z.string().min(1).max(500),
  owner: z.string().min(1).max(100),
  raisedDate: IsoDateTimeSchema,
  severity: z.enum(['high', 'medium', 'low']),
  sourceTicket: z.string().max(50).optional(),
});

export const KeyMetricsSchema = z.object({
  velocityTrend: z.enum(['increasing', 'stable', 'decreasing']),
  avgCycleTimeDays: z.number().min(0),
  openBlockers: z.number().min(0),
  activeRisks: z.number().min(0),
});

export const DeliveryStateContentSchema = z.object({
  overallStatus: z.enum(['green', 'amber', 'red']),
  statusSummary: z.string().min(1).max(1000),
  currentSprint: SprintInfoSchema.optional(),
  milestones: z.array(MilestoneSchema),
  blockers: z.array(BlockerSchema),
  keyMetrics: KeyMetricsSchema,
  nextActions: z.array(z.string().max(200)).max(10),
});

// ---- RAID Log ----

export const RaidItemSchema = z.object({
  id: z.string().min(1).max(20),
  type: z.enum(['risk', 'assumption', 'issue', 'dependency']),
  title: z.string().min(1).max(200),
  description: z.string().max(2000),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  status: z.enum(['open', 'mitigating', 'resolved', 'accepted', 'closed']),
  owner: z.string().min(1).max(100),
  raisedDate: IsoDateTimeSchema,
  dueDate: IsoDateTimeSchema.optional(),
  mitigation: z.string().max(1000).optional(),
  resolution: z.string().max(1000).optional(),
  resolvedDate: IsoDateTimeSchema.optional(),
  source: z.enum(['agent_detected', 'user_added', 'integration_signal']),
  sourceReference: z.string().max(100).optional(),
  lastReviewed: IsoDateTimeSchema,
});

export const RaidLogContentSchema = z.object({
  items: z.array(RaidItemSchema),
});

// ---- Decision Log ----

export const DecisionOptionSchema = z.object({
  option: z.string().min(1).max(200),
  pros: z.array(z.string().max(200)),
  cons: z.array(z.string().max(200)),
});

export const DecisionSchema = z.object({
  id: z.string().min(1).max(20),
  title: z.string().min(1).max(200),
  context: z.string().max(2000),
  optionsConsidered: z.array(DecisionOptionSchema).min(1),
  decision: z.string().min(1).max(200),
  rationale: z.string().max(1000),
  madeBy: z.enum(['user', 'agent']),
  date: IsoDateTimeSchema,
  status: z.enum(['active', 'superseded', 'reversed']),
  relatedRaidItems: z.array(z.string()).optional(),
});

export const DecisionLogContentSchema = z.object({
  decisions: z.array(DecisionSchema),
});

// ---- Backlog Summary ----

export const BacklogStatsSchema = z.object({
  totalItems: z.number().min(0),
  byStatus: z.object({
    toDo: z.number().min(0),
    inProgress: z.number().min(0),
    doneThisSprint: z.number().min(0),
    blocked: z.number().min(0),
  }),
  byPriority: z.object({
    critical: z.number().min(0),
    high: z.number().min(0),
    medium: z.number().min(0),
    low: z.number().min(0),
  }),
});

export const BacklogHighlightSchema = z.object({
  ticketId: z.string().min(1).max(50),
  title: z.string().min(1).max(200),
  flag: z.enum(['blocked', 'stale', 'missing_criteria', 'scope_creep', 'new']),
  detail: z.string().max(500),
  suggestedAction: z.string().max(200).optional(),
});

export const RefinementCandidateSchema = z.object({
  ticketId: z.string().min(1).max(50),
  title: z.string().min(1).max(200),
  issue: z.string().max(500),
});

export const BacklogSummaryContentSchema = z.object({
  source: IntegrationSourceSchema,
  lastSynced: IsoDateTimeSchema,
  summary: BacklogStatsSchema,
  highlights: z.array(BacklogHighlightSchema),
  refinementCandidates: z.array(RefinementCandidateSchema),
  scopeNotes: z.string().max(500).optional(),
});

// ---- Union Schema ----

export const ArtefactContentSchema = z.union([
  DeliveryStateContentSchema,
  RaidLogContentSchema,
  BacklogSummaryContentSchema,
  DecisionLogContentSchema,
]);

// ---- Artefact with typed content ----

export const ArtefactSchema = z.object({
  id: UuidSchema,
  projectId: UuidSchema,
  type: ArtefactTypeSchema,
  content: ArtefactContentSchema,
  previousVersion: ArtefactContentSchema.optional(),
  version: z.number().int().min(1),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

// Type-specific artefact schemas for use with tool-use
export const DeliveryStateArtefactSchema = ArtefactSchema.extend({
  type: z.literal('delivery_state'),
  content: DeliveryStateContentSchema,
  previousVersion: DeliveryStateContentSchema.optional(),
});

export const RaidLogArtefactSchema = ArtefactSchema.extend({
  type: z.literal('raid_log'),
  content: RaidLogContentSchema,
  previousVersion: RaidLogContentSchema.optional(),
});

export const BacklogSummaryArtefactSchema = ArtefactSchema.extend({
  type: z.literal('backlog_summary'),
  content: BacklogSummaryContentSchema,
  previousVersion: BacklogSummaryContentSchema.optional(),
});

export const DecisionLogArtefactSchema = ArtefactSchema.extend({
  type: z.literal('decision_log'),
  content: DecisionLogContentSchema,
  previousVersion: DecisionLogContentSchema.optional(),
});
```

### 4.4 Signal Schemas

```typescript
// ============================================================================
// Signal Schemas
// ============================================================================

export const SignalTypeSchema = z.enum([
  'ticket_created',
  'ticket_updated',
  'ticket_status_changed',
  'ticket_assigned',
  'ticket_commented',
  'sprint_started',
  'sprint_closed',
  'sprint_scope_changed',
  'email_received',
  'email_thread_updated',
  'unknown',
]);

export const SignalMetadataSchema = z.object({
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  participants: z.array(z.string()).optional(),
  relatedTickets: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

export const NormalisedSignalSchema = z.object({
  id: UlidSchema,
  source: IntegrationSourceSchema,
  timestamp: IsoDateTimeSchema,
  type: SignalTypeSchema,
  summary: z.string().min(1).max(500),
  raw: z.record(z.unknown()),
  projectId: UuidSchema,
  metadata: SignalMetadataSchema.optional(),
});

export const SanitisedSignalSchema = NormalisedSignalSchema.extend({
  sanitised: z.literal(true),
  sanitisedSummary: z.string().min(1).max(500),
  sanitisationNotes: z.array(z.string()).optional(),
});

export const SignalCategorySchema = z.enum([
  'blocker',
  'risk',
  'scope_change',
  'deadline_impact',
  'stakeholder_communication',
  'routine_update',
  'noise',
]);

export const RecommendedActionSchema = z.enum([
  'update_artefact',
  'create_escalation',
  'send_notification',
  'hold_for_review',
  'ignore',
]);

export const SignalClassificationSchema = z.object({
  importance: z.enum(['critical', 'high', 'medium', 'low', 'noise']),
  categories: z.array(SignalCategorySchema),
  recommendedAction: RecommendedActionSchema,
  requiresComplexReasoning: z.boolean(),
  rationale: z.string().max(500),
});

export const ClassifiedSignalSchema = SanitisedSignalSchema.extend({
  classification: SignalClassificationSchema,
});
```

### 4.5 API Request/Response Schemas

```typescript
// ============================================================================
// API Request Schemas
// ============================================================================

export const AutonomyUpdateRequestSchema = z.object({
  level: AutonomyLevelSchema,
  reason: z.string().max(500).optional(),
});

export const EventsRequestSchema = z.object({
  projectId: UuidSchema.optional(),
  eventType: EventTypeSchema.optional(),
  severity: EventSeveritySchema.optional(),
  limit: z.number().int().min(1).max(200).optional().default(50),
  cursor: z.string().optional(),
  since: IsoDateTimeSchema.optional(),
});

export const EscalationDecisionRequestSchema = z.object({
  projectId: UuidSchema,
  decision: z.string().min(1).max(100),
  notes: z.string().max(2000).optional(),
});

export const WorkingHoursSchema = z.object({
  start: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/), // HH:mm
  end: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  timezone: z.string().min(1), // e.g., "Australia/Sydney"
});

export const AgentConfigUpdateRequestSchema = z.object({
  pollingIntervalMinutes: z.number().int().min(5).max(60).optional(),
  holdQueueMinutes: z.number().int().min(1).max(120).optional(),
  workingHours: WorkingHoursSchema.optional(),
});

// ============================================================================
// API Response Schemas
// ============================================================================

export const ProjectSummarySchema = z.object({
  id: UuidSchema,
  name: z.string(),
  status: ProjectStatusSchema,
  source: IntegrationSourceSchema,
  sourceProjectKey: z.string(),
  autonomyLevel: AutonomyLevelSchema,
  healthStatus: z.enum(['healthy', 'warning', 'error']),
  pendingEscalations: z.number().int().min(0),
  lastActivity: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export const ProjectListResponseSchema = z.object({
  projects: z.array(ProjectSummarySchema),
  count: z.number().int().min(0),
});

export const ProjectStatsSchema = z.object({
  eventsLast24h: z.number().int().min(0),
  actionsLast24h: z.number().int().min(0),
  pendingEscalations: z.number().int().min(0),
  lastHeartbeat: IsoDateTimeSchema.nullable(),
});

export const ProjectDetailResponseSchema = z.object({
  project: ProjectSchema,
  stats: ProjectStatsSchema,
});

export const ArtefactsResponseSchema = z.object({
  artefacts: z.array(ArtefactSchema),
  projectId: UuidSchema,
});

export const AutonomyUpdateResponseSchema = z.object({
  project: ProjectSchema,
  previousLevel: AutonomyLevelSchema,
  newLevel: AutonomyLevelSchema,
  updatedAt: IsoDateTimeSchema,
});

export const EventsResponseSchema = z.object({
  events: z.array(EventSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});

export const EscalationsResponseSchema = z.object({
  escalations: z.array(EscalationSchema),
  count: z.number().int().min(0),
});

export const EscalationDetailResponseSchema = z.object({
  escalation: EscalationSchema,
  project: ProjectSummarySchema,
  relatedEvents: z.array(EventSchema),
});

export const EscalationDecisionResponseSchema = z.object({
  escalation: EscalationSchema,
  decidedAt: IsoDateTimeSchema,
});

export const IntegrationHealthStatusSchema = z.object({
  name: IntegrationSourceSchema,
  status: z.enum(['healthy', 'degraded', 'error']),
  lastCheck: IsoDateTimeSchema,
  errorMessage: z.string().optional(),
});

export const BudgetStatusSchema = z.object({
  dailySpendUsd: z.number().min(0),
  dailyLimitUsd: z.number().min(0),
  monthlySpendUsd: z.number().min(0),
  monthlyLimitUsd: z.number().min(0),
  degradationTier: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
});

export const AgentStatusResponseSchema = z.object({
  status: z.enum(['active', 'paused', 'error', 'starting']),
  lastHeartbeat: IsoDateTimeSchema.nullable(),
  nextScheduledRun: IsoDateTimeSchema,
  currentCycleState: z.string().nullable(),
  integrations: z.array(IntegrationHealthStatusSchema),
  budgetStatus: BudgetStatusSchema,
  error: z.string().optional(),
});

export const LlmSplitSchema = z.object({
  haikuPercent: z.number().min(0).max(100),
  sonnetPercent: z.number().min(0).max(100),
});

export const AgentConfigDataSchema = z.object({
  pollingIntervalMinutes: z.number().int(),
  budgetCeilingDailyUsd: z.number(),
  holdQueueMinutes: z.number().int(),
  workingHours: WorkingHoursSchema,
  llmSplit: LlmSplitSchema,
});

export const AgentConfigResponseSchema = z.object({
  config: AgentConfigDataSchema,
});

export const AgentConfigUpdateResponseSchema = z.object({
  config: AgentConfigDataSchema,
  updatedFields: z.array(z.string()),
  updatedAt: IsoDateTimeSchema,
});

export const IntegrationsResponseSchema = z.object({
  integrations: z.array(IntegrationConfigSchema),
});

export const ApiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
  requestId: z.string(),
  timestamp: IsoDateTimeSchema,
});
```

### 4.6 Claude Tool-Use Schemas

These schemas are used for defining Claude function calling tools.

```typescript
// ============================================================================
// Claude Tool-Use Schemas (for function calling)
// ============================================================================

/**
 * Tool definition for Claude to update Delivery State artefact
 */
export const UpdateDeliveryStateTool = {
  name: 'update_delivery_state',
  description: 'Update the Delivery State artefact for a project based on new signals',
  input_schema: {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: 'UUID of the project',
      },
      content: {
        type: 'object',
        description: 'The updated Delivery State content',
        properties: {
          overallStatus: {
            type: 'string',
            enum: ['green', 'amber', 'red'],
          },
          statusSummary: {
            type: 'string',
            maxLength: 1000,
          },
          currentSprint: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              startDate: { type: 'string', format: 'date-time' },
              endDate: { type: 'string', format: 'date-time' },
              goal: { type: 'string' },
              progress: {
                type: 'object',
                properties: {
                  totalPoints: { type: 'number' },
                  completedPoints: { type: 'number' },
                  inProgressPoints: { type: 'number' },
                  blockedPoints: { type: 'number' },
                },
                required: ['totalPoints', 'completedPoints', 'inProgressPoints', 'blockedPoints'],
              },
            },
            required: ['name', 'startDate', 'endDate', 'goal', 'progress'],
          },
          milestones: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                dueDate: { type: 'string', format: 'date-time' },
                status: { type: 'string', enum: ['on_track', 'at_risk', 'delayed', 'completed'] },
                notes: { type: 'string' },
              },
              required: ['name', 'dueDate', 'status'],
            },
          },
          blockers: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                description: { type: 'string' },
                owner: { type: 'string' },
                raisedDate: { type: 'string', format: 'date-time' },
                severity: { type: 'string', enum: ['high', 'medium', 'low'] },
                sourceTicket: { type: 'string' },
              },
              required: ['id', 'description', 'owner', 'raisedDate', 'severity'],
            },
          },
          keyMetrics: {
            type: 'object',
            properties: {
              velocityTrend: { type: 'string', enum: ['increasing', 'stable', 'decreasing'] },
              avgCycleTimeDays: { type: 'number' },
              openBlockers: { type: 'number' },
              activeRisks: { type: 'number' },
            },
            required: ['velocityTrend', 'avgCycleTimeDays', 'openBlockers', 'activeRisks'],
          },
          nextActions: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 10,
          },
        },
        required: ['overallStatus', 'statusSummary', 'milestones', 'blockers', 'keyMetrics', 'nextActions'],
      },
      rationale: {
        type: 'string',
        description: 'Explanation of why this update is being made',
      },
    },
    required: ['projectId', 'content', 'rationale'],
  },
} as const;

/**
 * Tool definition for Claude to classify a signal
 */
export const ClassifySignalTool = {
  name: 'classify_signal',
  description: 'Classify an incoming signal and recommend an action',
  input_schema: {
    type: 'object',
    properties: {
      signalId: {
        type: 'string',
        description: 'ULID of the signal being classified',
      },
      classification: {
        type: 'object',
        properties: {
          importance: {
            type: 'string',
            enum: ['critical', 'high', 'medium', 'low', 'noise'],
          },
          categories: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['blocker', 'risk', 'scope_change', 'deadline_impact', 'stakeholder_communication', 'routine_update', 'noise'],
            },
          },
          recommendedAction: {
            type: 'string',
            enum: ['update_artefact', 'create_escalation', 'send_notification', 'hold_for_review', 'ignore'],
          },
          requiresComplexReasoning: {
            type: 'boolean',
          },
          rationale: {
            type: 'string',
            maxLength: 500,
          },
        },
        required: ['importance', 'categories', 'recommendedAction', 'requiresComplexReasoning', 'rationale'],
      },
    },
    required: ['signalId', 'classification'],
  },
} as const;

/**
 * Tool definition for Claude to add a RAID item
 */
export const AddRaidItemTool = {
  name: 'add_raid_item',
  description: 'Add a new item to the RAID log',
  input_schema: {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: 'UUID of the project',
      },
      item: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['risk', 'assumption', 'issue', 'dependency'] },
          title: { type: 'string', maxLength: 200 },
          description: { type: 'string', maxLength: 2000 },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          owner: { type: 'string' },
          dueDate: { type: 'string', format: 'date-time' },
          mitigation: { type: 'string' },
          sourceReference: { type: 'string' },
        },
        required: ['type', 'title', 'description', 'severity', 'owner'],
      },
      rationale: {
        type: 'string',
        description: 'Explanation of why this item is being added',
      },
    },
    required: ['projectId', 'item', 'rationale'],
  },
} as const;

/**
 * Tool definition for Claude to create an escalation
 */
export const CreateEscalationTool = {
  name: 'create_escalation',
  description: 'Create an escalation requiring user decision',
  input_schema: {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: 'UUID of the project',
      },
      title: {
        type: 'string',
        maxLength: 200,
      },
      context: {
        type: 'object',
        properties: {
          summary: { type: 'string', maxLength: 2000 },
          triggeringSignals: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                source: { type: 'string' },
                type: { type: 'string' },
                summary: { type: 'string' },
                timestamp: { type: 'string', format: 'date-time' },
              },
              required: ['source', 'type', 'summary', 'timestamp'],
            },
          },
        },
        required: ['summary', 'triggeringSignals'],
      },
      options: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            label: { type: 'string' },
            description: { type: 'string' },
            pros: { type: 'array', items: { type: 'string' } },
            cons: { type: 'array', items: { type: 'string' } },
            riskLevel: { type: 'string', enum: ['low', 'medium', 'high'] },
          },
          required: ['id', 'label', 'description', 'pros', 'cons', 'riskLevel'],
        },
        minItems: 2,
        maxItems: 5,
      },
      recommendation: {
        type: 'string',
        description: 'ID of the recommended option',
      },
      rationale: {
        type: 'string',
        description: 'Explanation of the recommendation',
        maxLength: 1000,
      },
    },
    required: ['projectId', 'title', 'context', 'options', 'recommendation', 'rationale'],
  },
} as const;
```

---

## Appendix: Schema Versioning

All schemas include versioning metadata for future migrations:

```typescript
export const SCHEMA_VERSION = '1.0.0';

export const SchemaMetadata = {
  version: SCHEMA_VERSION,
  createdAt: '2026-02-05',
  lastUpdated: '2026-02-05',
  source: 'SPEC.md',
};
```

When schema changes are needed:
1. Increment `SCHEMA_VERSION`
2. Add migration function in `packages/core/src/db/migrations/`
3. Update `lastUpdated` timestamp
4. Document breaking changes in this file
