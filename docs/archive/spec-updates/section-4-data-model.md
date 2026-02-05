## 4. Data Model

### 4.1 DynamoDB table schema

Single-table design with on-demand capacity. Table name: `AgenticPM`.

#### Key structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TABLE: AgenticPM                                      │
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

#### Entity definitions

**Project**

```
PK: PROJECT#<uuid>
SK: METADATA

Attributes:
  id             String (UUID)           Required
  name           String                  Required
  description    String                  Optional
  status         String                  Required, one of: active | paused | archived
  source         String                  Required, one of: jira | asana
  sourceProjectKey String                Required, e.g. "MCU" for Jira
  autonomyLevel  String                  Required, one of: monitoring | artefact | tactical
  config         Map                     Required, default: {}
  createdAt      String (ISO 8601)       Required
  updatedAt      String (ISO 8601)       Required
  GSI1PK         String                  STATUS#<status>
  GSI1SK         String                  PROJECT#<uuid>
```

**Artefact**

```
PK: PROJECT#<uuid>
SK: ARTEFACT#<type>

Attributes:
  id             String (UUID)           Required
  projectId      String (UUID)           Required
  type           String                  Required, one of: delivery_state | raid_log | backlog_summary | decision_log
  content        Map                     Required, structured artefact data (see section 4.2)
  previousVersion Map                    Optional, one-deep undo
  version        Number                  Required, default: 1
  createdAt      String (ISO 8601)       Required
  updatedAt      String (ISO 8601)       Required
```

**Event**

```
PK: PROJECT#<uuid>
SK: EVENT#<timestamp>#<ulid>

Attributes:
  id             String (ULID)           Required
  projectId      String (UUID)           Optional (null for global events)
  eventType      String                  Required, e.g. heartbeat | signal_detected | action_taken | escalation_created | artefact_updated | error
  severity       String                  Required, one of: info | warning | error | critical
  summary        String                  Required
  detail         Map                     Optional
  createdAt      String (ISO 8601)       Required
  TTL            Number (Unix epoch)     Required, createdAt + 30 days
  GSI1PK         String                  EVENT#<date>
  GSI1SK         String                  <timestamp>#<ulid>
```

**Global Event Reference**

For cross-project queries (activity feed showing all events):

```
PK: GLOBAL
SK: EVENT#<timestamp>#<ulid>

Attributes:
  projectId      String (UUID)           Optional
  eventType      String                  Required
  severity       String                  Required
  summary        String                  Required
  createdAt      String (ISO 8601)       Required
  TTL            Number (Unix epoch)     Required, createdAt + 30 days
```

**Escalation**

```
PK: PROJECT#<uuid>
SK: ESCALATION#<uuid>

Attributes:
  id             String (UUID)           Required
  projectId      String (UUID)           Required
  title          String                  Required
  context        Map                     Required, structured context for the decision
  options        List                    Required, array of options with pros/cons
  agentRecommendation String             Optional
  agentRationale String                  Optional
  status         String                  Required, one of: pending | decided | expired | superseded
  userDecision   String                  Optional
  userNotes      String                  Optional
  decidedAt      String (ISO 8601)       Optional
  createdAt      String (ISO 8601)       Required
  GSI1PK         String                  ESCALATION#<status>
  GSI1SK         String                  <timestamp>#<uuid>
```

**Agent Action**

```
PK: PROJECT#<uuid>
SK: ACTION#<timestamp>#<ulid>

Attributes:
  id             String (ULID)           Required
  projectId      String (UUID)           Optional
  actionType     String                  Required, e.g. artefact_update | email_sent | jira_update | escalation_created | notification_sent
  description    String                  Required
  detail         Map                     Optional
  confidence     Map                     Optional, structured confidence scores (see section 5.4)
  executed       Boolean                 Required, default: false
  heldUntil      String (ISO 8601)       Optional, for draft-then-send hold queue
  executedAt     String (ISO 8601)       Optional
  createdAt      String (ISO 8601)       Required
  TTL            Number (Unix epoch)     Required, createdAt + 90 days
```

**Agent Checkpoint**

```
PK: PROJECT#<uuid>
SK: CHECKPOINT#<integration>#<key>

Attributes:
  projectId      String (UUID)           Required
  integration    String                  Required, e.g. jira | outlook | asana
  checkpointKey  String                  Required, e.g. last_sync | delta_token
  checkpointValue String                 Required
  updatedAt      String (ISO 8601)       Required
```

**Integration Config**

```
PK: INTEGRATION#<name>
SK: CONFIG

Attributes:
  id             String (UUID)           Required
  integration    String                  Required, one of: jira | asana | outlook | resend
  configEncrypted String (Base64)        Required, KMS-encrypted credentials
  status         String                  Required, one of: active | inactive | error
  lastHealthCheck String (ISO 8601)      Optional
  createdAt      String (ISO 8601)       Required
  updatedAt      String (ISO 8601)       Required
```

**Agent Config**

```
PK: AGENT
SK: CONFIG#<key>

Attributes:
  key            String                  Required
  value          Any (String/Number/Map) Required
  updatedAt      String (ISO 8601)       Required

Default entries:
  CONFIG#polling_interval_minutes    → 15
  CONFIG#budget_ceiling_daily_usd    → 0.33
  CONFIG#hold_queue_minutes          → 30
  CONFIG#working_hours               → {"start": "08:00", "end": "18:00", "timezone": "Australia/Sydney"}
```

#### Global Secondary Index (GSI1)

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
└───────────────────────────────┴─────────────────────────────────┘

Projection: ALL (all attributes projected for full entity retrieval)
```

**GSI1 access patterns:**

| Access Pattern | Query |
|---------------|-------|
| Get pending escalations (global) | GSI1PK = `ESCALATION#pending` |
| Get active projects | GSI1PK = `STATUS#active` |
| Get events by date (global) | GSI1PK = `EVENT#<date>` |

#### TTL configuration

DynamoDB TTL automatically deletes expired items at no cost.

| Entity | TTL Attribute | Retention |
|--------|---------------|-----------|
| Event | `TTL` | 30 days from creation |
| Global Event Reference | `TTL` | 30 days from creation |
| Agent Action | `TTL` | 90 days from creation |

**TTL calculation:**
```typescript
const eventTTL = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);    // 30 days
const actionTTL = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60);   // 90 days
```

TTL deletions are processed in the background (may take up to 48 hours) and consume no write capacity. This eliminates the manual pruning logic from the agent loop.

#### Primary access patterns

| Access Pattern | Operation | Key Condition |
|---------------|-----------|---------------|
| Get project by ID | GetItem | PK = `PROJECT#<id>`, SK = `METADATA` |
| Get all artefacts for project | Query | PK = `PROJECT#<id>`, SK begins_with `ARTEFACT#` |
| Get specific artefact | GetItem | PK = `PROJECT#<id>`, SK = `ARTEFACT#<type>` |
| Get project events (paginated) | Query | PK = `PROJECT#<id>`, SK begins_with `EVENT#`, ScanIndexForward=false |
| Get recent global events | Query | PK = `GLOBAL`, SK begins_with `EVENT#`, ScanIndexForward=false |
| Get project escalations | Query | PK = `PROJECT#<id>`, SK begins_with `ESCALATION#` |
| Get project actions | Query | PK = `PROJECT#<id>`, SK begins_with `ACTION#` |
| Get checkpoint | GetItem | PK = `PROJECT#<id>`, SK = `CHECKPOINT#<integ>#<key>` |
| Get integration config | GetItem | PK = `INTEGRATION#<name>`, SK = `CONFIG` |
| Get agent config | GetItem | PK = `AGENT`, SK = `CONFIG#<key>` |
| Get all agent configs | Query | PK = `AGENT`, SK begins_with `CONFIG#` |

### 4.2 Artefact JSON schemas

These schemas define the structured content stored in the artefact `content` attribute. The agent generates and maintains these via Claude tool-use.

#### Delivery State

```json
{
  "overall_status": "green | amber | red",
  "status_summary": "One-paragraph summary of project health",
  "current_sprint": {
    "name": "Sprint 12",
    "start_date": "2026-02-03T00:00:00Z",
    "end_date": "2026-02-14T00:00:00Z",
    "goal": "Complete user profile migration",
    "progress": {
      "total_points": 34,
      "completed_points": 21,
      "in_progress_points": 8,
      "blocked_points": 5
    }
  },
  "milestones": [
    {
      "name": "Beta launch",
      "due_date": "2026-03-15T00:00:00Z",
      "status": "on_track | at_risk | delayed | completed",
      "notes": "Dependent on API migration completing by March 1"
    }
  ],
  "blockers": [
    {
      "id": "B001",
      "description": "Design assets for profile page not delivered",
      "owner": "Sarah K",
      "raised_date": "2026-01-28T00:00:00Z",
      "severity": "high | medium | low",
      "source_ticket": "MCU-142"
    }
  ],
  "key_metrics": {
    "velocity_trend": "increasing | stable | decreasing",
    "avg_cycle_time_days": 4.2,
    "open_blockers": 1,
    "active_risks": 3
  },
  "next_actions": [
    "Follow up with Sarah on design assets by Feb 5",
    "Review sprint 13 scope with team"
  ]
}
```

#### RAID Log

```json
{
  "items": [
    {
      "id": "R001",
      "type": "risk | assumption | issue | dependency",
      "title": "API vendor announces EOL",
      "description": "Vendor A API will be decommissioned June 2026. Migration to Vendor B required.",
      "severity": "critical | high | medium | low",
      "status": "open | mitigating | resolved | accepted | closed",
      "owner": "Damien",
      "raised_date": "2026-01-15T00:00:00Z",
      "due_date": "2026-03-01T00:00:00Z",
      "mitigation": "Evaluate Vendor B, begin migration by Feb 15",
      "resolution": null,
      "resolved_date": null,
      "source": "agent_detected | user_added | integration_signal",
      "source_reference": "MCU-156",
      "last_reviewed": "2026-02-01T00:00:00Z"
    }
  ]
}
```

#### Decision Log

```json
{
  "decisions": [
    {
      "id": "D001",
      "title": "Delay beta launch to mid-April",
      "context": "API vendor migration requires 3 weeks. Original March 15 date at risk.",
      "options_considered": [
        {
          "option": "Delay to mid-April",
          "pros": ["Lower risk", "Within contingency budget"],
          "cons": ["4-week delay to market"]
        },
        {
          "option": "Rush migration, keep March date",
          "pros": ["On-time delivery"],
          "cons": ["High quality risk", "Team burnout", "$7k premium"]
        }
      ],
      "decision": "Delay to mid-April",
      "rationale": "Lower risk, within budget, maintains quality standards",
      "made_by": "user",
      "date": "2026-02-03T00:00:00Z",
      "status": "active | superseded | reversed",
      "related_raid_items": ["R001"]
    }
  ]
}
```

#### Backlog Summary

```json
{
  "source": "jira | asana",
  "last_synced": "2026-02-04T10:30:00Z",
  "summary": {
    "total_items": 47,
    "by_status": {
      "to_do": 22,
      "in_progress": 8,
      "done_this_sprint": 12,
      "blocked": 5
    },
    "by_priority": {
      "critical": 2,
      "high": 11,
      "medium": 24,
      "low": 10
    }
  },
  "highlights": [
    {
      "ticket_id": "MCU-142",
      "title": "Profile page redesign",
      "flag": "blocked | stale | missing_criteria | scope_creep | new",
      "detail": "Blocked on design assets from Sarah. No update in 7 days.",
      "suggested_action": "Escalate to design lead"
    }
  ],
  "refinement_candidates": [
    {
      "ticket_id": "MCU-155",
      "title": "Implement LinkedIn import",
      "issue": "Missing acceptance criteria"
    }
  ],
  "scope_notes": "3 new tickets added mid-sprint (possible scope creep)"
}
```

### 4.3 Storage budget

DynamoDB on-demand pricing eliminates the fixed storage ceiling of the previous Neon free tier (0.5 GB). Storage scales automatically with usage.

#### Projected storage

| Category | Estimated Size | Notes |
|----------|---------------|-------|
| Projects + metadata | ~1 KB per project | Negligible at 1-2 projects |
| Artefacts (current + previous_version) | ~100 KB per artefact | 4 artefact types × 2 versions × ~12 KB each |
| Events (30-day window) | ~50 MB | TTL auto-expires; ~2000 events/month × 25 KB average |
| Agent actions (90-day window) | ~30 MB | TTL auto-expires; ~3000 actions/quarter × 10 KB average |
| Escalations | ~5 MB | Rarely large; accumulates over time |
| Checkpoints + configs | ~100 KB | Tiny, fixed overhead |
| GSI1 overhead | ~30 MB | Partial attribute projection |
| **Total projected** | **~120 MB** | Well under DynamoDB practical limits |

#### Monthly cost estimate

| Component | Calculation | Monthly Cost |
|-----------|-------------|--------------|
| Storage | 0.12 GB × $0.25/GB | $0.03 |
| Write requests | ~50K × $1.25/million | $0.06 |
| Read requests | ~200K × $0.25/million | $0.05 |
| GSI storage | ~0.03 GB × $0.25/GB | $0.01 |
| GSI writes | ~50K × $1.25/million | $0.06 |
| GSI reads | ~50K × $0.25/million | $0.01 |
| Point-in-time recovery | 0.12 GB × $0.20/GB | $0.02 |
| **Total** | | **~$0.25/month** |

#### Retention policy

Automatic via DynamoDB TTL:

| Entity | Retention | Mechanism |
|--------|-----------|-----------|
| Events | 30 days | TTL attribute, auto-deleted |
| Global event references | 30 days | TTL attribute, auto-deleted |
| Agent actions | 90 days | TTL attribute, auto-deleted |
| Artefacts | Indefinite | No TTL; only current + previous_version retained |
| Escalations | Indefinite | No TTL; historical record |
| Projects | Indefinite | No TTL; user-managed archival |

**Note:** TTL eliminates the need for manual housekeeping pruning in the agent loop. The daily housekeeping step (step 9 in section 5.1) can be simplified to storage monitoring and daily digest only.

#### Capacity mode

**On-demand** (PAY_PER_REQUEST): No capacity planning required. Automatic scaling handles any traffic spikes. At this scale, on-demand is both simpler and cheaper than provisioned capacity.

#### Backup and recovery

- **Point-in-time recovery (PITR):** Enabled. Continuous backups with 35-day retention. Restore to any second within the retention window.
- **On-demand backups:** Available for long-term archival if needed.
- **Cost:** ~$0.02/month at projected storage levels.
