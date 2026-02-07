# Universal Connector Framework — Design Specification

## 1. Problem Statement

The current integration layer is **hardcoded**: `IntegrationSource` is an enum
of `'jira' | 'outlook' | 'asana' | 'ses'`. Adding any new data source requires:

- Writing a full `SignalSource` class (~200-400 lines)
- Writing a normaliser function (~100-200 lines)
- Wiring into change-detection and normalise Lambda handlers
- Updating the `IntegrationSource` enum across schemas, types, and UI

This makes it impractical for users to connect new tools without code changes.

## 2. Design Goals

1. **Configuration-driven connectors** — add most integrations via JSON
   descriptor, not TypeScript
2. **Consistent UX** — every connector looks and behaves the same in the
   dashboard
3. **Graceful coexistence** — native connectors (Jira, Outlook) remain for
   complex use cases; generic runtime handles the rest
4. **Zero downstream changes** — triage, execution, artefact layers continue
   working on `NormalisedSignal` unchanged
5. **Budget-safe** — no new infrastructure costs; runs on existing Lambda +
   DynamoDB

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Connector Registry                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Jira    │  │ GitHub   │  │ Linear   │  │ Custom   │   │
│  │ (native) │  │ (generic)│  │ (generic)│  │ (generic)│   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│       │              │              │              │         │
│  ┌────▼──────────────▼──────────────▼──────────────▼─────┐  │
│  │              Connector Runtime Engine                   │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐ │  │
│  │  │   Auth   │  │  Poller  │  │   Field Mapper /     │ │  │
│  │  │ Provider │  │  Engine  │  │   Signal Normaliser  │ │  │
│  │  └──────────┘  └──────────┘  └──────────────────────┘ │  │
│  └───────────────────────┬───────────────────────────────┘  │
│                          │                                   │
│  ┌───────────────────────▼───────────────────────────────┐  │
│  │              Webhook Receiver Gateway                   │  │
│  │  POST /webhooks/{connectorId}/{projectId}              │  │
│  └───────────────────────┬───────────────────────────────┘  │
└──────────────────────────┼──────────────────────────────────┘
                           │
                    NormalisedSignal[]
                           │
              ┌────────────▼────────────┐
              │  Existing Pipeline       │
              │  sanitise → classify →   │
              │  execute → artefacts     │
              └─────────────────────────┘
```

## 4. Connector Descriptor Schema

Every connector (native or generic) is described by a `ConnectorDescriptor`:

```typescript
interface ConnectorDescriptor {
  /** Unique connector identifier (e.g. 'github-issues', 'linear') */
  id: string;

  /** Human-readable name */
  name: string;

  /** Short description for the UI */
  description: string;

  /** Category for grouping in the UI */
  category: ConnectorCategory;

  /** Icon identifier (lucide icon name or URL) */
  icon: string;

  /** Whether this is a native (code) or generic (config-driven) connector */
  kind: 'native' | 'generic';

  /** Authentication configuration */
  auth: AuthDescriptor;

  /** How to ingest data */
  ingestion:
    | PollingDescriptor
    | WebhookDescriptor
    | PollingAndWebhookDescriptor;

  /** How to map raw API responses to NormalisedSignal fields */
  fieldMapping: FieldMappingDescriptor;

  /** Health check configuration */
  healthCheck: HealthCheckDescriptor;

  /** Connector version for schema migration */
  version: string;
}
```

### 4.1 Auth Descriptor

```typescript
type AuthDescriptor =
  | { method: 'oauth2'; config: OAuth2Config }
  | { method: 'api_key'; config: ApiKeyConfig }
  | { method: 'pat'; config: PatConfig }
  | { method: 'basic'; config: BasicAuthConfig }
  | { method: 'webhook_secret'; config: WebhookSecretConfig }
  | { method: 'none' };

interface OAuth2Config {
  authoriseUrl: string;
  tokenUrl: string;
  scopes: string[];
  /** Credential fields the user must provide */
  credentialFields: CredentialField[];
}

interface ApiKeyConfig {
  /** Where to send the key: header, query, or bearer */
  delivery: 'header' | 'query' | 'bearer';
  /** Header name or query parameter name */
  paramName: string;
  credentialFields: CredentialField[];
}

interface PatConfig {
  delivery: 'header' | 'bearer';
  paramName: string;
  credentialFields: CredentialField[];
}

interface BasicAuthConfig {
  credentialFields: CredentialField[];
}

interface WebhookSecretConfig {
  /** Header containing the signature */
  signatureHeader: string;
  /** Algorithm: hmac-sha256, hmac-sha1 */
  algorithm: string;
  credentialFields: CredentialField[];
}

interface CredentialField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url';
  required: boolean;
  placeholder?: string;
  helpText?: string;
}
```

### 4.2 Polling Descriptor

```typescript
interface PollingDescriptor {
  mode: 'polling';
  /** URL template. Variables: {{baseUrl}}, {{checkpoint}}, {{pageToken}} */
  endpoint: string;
  /** HTTP method */
  method: 'GET' | 'POST';
  /** Optional request headers */
  headers?: Record<string, string>;
  /** Optional request body template (for POST) */
  body?: string;
  /** How checkpoints work for this API */
  delta: DeltaStrategy;
  /** Rate limit (requests per minute) */
  rateLimitRpm: number;
  /** Pagination support */
  pagination?: PaginationDescriptor;
}

type DeltaStrategy =
  | {
      type: 'timestamp_filter';
      queryParam: string;
      format: 'iso8601' | 'unix' | 'unix_ms';
    }
  | { type: 'delta_token'; tokenPath: string; tokenParam: string }
  | { type: 'cursor'; cursorPath: string; cursorParam: string }
  | { type: 'since_id'; idPath: string; idParam: string };

interface PaginationDescriptor {
  type: 'offset' | 'cursor' | 'link_header';
  /** JSONPath to next page token/offset in response */
  nextPath?: string;
  /** Query parameter for next page */
  nextParam?: string;
  /** JSONPath to total count (for offset) */
  totalPath?: string;
  /** Page size */
  pageSize: number;
}
```

### 4.3 Webhook Descriptor

```typescript
interface WebhookDescriptor {
  mode: 'webhook';
  /** Expected event types this connector handles */
  eventTypes: string[];
  /** JSONPath to event type in webhook payload */
  eventTypePath: string;
  /** Signature verification config (references auth.webhook_secret) */
  verification: 'signature' | 'token' | 'none';
}

interface PollingAndWebhookDescriptor {
  mode: 'polling_and_webhook';
  polling: Omit<PollingDescriptor, 'mode'>;
  webhook: Omit<WebhookDescriptor, 'mode'>;
}
```

### 4.4 Field Mapping Descriptor

```typescript
interface FieldMappingDescriptor {
  /** JSONPath to array of items in API response */
  itemsPath: string;
  /** JSONPath to unique ID per item */
  idPath: string;
  /** JSONPath to timestamp per item */
  timestampPath: string;
  /** Template for human-readable summary. Variables: {{fieldName}} */
  summaryTemplate: string;
  /** Rules for determining signal type */
  signalTypeRules: SignalTypeRule[];
  /** Optional priority mapping */
  priorityMapping?: PriorityRule[];
  /** JSONPath to participants array */
  participantsPath?: string;
  /** JSONPath to tags/labels array */
  tagsPath?: string;
  /** JSONPath to related ticket/item references */
  relatedItemsPath?: string;
  /** Fields to preserve in raw payload (for context) */
  rawFields?: string[];
}

interface SignalTypeRule {
  /** Condition: JSONPath expression that must be truthy */
  when: string;
  /** Operator for matching */
  operator: 'equals' | 'contains' | 'exists' | 'matches';
  /** Value to compare against */
  value?: string;
  /** Resulting signal type */
  then: string;
}

interface PriorityRule {
  when: string;
  operator: 'equals' | 'contains' | 'in';
  value: string | string[];
  then: 'critical' | 'high' | 'medium' | 'low';
}
```

### 4.5 Health Check Descriptor

```typescript
interface HealthCheckDescriptor {
  /** URL template for health check endpoint */
  endpoint: string;
  /** HTTP method */
  method: 'GET' | 'HEAD';
  /** Expected HTTP status code */
  expectStatus: number;
  /** Timeout in milliseconds */
  timeoutMs: number;
}
```

## 5. Connector Registry

The registry stores connector descriptors and their instances (configured
connections) in DynamoDB.

### 5.1 Storage Schema

**Connector Descriptors** (templates):

```
PK: CONNECTOR#{connectorId}
SK: DESCRIPTOR

Attributes:
  connectorId: string
  descriptor: ConnectorDescriptor (JSON)
  builtIn: boolean         // true for shipped connectors, false for user-created
  createdAt: ISO8601
  updatedAt: ISO8601
```

**Connector Instances** (configured connections per project):

```
PK: PROJECT#{projectId}
SK: CONNECTOR_INSTANCE#{connectorId}

Attributes:
  projectId: string
  connectorId: string
  enabled: boolean
  credentialSecretArn: string   // Reference to Secrets Manager
  config: Record<string, string>  // baseUrl, projectKey, etc.
  lastHealthCheck: ISO8601
  healthy: boolean
  consecutiveFailures: number
  lastError?: string
  createdAt: ISO8601
  updatedAt: ISO8601
```

**GSI for listing all instances of a connector:**

```
GSI2PK: CONNECTOR#{connectorId}
GSI2SK: PROJECT#{projectId}
```

### 5.2 Registry API

```typescript
interface ConnectorRegistry {
  // Descriptor CRUD
  listDescriptors(): Promise<ConnectorDescriptor[]>;
  getDescriptor(connectorId: string): Promise<ConnectorDescriptor | null>;
  registerDescriptor(descriptor: ConnectorDescriptor): Promise<void>;
  updateDescriptor(
    connectorId: string,
    descriptor: ConnectorDescriptor
  ): Promise<void>;
  deleteDescriptor(connectorId: string): Promise<void>;

  // Instance CRUD
  listInstances(projectId: string): Promise<ConnectorInstance[]>;
  getInstance(
    projectId: string,
    connectorId: string
  ): Promise<ConnectorInstance | null>;
  createInstance(
    projectId: string,
    connectorId: string,
    config: ConnectorInstanceConfig
  ): Promise<ConnectorInstance>;
  updateInstance(
    projectId: string,
    connectorId: string,
    config: Partial<ConnectorInstanceConfig>
  ): Promise<void>;
  deleteInstance(projectId: string, connectorId: string): Promise<void>;
  enableInstance(
    projectId: string,
    connectorId: string,
    enabled: boolean
  ): Promise<void>;
}
```

## 6. Generic Connector Runtime

The runtime executes descriptor-driven connectors without custom code.

### 6.1 Auth Provider

Handles credential injection for HTTP requests based on the `AuthDescriptor`:

```typescript
class UniversalAuthProvider {
  async applyAuth(
    request: HttpRequest,
    authDescriptor: AuthDescriptor,
    credentials: Record<string, string>
  ): Promise<HttpRequest>;

  async refreshOAuth2Token(
    tokenUrl: string,
    credentials: Record<string, string>
  ): Promise<string>;
}
```

### 6.2 Polling Engine

Executes polling based on `PollingDescriptor`:

```typescript
class GenericPollingEngine {
  async fetchDelta(
    descriptor: ConnectorDescriptor,
    credentials: Record<string, string>,
    checkpoint: string | null,
    config: Record<string, string>
  ): Promise<{
    items: unknown[];
    newCheckpoint: string;
  }>;
}
```

The engine:

1. Resolves the endpoint template with `{{baseUrl}}`, `{{checkpoint}}`
2. Applies auth via `UniversalAuthProvider`
3. Sends the HTTP request
4. Extracts items via `itemsPath`
5. Extracts new checkpoint based on `DeltaStrategy`
6. Handles pagination if configured

### 6.3 Field Mapping Engine

Transforms raw items into `NormalisedSignal`:

```typescript
class FieldMappingEngine {
  mapToSignal(
    item: unknown,
    mapping: FieldMappingDescriptor,
    connectorId: string,
    projectId: string
  ): NormalisedSignal;
}
```

Uses JSONPath evaluation for field extraction and template interpolation for
summary generation.

## 7. Webhook Receiver Gateway

A new Lambda behind API Gateway handles inbound webhooks:

```
POST /api/webhooks/{connectorId}/{projectId}
```

### 7.1 Request Flow

1. Look up `ConnectorDescriptor` from registry
2. Verify signature using `WebhookSecretConfig` (if applicable)
3. Extract event type from `eventTypePath`
4. Map payload to `NormalisedSignal` using `FieldMappingDescriptor`
5. Push directly into normalise → triage pipeline (skipping change-detection)

### 7.2 Security

- HMAC signature verification per connector configuration
- Request body size limit (256KB)
- Rate limiting per connector instance (100 req/min)
- Sanitisation pipeline applies to all webhook-sourced signals

## 8. Dashboard — Connector Management UI

### 8.1 Connector Catalogue Page

Shows all available connectors in a searchable grid:

- **Categories**: Project Management, Communication, Code & DevOps, Documents,
  Custom
- **Each card**: Icon, name, description, "Connect" button
- **Search/filter**: By category, by name
- **Status indicators**: Connected (green), Not configured (grey)

### 8.2 Connector Setup Flow

When user clicks "Connect":

1. **Credentials step**: Dynamic form generated from `credentialFields`
2. **Configuration step**: baseUrl, projectKey, etc. (from connector config)
3. **Test connection**: Runs health check against the API
4. **Confirm**: Creates connector instance, stores credentials in Secrets
   Manager

### 8.3 Connector Monitoring

Each connected instance shows:

- Health status (healthy/degraded/error) with animated indicators
- Last sync time, latency, consecutive failures
- Signal count (last 24h, last 7d)
- Enable/disable toggle
- "Test Connection" button
- "Disconnect" with confirmation

## 9. Pre-built Connector Descriptors

Ship with descriptors for common tools:

| Connector     | Category           | Auth    | Ingestion | Signals                                       |
| ------------- | ------------------ | ------- | --------- | --------------------------------------------- |
| GitHub Issues | Code & DevOps      | PAT     | Polling   | issue_created, issue_updated, issue_commented |
| GitHub PRs    | Code & DevOps      | PAT     | Webhook   | pr_opened, pr_merged, pr_reviewed             |
| Linear        | Project Management | API Key | Polling   | issue_created, issue_updated, cycle_changed   |
| Trello        | Project Management | API Key | Polling   | card_created, card_moved, card_commented      |
| Slack         | Communication      | OAuth2  | Webhook   | message_received, mention, reaction           |
| Notion        | Documents          | API Key | Polling   | page_updated, database_updated                |
| Confluence    | Documents          | PAT     | Polling   | page_updated, page_commented                  |
| PagerDuty     | Communication      | API Key | Webhook   | incident_triggered, incident_resolved         |
| Sentry        | Code & DevOps      | API Key | Webhook   | error_created, error_resolved                 |
| Datadog       | Code & DevOps      | API Key | Polling   | monitor_triggered, monitor_resolved           |

## 10. Migration Strategy

### 10.1 Coexistence

Native connectors (Jira, Outlook, SES) continue working unchanged. They are
registered in the connector catalogue as `kind: 'native'` descriptors with their
existing `SignalSource` implementations.

### 10.2 Schema Changes

- `IntegrationSourceSchema` changes from enum to `z.string()` to accept any
  connector ID
- `NormalisedSignal.source` becomes a dynamic string
- All downstream code already treats `source` as a string in practice

### 10.3 Backward Compatibility

- Existing DynamoDB records with `source: 'jira'` continue to work
- Native connectors registered with their original IDs ('jira', 'outlook',
  'ses')
- No data migration required

## 11. What We Are NOT Doing

- **Vector database**: Not needed at current scale (1-2 projects, 30-day TTL).
  Deterministic retrieval continues to work.
- **Self-hosted integration platform** (n8n): Adds operational cost and
  complexity beyond the $15/month budget.
- **Real-time streaming**: Polling + webhooks covers all practical use cases.
- **Custom code plugins**: Descriptor-driven connectors handle 90% of REST APIs.
  Complex integrations get native `SignalSource` implementations.
