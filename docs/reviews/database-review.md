# DynamoDB Database Design Review

> **Review Date:** 2026-02-05 **Branch:**
> `claude/setup-monorepo-structure-V2G3w` **Reviewer:** DynamoDB Expert Review
> **Scope:** Single-table design, GSI usage, access patterns, data modelling

---

## Executive Summary

The Agentic PM Workbench implements a **well-designed single-table DynamoDB
architecture** that follows AWS best practices for serverless applications. The
design demonstrates thoughtful consideration of access patterns, appropriate use
of GSI1 for cross-partition queries, and sensible TTL configuration for data
lifecycle management.

**Overall Assessment:** The database design is production-ready with minor
optimisations recommended. The implementation correctly prioritises the
project's constraints (single-user, $15/month budget) while maintaining
extensibility.

**Database Design Score: 8/10**

---

## 1. Access Pattern Analysis

### 1.1 Primary Key Structure

| Entity           | PK Pattern                   | SK Pattern                       | Assessment                                     |
| ---------------- | ---------------------------- | -------------------------------- | ---------------------------------------------- |
| Project          | `PROJECT#<uuid>`             | `METADATA`                       | Optimal - enables item collection queries      |
| Artefact         | `PROJECT#<uuid>`             | `ARTEFACT#<type>`                | Optimal - 4 items max, co-located with project |
| Event            | `PROJECT#<uuid>` or `GLOBAL` | `EVENT#<timestamp>#<ulid>`       | Good - timestamp sorting, ULID for uniqueness  |
| Escalation       | `PROJECT#<uuid>`             | `ESCALATION#<ulid>`              | Good - co-located with project data            |
| Checkpoint       | `PROJECT#<uuid>`             | `CHECKPOINT#<integration>#<key>` | Optimal - efficient for delta polling          |
| Agent Config     | `AGENT`                      | `CONFIG#<key>`                   | Good - singleton pattern for global config     |
| Held Action      | `PROJECT#<uuid>`             | `HELD#<ulid>`                    | Good - co-located with project                 |
| Graduation State | `PROJECT#<uuid>`             | `GRADUATION#<actionType>`        | Good - project-scoped trust tracking           |

**Verdict:** The PK/SK structure is well-designed. Item collections are
logically grouped by project, enabling efficient single-query retrieval of
related data.

### 1.2 Supported Access Patterns

| Access Pattern                   | Implementation                | Efficiency                  |
| -------------------------------- | ----------------------------- | --------------------------- |
| Get project by ID                | Direct GetItem                | O(1)                        |
| Get all artefacts for project    | Query with SK prefix          | O(1) - 4 items max          |
| Get recent events for project    | Query with SK prefix, reverse | O(n) with limit             |
| Get global events by date        | GSI1 query                    | O(n) with limit             |
| Get pending escalations (global) | GSI1 query                    | O(n)                        |
| Get ready held actions           | GSI1 query with SK condition  | O(n)                        |
| Get active projects              | GSI1 query                    | O(n) - expected to be small |
| Get agent config                 | Query with SK prefix          | O(1) - bounded              |

### 1.3 Access Pattern Gaps

| Missing Pattern                                | Impact                     | Recommendation                              |
| ---------------------------------------------- | -------------------------- | ------------------------------------------- |
| Get checkpoints by integration (cross-project) | Low - acknowledged in code | Add GSI if needed in future                 |
| Get graduation states by tier (cross-project)  | Low - single user          | Not needed for MVP                          |
| Historical artefact versions                   | Medium                     | Consider separate version history if needed |

---

## 2. GSI Usage Analysis

### 2.1 GSI1 Configuration

| Property      | Value             | Assessment                       |
| ------------- | ----------------- | -------------------------------- |
| Partition Key | `GSI1PK` (String) | Correct                          |
| Sort Key      | `GSI1SK` (String) | Correct                          |
| Projection    | ALL               | Appropriate for small item sizes |

### 2.2 GSI1 Access Patterns

| GSI1PK Value                       | Purpose                 | SK Usage             | Efficiency                          |
| ---------------------------------- | ----------------------- | -------------------- | ----------------------------------- |
| `STATUS#active`                    | Active projects list    | `updatedAt`          | Good - bounded by project count     |
| `ESCALATION#pending`               | Dashboard pending count | `createdAt`          | Good - enables oldest-first sorting |
| `ESCALATION#decided`               | Recently decided        | `decidedAt`          | Good - date-based queries           |
| `EVENT#<date>`                     | Activity feed by date   | `<timestamp>#<ulid>` | Optimal - hot partition per day     |
| `HELD#PENDING`                     | Ready actions           | `heldUntil`          | Excellent - enables range queries   |
| `HELD#APPROVED/CANCELLED/EXECUTED` | Status tracking         | `timestamp`          | Good - audit trail support          |

### 2.3 GSI Efficiency Assessment

**Strengths:**

- GSI1 is efficiently used for cross-partition queries that cannot be served by
  the primary key
- The `HELD#PENDING` pattern with `heldUntil` as SK enables efficient range
  queries for the 1-minute scheduler
- Event date partitioning prevents hot partitions on high-volume days

**Concerns:**

- No sparse GSI optimisation - items without GSI1PK/GSI1SK still project to the
  index
- GSI write amplification on status changes (escalation, held action) -
  acceptable for low volume

---

## 3. Design Strengths

### 3.1 Single-Table Design Excellence

1. **Logical Item Collections:** All project-related data co-located under
   `PROJECT#<uuid>`, enabling single-query retrieval of project + artefacts +
   events.

2. **Key Prefix Convention:** Consistent use of `#` delimiters and uppercase
   prefixes (e.g., `PROJECT#`, `ARTEFACT#`) provides clarity and prevents key
   collisions.

3. **ULID for Event IDs:** Using ULID (Universally Unique Lexicographically
   Sortable Identifier) ensures chronological ordering within partitions.

### 3.2 Repository Layer Quality

1. **Clean Abstraction:** The `DynamoDBClient` wrapper provides a clean
   interface over AWS SDK v3 with proper TypeScript generics.

2. **Robust Error Handling:** Custom `DynamoDBError` class with error
   categorisation (retryable vs non-retryable).

3. **Exponential Backoff:** Built-in retry logic with jitter prevents thundering
   herd on transient failures.

4. **Batch Operation Support:** `batchWriteAll` and `batchGetAll` handle
   chunking automatically, respecting DynamoDB limits (25/100 items).

5. **Transaction Support:** `transactWrite` enables atomic multi-item operations
   for complex workflows.

### 3.3 Data Lifecycle Management

1. **TTL Configuration:**
   - Events: 30 days (appropriate for activity feed)
   - Actions: 90 days (appropriate for audit trail)
   - Checkpoints: No TTL (required for delta detection)

2. **Version History:** Artefacts store `previousVersion` for one-deep undo
   capability.

3. **Point-in-Time Recovery:** Enabled at table level for disaster recovery.

### 3.4 Budget-Conscious Design

1. **On-Demand Billing:** PAY_PER_REQUEST mode appropriate for variable,
   low-volume workload.
2. **Single Table:** Minimises management overhead and costs.
3. **No over-indexing:** Single GSI sufficient for all cross-partition queries.

---

## 4. Concerns and Gaps

### 4.1 High Priority

#### 4.1.1 Race Condition in Budget Tracking

**Location:** `packages/core/src/db/repositories/agent-config.ts` -
`recordSpend()`

**Issue:** The budget tracking reads current value, increments in application
code, then writes back. This is not atomic and could result in lost updates
under concurrent Lambda invocations.

```typescript
// Current implementation (simplified)
const status = await this.getBudgetStatus();
const newDailySpend = status.dailySpendUsd + amountUsd;
await this.setValue(CONFIG_KEYS.DAILY_SPEND, newDailySpend);
```

**Recommendation:** Use DynamoDB atomic counters via `UpdateExpression`:

```typescript
UpdateExpression: 'SET #value = #value + :amount';
```

**Risk:** Low (single-user application), but could cause budget overruns if
multiple cycles overlap.

### 4.2 Medium Priority

#### 4.2.1 Client-Side Filtering Inefficiency

**Location:** Multiple repositories (event, escalation)

**Issue:** Filtering by `eventType` and `severity` is done client-side after
fetching items, potentially wasting RCU.

```typescript
// Current implementation
let items = result.items;
if (options?.eventType) {
  items = items.filter((e) => e.eventType === options.eventType);
}
```

**Recommendation:** Use `FilterExpression` in DynamoDB queries:

```typescript
FilterExpression: 'eventType = :type',
ExpressionAttributeValues: { ':type': eventType }
```

**Impact:** Minor RCU savings, but filter expressions are evaluated server-side.

#### 4.2.2 Missing Optimistic Locking on Updates

**Issue:** Most update operations do not use condition expressions to prevent
lost updates.

**Affected Operations:**

- Artefact updates (uses full item replacement)
- Escalation status updates
- Held action status updates

**Recommendation:** Add version number and condition expression:

```typescript
ConditionExpression: 'version = :expectedVersion';
```

**Risk:** Low for single-user, but could cause issues if UI and agent update
simultaneously.

### 4.3 Low Priority

#### 4.3.1 Checkpoint Cross-Project Query

**Location:** `packages/core/src/db/repositories/checkpoint.ts` -
`getAllForIntegration()`

**Issue:** Method logs warning and returns empty array. Not efficiently
implementable without scan or additional GSI.

```typescript
async getAllForIntegration(integration: IntegrationSource): Promise<AgentCheckpoint[]> {
  console.warn('getAllForIntegration not efficiently implemented');
  return [];
}
```

**Recommendation:** If this pattern is needed, add GSI2 with
`GSI2PK = CHECKPOINT#<integration>`. For MVP, the warning is appropriate.

#### 4.3.2 Event Timestamp String Sorting

**Issue:** Events are sorted by ISO 8601 timestamp strings. While this works
correctly for lexicographic sorting, it's worth noting:

- String comparison is slightly slower than numeric
- Timezone variations could cause unexpected ordering (though ISO 8601 UTC is
  used consistently)

**Recommendation:** No action needed - current implementation is correct.
Document that all timestamps must be UTC ISO 8601.

#### 4.3.3 Sparse GSI Consideration

**Issue:** Items without `GSI1PK`/`GSI1SK` attributes still consume storage in
the GSI (as empty projections).

**Impact:** Negligible for this workload size.

**Recommendation:** No action needed for MVP. If scale increases, consider
sparse indexes by not setting GSI keys on items that don't need cross-partition
access.

---

## 5. Recommendations

### 5.1 Immediate (Pre-Production)

| #   | Recommendation                                | Effort | Impact |
| --- | --------------------------------------------- | ------ | ------ |
| 1   | Convert budget tracking to atomic increment   | Low    | High   |
| 2   | Add condition expressions to critical updates | Medium | Medium |

### 5.2 Near-Term (Post-MVP)

| #   | Recommendation                                    | Effort | Impact |
| --- | ------------------------------------------------- | ------ | ------ |
| 3   | Move client-side filters to FilterExpression      | Low    | Low    |
| 4   | Add version-based optimistic locking to artefacts | Medium | Medium |
| 5   | Consider GSI2 for checkpoint queries if needed    | Medium | Low    |

### 5.3 Future Considerations

| #   | Recommendation                                          | Trigger                 |
| --- | ------------------------------------------------------- | ----------------------- |
| 6   | Evaluate sparse GSI if item count grows significantly   | >10,000 items           |
| 7   | Consider read replicas if read latency becomes critical | Multi-region expansion  |
| 8   | Evaluate DynamoDB Streams for event-driven patterns     | Real-time notifications |

---

## 6. Data Model Summary

### 6.1 Entity Relationship Diagram (Logical)

```
                          +----------------+
                          |     AGENT      |
                          |  (singleton)   |
                          +-------+--------+
                                  |
                                  | CONFIG#*
                                  v
+------------------+        +-----------+        +------------------+
|    INTEGRATION   |        |  PROJECT  |        |      GLOBAL      |
|   (per service)  |        |           |        |   (singleton)    |
+--------+---------+        +-----+-----+        +--------+---------+
         |                        |                       |
         | CONFIG                 |                       | EVENT#*
         v                        |                       v
   [Jira, Outlook,                |               [Global events]
    SES configs]                  |
                                  |
          +-----------------------+-----------------------+
          |           |           |           |           |
          v           v           v           v           v
    ARTEFACT#*   EVENT#*   ESCALATION#*   HELD#*   GRADUATION#*
    (4 types)
```

### 6.2 Key Statistics

| Metric        | Value       | Notes                                                                             |
| ------------- | ----------- | --------------------------------------------------------------------------------- |
| Entity Types  | 8           | Project, Artefact, Event, Escalation, Checkpoint, Config, Held Action, Graduation |
| GSI Count     | 1           | Sufficient for all cross-partition patterns                                       |
| Max Item Size | ~400 KB     | Artefacts with large RAID logs                                                    |
| TTL-Enabled   | Yes         | Events (30d), Actions (90d)                                                       |
| Encryption    | AWS Managed | Default encryption at rest                                                        |

---

## 7. Conclusion

The DynamoDB implementation for Agentic PM Workbench is **well-architected and
fit for purpose**. The single-table design follows AWS best practices, and the
repository layer provides clean abstractions with proper error handling.

Key positives:

- Thoughtful access pattern design
- Efficient GSI usage for cross-partition queries
- Appropriate TTL and data lifecycle management
- Budget-conscious on-demand billing

Areas for improvement:

- Atomic budget tracking operations
- Optimistic locking for concurrent updates
- Server-side filtering for query efficiency

The design appropriately balances simplicity, cost, and functionality for a
single-user personal tool with a $15/month budget ceiling.

---

**Database Design Score: 8/10**

| Category                  | Score | Weight   | Weighted |
| ------------------------- | ----- | -------- | -------- |
| PK/SK Structure           | 9/10  | 25%      | 2.25     |
| GSI Usage                 | 8/10  | 20%      | 1.60     |
| Access Pattern Coverage   | 8/10  | 20%      | 1.60     |
| Data Modelling            | 8/10  | 15%      | 1.20     |
| Repository Implementation | 8/10  | 10%      | 0.80     |
| TTL/Lifecycle             | 9/10  | 5%       | 0.45     |
| Cost Efficiency           | 9/10  | 5%       | 0.45     |
| **Total**                 |       | **100%** | **8.35** |

Rounded to **8/10** - Production-ready with minor optimisations recommended.
