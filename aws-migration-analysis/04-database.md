# Database Architecture Analysis: DynamoDB vs Aurora Serverless v2

> **Status:** Analysis complete. Recommendation: **DynamoDB** for this use case.
> **Last updated:** February 2026

---

## 1. Executive Summary

**Recommendation: DynamoDB with single-table design.**

The Agentic PM Workbench's data patterns favour DynamoDB over Aurora Serverless v2:
- Heavy JSONB/document usage (artefacts are already document-shaped)
- Simple access patterns (no complex joins in practice)
- Predictable, low-volume workload (ideal for on-demand pricing)
- Built-in TTL eliminates retention management code
- Cost-effective at this scale ($0-2/month vs $48+/month minimum for Aurora)

---

## 2. DynamoDB vs Aurora Serverless v2 Analysis

### 2.1 Current schema characteristics

| Characteristic | Current State | Implication |
|---------------|---------------|-------------|
| Foreign keys | 6 FK relationships | Rarely used for joins in application code |
| JSONB usage | 80% of data is JSONB | Already document-oriented |
| Joins required | Minimal | Dashboard aggregates from single tables |
| Access patterns | Key-based lookups + time-range scans | Perfect fit for DynamoDB |
| Scale | 0.5 GB, 1 user | Trivially small |
| Transactions | Not required | No multi-table atomic updates needed |

### 2.2 Access pattern analysis

Examining the actual queries the application performs:

| Query | Current SQL Pattern | DynamoDB Fit |
|-------|--------------------|--------------|
| Get project by ID | `SELECT * FROM projects WHERE id = ?` | Excellent (GetItem) |
| Get artefacts for project | `SELECT * FROM artefacts WHERE project_id = ?` | Excellent (Query) |
| Get recent events | `SELECT * FROM events WHERE created_at > ? ORDER BY created_at DESC LIMIT 50` | Good (Query + GSI) |
| Get events by project | `SELECT * FROM events WHERE project_id = ? ORDER BY created_at DESC` | Excellent (Query) |
| Get pending escalations | `SELECT * FROM escalations WHERE status = 'pending'` | Good (GSI) |
| Get checkpoint | `SELECT * FROM agent_checkpoints WHERE project_id = ? AND integration = ? AND checkpoint_key = ?` | Excellent (GetItem) |
| Insert event | `INSERT INTO events ...` | Excellent (PutItem) |
| Update artefact | `UPDATE artefacts SET content = ? WHERE project_id = ? AND type = ?` | Excellent (PutItem) |

**Key finding:** No complex joins. The "relational" aspects are really just foreign key constraints for data integrity, not for query patterns. DynamoDB can enforce these at the application layer.

### 2.3 Cost comparison

#### Aurora Serverless v2

| Component | Cost |
|-----------|------|
| Minimum ACU (0.5 ACU) | $0.12/ACU-hour × 0.5 × 720 hours = **$43.20/month** |
| Storage | $0.10/GB × 0.5 GB = **$0.05/month** |
| I/O | ~$0.20/million requests × ~0.1M = **$0.02/month** |
| **Total minimum** | **~$43.27/month** |

Aurora Serverless v2 does NOT scale to zero. Minimum 0.5 ACU continuously.

#### DynamoDB (On-Demand)

| Component | Cost |
|-----------|------|
| Storage | $0.25/GB × 0.5 GB = **$0.125/month** |
| Write requests | $1.25/million × ~50K = **$0.0625/month** |
| Read requests | $0.25/million × ~200K = **$0.05/month** |
| **Total** | **~$0.24/month** |

**Cost verdict:** DynamoDB is **180x cheaper** at this scale.

### 2.4 Operational comparison

| Factor | DynamoDB | Aurora Serverless v2 |
|--------|----------|---------------------|
| Cold start | None (always on) | 15-30s for scale-up |
| Connection management | None (HTTP API) | Connection pooling needed |
| Scaling | Automatic, instant | Automatic, but minimum 0.5 ACU |
| Maintenance | Zero | Patching windows |
| Backups | Continuous, free PITR | Automatic, but Aurora charges |
| TTL (auto-expiry) | Built-in, free | Must implement manually |
| Schema changes | No migrations | Migration overhead |

### 2.5 Decision

**DynamoDB wins decisively:**
- 180x cost advantage at this scale
- No cold starts
- Built-in TTL for retention policies
- No connection management (critical for Lambda integration)
- Document-native matches existing JSONB patterns

---

## 3. DynamoDB Table Design

### 3.1 Single-table design rationale

For this application, **single-table design** is recommended:

**Advantages:**
- Fewer tables to manage (1 vs 8)
- Efficient pagination across entity types
- Simpler IAM policies
- Atomic operations within single partition

**Disadvantages:**
- More complex key design
- Requires careful documentation
- GSIs span all data (slightly higher cost)

At 0.5 GB total data and simple access patterns, the advantages far outweigh disadvantages.

### 3.2 Entity key design

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SINGLE TABLE: AgenticPM                              │
├─────────────────────────────────────────────────────────────────────────────┤
│ PK (Partition Key)        │ SK (Sort Key)              │ Entity Type        │
├───────────────────────────┼────────────────────────────┼────────────────────┤
│ PROJECT#<uuid>            │ METADATA                   │ Project            │
│ PROJECT#<uuid>            │ ARTEFACT#<type>            │ Artefact           │
│ PROJECT#<uuid>            │ EVENT#<timestamp>#<ulid>   │ Event              │
│ PROJECT#<uuid>            │ ESCALATION#<uuid>          │ Escalation         │
│ PROJECT#<uuid>            │ ACTION#<timestamp>#<ulid>  │ Agent Action       │
│ PROJECT#<uuid>            │ CHECKPOINT#<integ>#<key>   │ Agent Checkpoint   │
│ INTEGRATION#<name>        │ CONFIG                     │ Integration Config │
│ AGENT                     │ CONFIG#<key>               │ Agent Config       │
│ GLOBAL                    │ EVENT#<timestamp>#<ulid>   │ Global Event       │
└───────────────────────────┴────────────────────────────┴────────────────────┘
```

### 3.3 Detailed entity schemas

#### Project

```json
{
  "PK": "PROJECT#550e8400-e29b-41d4-a716-446655440000",
  "SK": "METADATA",
  "EntityType": "Project",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Customer Portal Migration",
  "description": "Migrate customer portal to new platform",
  "status": "active",
  "source": "jira",
  "sourceProjectKey": "MCU",
  "autonomyLevel": "artefact",
  "config": { ... },
  "createdAt": "2026-02-01T00:00:00Z",
  "updatedAt": "2026-02-04T10:30:00Z",
  "GSI1PK": "STATUS#active",
  "GSI1SK": "PROJECT#550e8400-e29b-41d4-a716-446655440000"
}
```

#### Artefact

```json
{
  "PK": "PROJECT#550e8400-e29b-41d4-a716-446655440000",
  "SK": "ARTEFACT#delivery_state",
  "EntityType": "Artefact",
  "id": "artefact-uuid-here",
  "projectId": "550e8400-e29b-41d4-a716-446655440000",
  "type": "delivery_state",
  "content": {
    "overall_status": "amber",
    "status_summary": "Sprint 12 at 62% completion...",
    "current_sprint": { ... },
    "milestones": [ ... ],
    "blockers": [ ... ],
    "key_metrics": { ... },
    "next_actions": [ ... ]
  },
  "previousVersion": { ... },
  "version": 3,
  "createdAt": "2026-02-01T00:00:00Z",
  "updatedAt": "2026-02-04T10:30:00Z"
}
```

#### Event (Time-series with TTL)

```json
{
  "PK": "PROJECT#550e8400-e29b-41d4-a716-446655440000",
  "SK": "EVENT#2026-02-04T10:30:00Z#01HRWXYZ123456",
  "EntityType": "Event",
  "id": "01HRWXYZ123456",
  "projectId": "550e8400-e29b-41d4-a716-446655440000",
  "eventType": "signal_detected",
  "severity": "info",
  "summary": "Jira ticket MCU-156 status changed to In Progress",
  "detail": { ... },
  "createdAt": "2026-02-04T10:30:00Z",
  "TTL": 1709640600,
  "GSI1PK": "EVENT#2026-02-04",
  "GSI1SK": "2026-02-04T10:30:00Z#01HRWXYZ123456"
}
```

**Note:** TTL is Unix timestamp (30 days from creation). DynamoDB automatically deletes expired items.

#### Event (Global - for cross-project queries)

```json
{
  "PK": "GLOBAL",
  "SK": "EVENT#2026-02-04T10:30:00Z#01HRWXYZ123456",
  "EntityType": "GlobalEventRef",
  "projectId": "550e8400-e29b-41d4-a716-446655440000",
  "eventType": "heartbeat",
  "severity": "info",
  "summary": "Agent heartbeat - checked, no changes",
  "createdAt": "2026-02-04T10:30:00Z",
  "TTL": 1709640600
}
```

#### Escalation

```json
{
  "PK": "PROJECT#550e8400-e29b-41d4-a716-446655440000",
  "SK": "ESCALATION#escalation-uuid",
  "EntityType": "Escalation",
  "id": "escalation-uuid",
  "projectId": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Sprint scope change request from stakeholder",
  "context": { ... },
  "options": [ ... ],
  "agentRecommendation": "Defer to Sprint 13",
  "agentRationale": "Current sprint is 62% complete...",
  "status": "pending",
  "userDecision": null,
  "userNotes": null,
  "decidedAt": null,
  "createdAt": "2026-02-04T10:30:00Z",
  "GSI1PK": "ESCALATION#pending",
  "GSI1SK": "2026-02-04T10:30:00Z#escalation-uuid"
}
```

#### Agent Action (with TTL)

```json
{
  "PK": "PROJECT#550e8400-e29b-41d4-a716-446655440000",
  "SK": "ACTION#2026-02-04T10:30:00Z#action-ulid",
  "EntityType": "AgentAction",
  "id": "action-ulid",
  "projectId": "550e8400-e29b-41d4-a716-446655440000",
  "actionType": "artefact_update",
  "description": "Updated delivery state with new sprint progress",
  "detail": { ... },
  "confidence": {
    "sourceAgreement": true,
    "boundaryCompliance": true,
    "schemaValidity": true,
    "precedentMatch": true
  },
  "executed": true,
  "heldUntil": null,
  "executedAt": "2026-02-04T10:30:00Z",
  "createdAt": "2026-02-04T10:30:00Z",
  "TTL": 1714824600
}
```

**Note:** TTL is 90 days from creation for agent actions.

#### Agent Checkpoint

```json
{
  "PK": "PROJECT#550e8400-e29b-41d4-a716-446655440000",
  "SK": "CHECKPOINT#jira#last_sync",
  "EntityType": "AgentCheckpoint",
  "projectId": "550e8400-e29b-41d4-a716-446655440000",
  "integration": "jira",
  "checkpointKey": "last_sync",
  "checkpointValue": "2026-02-04T10:15:00Z",
  "updatedAt": "2026-02-04T10:30:00Z"
}
```

#### Integration Config

```json
{
  "PK": "INTEGRATION#jira",
  "SK": "CONFIG",
  "EntityType": "IntegrationConfig",
  "id": "config-uuid",
  "integration": "jira",
  "configEncrypted": "BASE64_ENCRYPTED_DATA",
  "status": "active",
  "lastHealthCheck": "2026-02-04T10:30:00Z",
  "createdAt": "2026-02-01T00:00:00Z",
  "updatedAt": "2026-02-04T10:30:00Z"
}
```

#### Agent Config

```json
{
  "PK": "AGENT",
  "SK": "CONFIG#polling_interval_minutes",
  "EntityType": "AgentConfig",
  "key": "polling_interval_minutes",
  "value": 15,
  "updatedAt": "2026-02-01T00:00:00Z"
}
```

---

## 4. Access Patterns and Query Design

### 4.1 Primary access patterns

| Access Pattern | Operation | Key Condition |
|---------------|-----------|---------------|
| Get project by ID | GetItem | PK = `PROJECT#<id>`, SK = `METADATA` |
| Get all artefacts for project | Query | PK = `PROJECT#<id>`, SK begins_with `ARTEFACT#` |
| Get specific artefact | GetItem | PK = `PROJECT#<id>`, SK = `ARTEFACT#<type>` |
| Get project events (paginated) | Query | PK = `PROJECT#<id>`, SK begins_with `EVENT#`, ScanIndexForward=false |
| Get project escalations | Query | PK = `PROJECT#<id>`, SK begins_with `ESCALATION#` |
| Get project actions | Query | PK = `PROJECT#<id>`, SK begins_with `ACTION#` |
| Get checkpoint | GetItem | PK = `PROJECT#<id>`, SK = `CHECKPOINT#<integ>#<key>` |
| Get integration config | GetItem | PK = `INTEGRATION#<name>`, SK = `CONFIG` |
| Get agent config | GetItem | PK = `AGENT`, SK = `CONFIG#<key>` |
| Get all agent configs | Query | PK = `AGENT`, SK begins_with `CONFIG#` |

### 4.2 GSI-based access patterns

#### GSI1: Cross-cutting queries

| Attribute | Description |
|-----------|-------------|
| GSI1PK | Category + status/date grouping |
| GSI1SK | Timestamp + ID for ordering |

| Access Pattern | GSI1 Query |
|---------------|------------|
| Get pending escalations (global) | GSI1PK = `ESCALATION#pending` |
| Get active projects | GSI1PK = `STATUS#active` |
| Get events by date (global) | GSI1PK = `EVENT#2026-02-04`, SK begins_with desired time range |
| Get recent global events | Query GLOBAL partition, SK begins_with `EVENT#`, descending |

### 4.3 Time-based queries

For "events in last 24 hours" across all projects:

**Option A: Query GLOBAL partition**
```
PK = "GLOBAL"
SK begins_with "EVENT#2026-02-04" (today)
+ SK begins_with "EVENT#2026-02-03" (yesterday, partial)
```

**Option B: Use GSI1 with date-based partition**
```
GSI1PK = "EVENT#2026-02-04"
```

Option A is simpler and sufficient for 1-2 projects.

---

## 5. Global Secondary Index Design

### 5.1 GSI1: Status and Date Index

```
┌─────────────────────────────────────────────────────────────────┐
│                           GSI1                                  │
├─────────────────────────────────────────────────────────────────┤
│ GSI1PK                        │ GSI1SK                          │
├───────────────────────────────┼─────────────────────────────────┤
│ STATUS#active                 │ PROJECT#<uuid>                  │
│ STATUS#paused                 │ PROJECT#<uuid>                  │
│ ESCALATION#pending            │ <timestamp>#<uuid>              │
│ ESCALATION#decided            │ <timestamp>#<uuid>              │
│ EVENT#2026-02-04              │ <timestamp>#<ulid>              │
│ EVENT#2026-02-03              │ <timestamp>#<ulid>              │
└───────────────────────────────┴─────────────────────────────────┘
```

**Projected attributes:** All (required for full entity retrieval)

### 5.2 No additional GSIs needed

The single GSI1 covers all secondary access patterns:
- Pending escalations: `GSI1PK = ESCALATION#pending`
- Active projects: `GSI1PK = STATUS#active`
- Events by date: `GSI1PK = EVENT#<date>`

At this scale, the cost of additional GSIs outweighs any performance benefit.

---

## 6. DynamoDB-Specific Features

### 6.1 TTL (Time to Live)

**Automatic expiration eliminates retention management code.**

| Entity | TTL Value | Effect |
|--------|-----------|--------|
| Event | `createdAt + 30 days` | Auto-deleted after 30 days |
| Agent Action | `createdAt + 90 days` | Auto-deleted after 90 days |
| Global Event Ref | `createdAt + 30 days` | Auto-deleted with events |

**Implementation:**
```typescript
const eventTTL = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);
const actionTTL = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60);
```

TTL deletions are:
- Free (no write capacity consumed)
- Eventually consistent (may take 48 hours)
- Processed in background

**Benefit:** Eliminates the daily housekeeping pruning logic from agent loop (step 9 in current spec).

### 6.2 DynamoDB Streams

**Not required for MVP.**

Potential future uses:
- Real-time dashboard updates via WebSocket (EventBridge Pipes → Lambda → API Gateway WebSocket)
- Audit logging to S3
- Cross-region replication

For now, the dashboard polls TanStack Query on 30-second intervals, which is sufficient.

### 6.3 Capacity mode: On-Demand

**On-demand is the clear choice:**

| Factor | On-Demand | Provisioned |
|--------|-----------|-------------|
| Cost at low volume | Pay-per-request (~$0.24/month) | Minimum ~$0.65/month |
| Scaling | Instant, automatic | Requires capacity planning |
| Spikes | Handled automatically | May throttle |
| Management | Zero | Must monitor and adjust |

At projected volume (~50K writes, ~200K reads per month), on-demand is both simpler and cheaper.

### 6.4 Encryption

- **At rest:** AWS-managed keys (default, free)
- **In transit:** TLS (automatic)
- **Application-level:** Integration credentials encrypted with KMS before storage (same as current AES-256 approach, but using AWS KMS)

### 6.5 Backup and recovery

- **Point-in-time recovery (PITR):** Enable ($0.20/GB/month = ~$0.10/month)
- **On-demand backups:** Free to create, charged for storage
- **Recommendation:** Enable PITR for disaster recovery

---

## 7. Cost Estimation

### 7.1 Monthly cost breakdown

| Component | Calculation | Monthly Cost |
|-----------|-------------|--------------|
| **Storage** | 0.5 GB × $0.25/GB | $0.125 |
| **Write requests** | 50K × $1.25/million | $0.0625 |
| **Read requests** | 200K × $0.25/million | $0.05 |
| **GSI storage** | 0.3 GB × $0.25/GB | $0.075 |
| **GSI writes** | 50K × $1.25/million | $0.0625 |
| **GSI reads** | 50K × $0.25/million | $0.0125 |
| **PITR** | 0.5 GB × $0.20/GB | $0.10 |
| **Data transfer** | Negligible (same region) | $0.00 |
| **Total** | | **~$0.49/month** |

### 7.2 Cost comparison with current architecture

| Service | Current (Neon) | AWS (DynamoDB) |
|---------|---------------|----------------|
| Database | $0 (free tier) | ~$0.49/month |
| Ceiling before paid | 0.5 GB, 191.9 compute hours | Effectively unlimited |

**Note:** Neon free tier has compute hour limits that could be exceeded with high dashboard usage. DynamoDB has no such limits.

### 7.3 Free tier consideration

AWS Free Tier includes:
- 25 GB storage
- 25 WCU / 25 RCU provisioned
- 2.5M read requests from Streams

This project would qualify for 12 months free if using a new AWS account. However, the on-demand costs are so low (~$0.49/month) that optimising for free tier is not worth the complexity.

---

## 8. Data Migration Strategy

### 8.1 Migration approach

**Recommended: Dual-write with cutover**

```
Phase 1: Setup (Day 1)
├── Create DynamoDB table with schema
├── Deploy GSI
├── Enable PITR
└── Validate with test data

Phase 2: Migration (Day 2)
├── Export PostgreSQL data to JSON
├── Transform to DynamoDB item format
├── Batch write to DynamoDB
└── Verify counts and sample records

Phase 3: Dual-write (Days 3-7)
├── Modify agent to write to both databases
├── Frontend continues reading from PostgreSQL
├── Monitor DynamoDB for consistency
└── Build DynamoDB read path (not activated)

Phase 4: Cutover (Day 8)
├── Switch frontend to DynamoDB reads
├── Verify all access patterns work
├── Monitor for 24 hours
└── Disable PostgreSQL writes

Phase 5: Cleanup (Day 9+)
├── Remove PostgreSQL write code
├── Archive PostgreSQL data
├── Delete Neon database
└── Update documentation
```

### 8.2 Data transformation

#### PostgreSQL → DynamoDB mapping

```typescript
// Project transformation
function transformProject(pgProject: PgProject): DynamoItem {
  return {
    PK: `PROJECT#${pgProject.id}`,
    SK: 'METADATA',
    EntityType: 'Project',
    id: pgProject.id,
    name: pgProject.name,
    description: pgProject.description,
    status: pgProject.status,
    source: pgProject.source,
    sourceProjectKey: pgProject.source_project_key,
    autonomyLevel: pgProject.autonomy_level,
    config: pgProject.config,
    createdAt: pgProject.created_at.toISOString(),
    updatedAt: pgProject.updated_at.toISOString(),
    GSI1PK: `STATUS#${pgProject.status}`,
    GSI1SK: `PROJECT#${pgProject.id}`,
  };
}

// Artefact transformation
function transformArtefact(pgArtefact: PgArtefact): DynamoItem {
  return {
    PK: `PROJECT#${pgArtefact.project_id}`,
    SK: `ARTEFACT#${pgArtefact.type}`,
    EntityType: 'Artefact',
    id: pgArtefact.id,
    projectId: pgArtefact.project_id,
    type: pgArtefact.type,
    content: pgArtefact.content, // Already JSONB, direct mapping
    previousVersion: pgArtefact.previous_version,
    version: pgArtefact.version,
    createdAt: pgArtefact.created_at.toISOString(),
    updatedAt: pgArtefact.updated_at.toISOString(),
  };
}

// Event transformation (with TTL calculation)
function transformEvent(pgEvent: PgEvent): DynamoItem {
  const createdAt = new Date(pgEvent.created_at);
  const ttl = Math.floor(createdAt.getTime() / 1000) + (30 * 24 * 60 * 60);
  const ulid = generateULID(); // Generate new ULID for sort key

  return {
    PK: pgEvent.project_id
      ? `PROJECT#${pgEvent.project_id}`
      : 'GLOBAL',
    SK: `EVENT#${createdAt.toISOString()}#${ulid}`,
    EntityType: 'Event',
    id: ulid,
    projectId: pgEvent.project_id,
    eventType: pgEvent.event_type,
    severity: pgEvent.severity,
    summary: pgEvent.summary,
    detail: pgEvent.detail,
    createdAt: createdAt.toISOString(),
    TTL: ttl,
    GSI1PK: `EVENT#${createdAt.toISOString().split('T')[0]}`,
    GSI1SK: `${createdAt.toISOString()}#${ulid}`,
  };
}
```

### 8.3 Migration script outline

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { Pool } from 'pg';

async function migrateData() {
  const pg = new Pool({ connectionString: process.env.NEON_DATABASE_URL });
  const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

  // Migrate projects
  const projects = await pg.query('SELECT * FROM projects');
  await batchWrite(dynamodb, projects.rows.map(transformProject));
  console.log(`Migrated ${projects.rows.length} projects`);

  // Migrate artefacts
  const artefacts = await pg.query('SELECT * FROM artefacts');
  await batchWrite(dynamodb, artefacts.rows.map(transformArtefact));
  console.log(`Migrated ${artefacts.rows.length} artefacts`);

  // Migrate events (only non-expired)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const events = await pg.query(
    'SELECT * FROM events WHERE created_at > $1',
    [thirtyDaysAgo]
  );
  await batchWrite(dynamodb, events.rows.map(transformEvent));
  console.log(`Migrated ${events.rows.length} events`);

  // Continue for other entities...
}

async function batchWrite(client: DynamoDBDocumentClient, items: any[]) {
  // DynamoDB BatchWriteItem supports max 25 items per request
  const batches = chunk(items, 25);

  for (const batch of batches) {
    await client.send(new BatchWriteCommand({
      RequestItems: {
        'AgenticPM': batch.map(item => ({
          PutRequest: { Item: item }
        }))
      }
    }));
  }
}
```

### 8.4 Rollback plan

If issues are discovered after cutover:

1. **Immediate (< 24 hours):** Switch frontend back to PostgreSQL reads, disable DynamoDB writes
2. **Short-term:** PostgreSQL data is still current from dual-write phase
3. **Data sync:** If needed, export DynamoDB changes and replay to PostgreSQL

---

## 9. Schema Evolution

### 9.1 Adding new attributes

DynamoDB is schema-less at the item level. New attributes can be added without migration:

```typescript
// Before: Project without newField
{ PK: "PROJECT#123", SK: "METADATA", name: "Project A" }

// After: Just start writing newField
{ PK: "PROJECT#123", SK: "METADATA", name: "Project A", newField: "value" }
```

Old items without `newField` return `undefined` for that attribute. Handle in application code:

```typescript
const project = await getProject(id);
const newField = project.newField ?? 'default_value';
```

### 9.2 Removing attributes

Best practice: stop writing the attribute, leave existing values in place. Storage cost is minimal.

If removal is required (e.g., PII compliance):
1. Scan for items with the attribute
2. Update each item to remove the attribute

### 9.3 Changing key structure

This requires data migration:
1. Create new items with new key structure
2. Dual-write during transition
3. Delete old items

**Recommendation:** Design keys carefully upfront. The proposed schema supports foreseeable access patterns.

### 9.4 Adding a new GSI

1. Add GSI definition to table (online operation)
2. Wait for backfill to complete
3. Start using the GSI

GSI backfill can take hours for large tables. At 0.5 GB, expect < 1 hour.

---

## 10. Implementation Notes

### 10.1 SDK choice

**Recommended: AWS SDK v3 with DynamoDB DocumentClient**

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand
} from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: 'ap-southeast-2' });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertEmptyValues: false,
  },
});
```

### 10.2 Repository pattern

Maintain the same interface as current Drizzle repositories:

```typescript
interface ProjectRepository {
  findById(id: string): Promise<Project | null>;
  findByStatus(status: ProjectStatus): Promise<Project[]>;
  create(project: CreateProjectInput): Promise<Project>;
  update(id: string, updates: UpdateProjectInput): Promise<Project>;
}

class DynamoProjectRepository implements ProjectRepository {
  async findById(id: string): Promise<Project | null> {
    const result = await docClient.send(new GetCommand({
      TableName: 'AgenticPM',
      Key: { PK: `PROJECT#${id}`, SK: 'METADATA' },
    }));
    return result.Item ? mapToProject(result.Item) : null;
  }

  // ... other methods
}
```

### 10.3 Transaction support

For operations requiring atomicity (rare in this application):

```typescript
import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';

// Example: Update artefact and create event atomically
await docClient.send(new TransactWriteCommand({
  TransactItems: [
    {
      Put: {
        TableName: 'AgenticPM',
        Item: updatedArtefact,
      },
    },
    {
      Put: {
        TableName: 'AgenticPM',
        Item: newEvent,
      },
    },
  ],
}));
```

### 10.4 Error handling

DynamoDB-specific errors to handle:

```typescript
import {
  ConditionalCheckFailedException,
  ProvisionedThroughputExceededException,
  ResourceNotFoundException,
} from '@aws-sdk/client-dynamodb';

try {
  await docClient.send(command);
} catch (error) {
  if (error instanceof ConditionalCheckFailedException) {
    // Optimistic locking failed - item was modified
  } else if (error instanceof ProvisionedThroughputExceededException) {
    // Should not happen with on-demand, but implement retry
  } else if (error instanceof ResourceNotFoundException) {
    // Table doesn't exist - configuration error
  }
  throw error;
}
```

---

## 11. Comparison Summary

| Aspect | PostgreSQL (Current) | DynamoDB (Proposed) |
|--------|---------------------|---------------------|
| **Monthly cost** | $0 (Neon free) | ~$0.49 |
| **Cold starts** | 2-5s without keepalive | None |
| **Connection mgmt** | Required (pooling) | Not needed (HTTP) |
| **TTL/retention** | Manual pruning code | Automatic, free |
| **Scaling** | Limited by compute hours | Unlimited |
| **Backups** | Manual | PITR built-in |
| **Schema changes** | Migrations required | Add attributes freely |
| **Transactions** | Full ACID | Limited (25 items) |
| **Complex queries** | Full SQL | Key-based only |

**For this specific application**, DynamoDB's advantages (zero cold starts, automatic TTL, no connection management, unlimited scaling) outweigh the small cost increase and query limitations.

---

## 12. Recommendations

### Immediate actions

1. **Create table:** Single table `AgenticPM` with proposed key structure
2. **Enable GSI1:** For cross-cutting queries
3. **Enable PITR:** For disaster recovery
4. **Use on-demand:** Capacity mode

### Implementation priorities

1. Define TypeScript types for all DynamoDB items
2. Implement repository layer with same interface as Drizzle
3. Write migration script with validation
4. Test all access patterns before cutover

### Monitoring

Set up CloudWatch alarms for:
- Throttled requests (should never happen with on-demand)
- System errors
- User errors (validation failures)
- Consumed capacity (for cost tracking)

---

## Appendix A: Table Creation CloudFormation

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: DynamoDB table for Agentic PM Workbench

Resources:
  AgenticPMTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: AgenticPM
      BillingMode: PAY_PER_REQUEST

      AttributeDefinitions:
        - AttributeName: PK
          AttributeType: S
        - AttributeName: SK
          AttributeType: S
        - AttributeName: GSI1PK
          AttributeType: S
        - AttributeName: GSI1SK
          AttributeType: S

      KeySchema:
        - AttributeName: PK
          KeyType: HASH
        - AttributeName: SK
          KeyType: RANGE

      GlobalSecondaryIndexes:
        - IndexName: GSI1
          KeySchema:
            - AttributeName: GSI1PK
              KeyType: HASH
            - AttributeName: GSI1SK
              KeyType: RANGE
          Projection:
            ProjectionType: ALL

      TimeToLiveSpecification:
        AttributeName: TTL
        Enabled: true

      PointInTimeRecoverySpecification:
        PointInTimeRecoveryEnabled: true

      SSESpecification:
        SSEEnabled: true

      Tags:
        - Key: Project
          Value: AgenticPM
        - Key: Environment
          Value: Production

Outputs:
  TableName:
    Description: DynamoDB table name
    Value: !Ref AgenticPMTable
  TableArn:
    Description: DynamoDB table ARN
    Value: !GetAtt AgenticPMTable.Arn
```

---

## Appendix B: Entity Type Reference

| EntityType | PK Pattern | SK Pattern | TTL | GSI1 |
|------------|------------|------------|-----|------|
| Project | `PROJECT#<uuid>` | `METADATA` | No | Yes |
| Artefact | `PROJECT#<uuid>` | `ARTEFACT#<type>` | No | No |
| Event | `PROJECT#<uuid>` | `EVENT#<ts>#<ulid>` | 30d | Yes |
| GlobalEventRef | `GLOBAL` | `EVENT#<ts>#<ulid>` | 30d | No |
| Escalation | `PROJECT#<uuid>` | `ESCALATION#<uuid>` | No | Yes |
| AgentAction | `PROJECT#<uuid>` | `ACTION#<ts>#<ulid>` | 90d | No |
| AgentCheckpoint | `PROJECT#<uuid>` | `CHECKPOINT#<integ>#<key>` | No | No |
| IntegrationConfig | `INTEGRATION#<name>` | `CONFIG` | No | No |
| AgentConfig | `AGENT` | `CONFIG#<key>` | No | No |
