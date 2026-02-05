# API Reference

This document provides a comprehensive reference for all API endpoints in the
Agentic PM Workbench.

## Authentication

All API routes require authentication via NextAuth session. Unauthenticated
requests receive a `401 Unauthorised` response.

```typescript
// Authentication check in API routes
const session = await getServerSession(authOptions);
if (!session) {
  return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
}
```

---

## Endpoints

### Agent Status

#### `GET /api/agent/status`

Returns the current agent status including health, last run time, and
integration status. Polled every 30 seconds by the frontend.

**Response:**

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
```

**Example:**

```json
{
  "status": "active",
  "lastHeartbeat": "2024-01-15T10:30:00Z",
  "nextScheduledRun": "2024-01-15T10:45:00Z",
  "currentCycleState": null,
  "integrations": [
    {
      "name": "jira",
      "status": "healthy",
      "lastCheck": "2024-01-15T10:30:00Z"
    },
    {
      "name": "outlook",
      "status": "healthy",
      "lastCheck": "2024-01-15T10:30:00Z"
    }
  ],
  "budgetStatus": {
    "dailySpendUsd": 0.15,
    "dailyLimitUsd": 0.5,
    "monthlySpendUsd": 2.45,
    "monthlyLimitUsd": 7.0,
    "degradationTier": 0
  }
}
```

---

#### `POST /api/agent/autonomy`

Update the agent's autonomy level and dry-run mode settings.

**Request Body:**

```typescript
interface AutonomySettingsUpdateRequest {
  autonomyLevel?: 'monitoring' | 'artefact' | 'tactical';
  dryRun?: boolean;
}
```

**Response:**

```typescript
interface AutonomySettingsResponse {
  autonomyLevel: AutonomyLevel;
  dryRun: boolean;
  lastLevelChange?: string;
  pendingAcknowledgement?: AutonomyChangeAcknowledgement;
}
```

**Autonomy Levels:**

| Level        | Description                        | Capabilities                                        |
| ------------ | ---------------------------------- | --------------------------------------------------- |
| `monitoring` | Observe and log only               | Heartbeat logging only                              |
| `artefact`   | Update artefacts autonomously      | + Artefact updates, internal notifications          |
| `tactical`   | Send communications via hold queue | + Jira comments, stakeholder emails, status changes |

---

### Projects

#### `GET /api/projects`

Returns a list of all projects with summary information.

**Response:**

```typescript
interface ProjectListResponse {
  projects: ProjectSummary[];
  count: number;
}

interface ProjectSummary {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'archived';
  source: IntegrationSource;
  sourceProjectKey: string;
  autonomyLevel: AutonomyLevel;
  healthStatus: 'healthy' | 'warning' | 'error';
  pendingEscalations: number;
  lastActivity: string;
  updatedAt: string;
}
```

---

#### `GET /api/projects/[id]`

Returns detailed information for a specific project.

**Parameters:**

| Parameter | Type   | Description                 |
| --------- | ------ | --------------------------- |
| `id`      | string | Project ID (path parameter) |

**Response:**

```typescript
interface Project {
  id: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  source: IntegrationSource;
  sourceProjectKey: string;
  autonomyLevel: AutonomyLevel;
  config: ProjectConfig;
  createdAt: string;
  updatedAt: string;
}

interface ProjectConfig {
  pollingIntervalMinutes?: number;
  holdQueueMinutes?: number;
  jiraBoardId?: string;
  monitoredEmails?: string[];
}
```

---

### Artefacts

#### `GET /api/artefacts/[projectId]`

Returns all artefacts for a specific project.

**Parameters:**

| Parameter   | Type   | Description                 |
| ----------- | ------ | --------------------------- |
| `projectId` | string | Project ID (path parameter) |

**Response:**

```typescript
interface ArtefactsResponse {
  artefacts: Artefact[];
}

interface Artefact<T extends ArtefactContent = ArtefactContent> {
  id: string;
  projectId: string;
  type: ArtefactType;
  content: T;
  previousVersion?: T;
  version: number;
  createdAt: string;
  updatedAt: string;
}
```

**Artefact Types:**

| Type              | Description                                             |
| ----------------- | ------------------------------------------------------- |
| `delivery_state`  | Project delivery status, sprint info, blockers, metrics |
| `raid_log`        | Risks, Assumptions, Issues, Dependencies                |
| `backlog_summary` | Backlog statistics, highlights, refinement candidates   |
| `decision_log`    | Recorded decisions with context and rationale           |

---

### Events

#### `GET /api/events`

Returns the activity feed events with pagination support.

**Query Parameters:**

| Parameter   | Type   | Default | Description                     |
| ----------- | ------ | ------- | ------------------------------- |
| `limit`     | number | 20      | Max events to return (max: 100) |
| `cursor`    | string | -       | Pagination cursor for next page |
| `projectId` | string | -       | Filter by project               |
| `eventType` | string | -       | Filter by event type            |
| `severity`  | string | -       | Filter by severity              |

**Response:**

```typescript
interface EventsResponse {
  events: Event[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface Event {
  id: string;
  projectId?: string;
  eventType: EventType;
  severity: EventSeverity;
  summary: string;
  detail?: EventDetail;
  createdAt: string;
}
```

**Event Types:**

| Event Type               | Description                          |
| ------------------------ | ------------------------------------ |
| `heartbeat`              | Regular agent cycle heartbeat        |
| `heartbeat_with_changes` | Heartbeat with detected changes      |
| `signal_detected`        | New signal detected from integration |
| `action_taken`           | Agent took an autonomous action      |
| `action_held`            | Action placed in hold queue          |
| `action_approved`        | Held action approved by user         |
| `action_rejected`        | Held action rejected by user         |
| `escalation_created`     | New escalation created               |
| `escalation_decided`     | User decided on escalation           |
| `escalation_expired`     | Escalation expired without decision  |
| `artefact_updated`       | Artefact was updated                 |
| `integration_error`      | Integration encountered an error     |
| `budget_warning`         | Budget threshold warning             |
| `error`                  | General error event                  |

---

### Escalations

#### `GET /api/escalations`

Returns escalations with optional filtering.

**Query Parameters:**

| Parameter   | Type   | Default | Description                                           |
| ----------- | ------ | ------- | ----------------------------------------------------- |
| `status`    | string | all     | Filter: `pending`, `decided`, `expired`, `superseded` |
| `projectId` | string | -       | Filter by project                                     |
| `limit`     | number | 20      | Max escalations to return (max: 100)                  |

**Response:**

```typescript
interface EscalationsResponse {
  escalations: Escalation[];
  count: number;
}
```

---

#### `GET /api/escalations/[id]`

Returns detailed information for a specific escalation.

**Parameters:**

| Parameter | Type   | Description                    |
| --------- | ------ | ------------------------------ |
| `id`      | string | Escalation ID (path parameter) |

**Response:**

```typescript
interface Escalation {
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
```

---

#### `POST /api/escalations/[id]/decide`

Record a decision on an escalation.

**Parameters:**

| Parameter | Type   | Description                    |
| --------- | ------ | ------------------------------ |
| `id`      | string | Escalation ID (path parameter) |

**Request Body:**

```typescript
interface EscalationDecisionRequest {
  decision: string; // Option ID
  notes?: string; // User notes
}
```

**Response:**

```typescript
interface EscalationDecisionResponse {
  escalation: Escalation;
  success: boolean;
}
```

---

### Held Actions

#### `GET /api/held-actions`

Returns held actions in the review queue.

**Query Parameters:**

| Parameter   | Type   | Default | Description                                            |
| ----------- | ------ | ------- | ------------------------------------------------------ |
| `status`    | string | all     | Filter: `pending`, `approved`, `cancelled`, `executed` |
| `projectId` | string | -       | Filter by project                                      |
| `limit`     | number | 20      | Max actions to return                                  |

**Response:**

```typescript
interface HeldActionsResponse {
  heldActions: HeldAction[];
  count: number;
}

interface HeldAction {
  id: string;
  projectId: string;
  actionType: 'email_stakeholder' | 'jira_status_change';
  payload: EmailStakeholderPayload | JiraStatusChangePayload;
  heldUntil: string;
  status: HeldActionStatus;
  createdAt: string;
  approvedAt?: string;
  cancelledAt?: string;
  executedAt?: string;
  cancelReason?: string;
  decidedBy?: string;
}
```

---

#### `POST /api/held-actions/[id]/approve`

Approve a held action for immediate execution.

**Parameters:**

| Parameter | Type   | Description                     |
| --------- | ------ | ------------------------------- |
| `id`      | string | Held action ID (path parameter) |

**Response:**

```typescript
interface HeldActionResponse {
  heldAction: HeldAction;
  success: boolean;
}
```

---

#### `POST /api/held-actions/[id]/cancel`

Cancel a held action.

**Parameters:**

| Parameter | Type   | Description                     |
| --------- | ------ | ------------------------------- |
| `id`      | string | Held action ID (path parameter) |

**Request Body:**

```typescript
interface CancelHeldActionRequest {
  reason?: string;
}
```

**Response:**

```typescript
interface HeldActionResponse {
  heldAction: HeldAction;
  success: boolean;
}
```

---

### Budget

#### `GET /api/budget`

Returns the current budget status and usage.

**Response:**

```typescript
interface BudgetStatus {
  dailySpendUsd: number;
  dailyLimitUsd: number;
  monthlySpendUsd: number;
  monthlyLimitUsd: number;
  degradationTier: 0 | 1 | 2 | 3;
}
```

**Degradation Tiers:**

| Tier | Name            | Description                                 |
| ---- | --------------- | ------------------------------------------- |
| 0    | Normal          | Standard operation (70% Haiku / 30% Sonnet) |
| 1    | Budget Pressure | Reduced Sonnet (85% Haiku / 15% Sonnet)     |
| 2    | High Pressure   | Haiku only                                  |
| 3    | Hard Ceiling    | Monitoring only, no LLM calls               |

---

### Graduation

#### `GET /api/graduation`

Returns graduation evidence for autonomy level increases.

**Response:**

```typescript
interface GraduationEvidenceResponse {
  currentLevel: AutonomyLevel;
  nextLevel: AutonomyLevel | null;
  eligible: boolean;
  evidence: GraduationEvidence;
  blockers?: string[];
}

interface GraduationEvidence {
  daysAtCurrentLevel: number;
  requiredDays: number;
  spotCheckAccuracy: number;
  requiredAccuracy: number;
  consecutiveSuccessfulCycles: number;
  requiredCycles: number;
  escalationResolutionRate: number;
  userOverrideRate: number;
}
```

---

#### `POST /api/graduation/confirm`

Confirm graduation to the next autonomy level.

**Request Body:**

```typescript
interface GraduationConfirmRequest {
  acknowledgeRisks: boolean;
}
```

**Response:**

```typescript
interface GraduationConfirmResponse {
  success: boolean;
  newLevel: AutonomyLevel;
}
```

---

### Stats

#### `GET /api/stats`

Returns 24-hour activity statistics.

**Response:**

```typescript
interface ActivityStatsResponse {
  last24Hours: ActivityStats;
  today: ActivityStats;
  comparison: ActivityComparison;
}

interface ActivityStats {
  cyclesRun: number;
  signalsDetected: number;
  actionsTaken: number;
  actionsHeld: number;
  artefactsUpdated: number;
  escalationsCreated: number;
  escalationsResolved: number;
  llmCostUsd: number;
  tokensUsed: number;
}

interface ActivityComparison {
  cyclesChange: number;
  signalsChange: number;
  actionsChange: number;
}
```

---

## Error Responses

All endpoints return consistent error responses:

```typescript
interface ErrorResponse {
  error: string;
  details?: string;
}
```

**Common HTTP Status Codes:**

| Code | Description                               |
| ---- | ----------------------------------------- |
| 400  | Bad Request - Invalid parameters          |
| 401  | Unauthorised - Missing or invalid session |
| 404  | Not Found - Resource does not exist       |
| 500  | Internal Server Error - Server-side error |

---

## Rate Limiting

The API does not implement rate limiting as this is a single-user personal tool.
However, the frontend uses 30-second polling intervals to avoid excessive
requests.

---

## Data Freshness

- Agent status is polled every 30 seconds
- Events are fetched on demand with cursor-based pagination
- Artefacts are fetched when viewing project details
- Escalations update immediately when decisions are made
