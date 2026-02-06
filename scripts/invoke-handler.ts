/**
 * Invoke a Lambda handler locally (no Docker Lambda required).
 *
 * Dynamically imports the handler from packages/lambdas/src/{name}/handler.ts,
 * passes an appropriate mock event, and prints the result.
 *
 * Usage:
 *   npx tsx scripts/invoke-handler.ts heartbeat
 *   npx tsx scripts/invoke-handler.ts change-detection --event '{"cycleId":"test"}'
 *   npx tsx scripts/invoke-handler.ts --help
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: npx tsx scripts/invoke-handler.ts <handler-name> [--event '<json>']

Available handlers:
  heartbeat          First step — health check and active project scan
  change-detection   Poll integrations for changes since last checkpoint
  normalise          Convert raw signals to normalised format
  triage-sanitise    Strip/neutralise untrusted content
  triage-classify    Classify signal importance and recommend actions
  reasoning          Complex multi-source reasoning (Claude Sonnet)
  execute            Execute auto-approved actions, queue holds, create escalations
  artefact-update    Update PM artefacts based on signals
  housekeeping       Daily maintenance — storage check, budget summary, digest
  hold-queue         Process held actions past their heldUntil timestamp

Options:
  --event '<json>'   Custom JSON event payload (overrides default mock)
  --help, -h         Show this help message

Environment:
  DYNAMODB_ENDPOINT  DynamoDB endpoint (default: http://127.0.0.1:4566)
  TABLE_NAME         DynamoDB table name (default: AgenticPM)
  ENVIRONMENT        Runtime environment (default: dev)

Examples:
  npx tsx scripts/invoke-handler.ts heartbeat
  npx tsx scripts/invoke-handler.ts change-detection
  npx tsx scripts/invoke-handler.ts hold-queue --event '{"source":"manual"}'
`);
  process.exit(0);
}

const VALID_HANDLERS = [
  'heartbeat',
  'change-detection',
  'normalise',
  'triage-sanitise',
  'triage-classify',
  'reasoning',
  'execute',
  'artefact-update',
  'housekeeping',
  'hold-queue',
] as const;

type HandlerName = (typeof VALID_HANDLERS)[number];

const handlerName = args[0] as HandlerName;

if (!VALID_HANDLERS.includes(handlerName)) {
  console.error(
    `Unknown handler: "${handlerName}"\n` +
      `Valid handlers: ${VALID_HANDLERS.join(', ')}`
  );
  process.exit(1);
}

// Parse --event flag
let customEvent: unknown = undefined;
const eventFlagIndex = args.indexOf('--event');
if (eventFlagIndex !== -1) {
  const eventJson = args[eventFlagIndex + 1];
  if (!eventJson) {
    console.error('--event flag requires a JSON string argument');
    process.exit(1);
  }
  try {
    customEvent = JSON.parse(eventJson);
  } catch (err) {
    console.error(`Invalid JSON for --event: ${(err as Error).message}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Set environment variables for local development
// ---------------------------------------------------------------------------

process.env.DYNAMODB_ENDPOINT =
  process.env.DYNAMODB_ENDPOINT ?? 'http://127.0.0.1:4566';
process.env.TABLE_NAME = process.env.TABLE_NAME ?? 'AgenticPM';
process.env.TABLE_ARN =
  process.env.TABLE_ARN ??
  'arn:aws:dynamodb:ap-southeast-2:000000000000:table/AgenticPM';
process.env.ENVIRONMENT = process.env.ENVIRONMENT ?? 'dev';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'DEBUG';
process.env.AWS_REGION = process.env.AWS_REGION ?? 'ap-southeast-2';
process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID ?? 'test';
process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY ?? 'test';

// Point Secrets Manager at LocalStack
const localstackEndpoint =
  process.env.LOCALSTACK_ENDPOINT ?? 'http://127.0.0.1:4566';
process.env.AWS_ENDPOINT_URL =
  process.env.AWS_ENDPOINT_URL ?? localstackEndpoint;

// ---------------------------------------------------------------------------
// Mock event payloads (per handler type)
// ---------------------------------------------------------------------------

function getMockEvent(name: HandlerName): unknown {
  const timestamp = new Date().toISOString();

  switch (name) {
    case 'heartbeat':
      return {
        source: 'manual',
      };

    case 'change-detection':
      return {
        cycleId: 'local-test-cycle',
        timestamp,
        activeProjects: [
          '11111111-1111-1111-1111-111111111111',
          '22222222-2222-2222-2222-222222222222',
        ],
        integrations: [{ name: 'jira', healthy: true, lastCheck: timestamp }],
        housekeepingDue: false,
      };

    case 'normalise':
      return {
        hasChanges: true,
        signals: [
          {
            projectId: '11111111-1111-1111-1111-111111111111',
            source: 'jira',
            signals: [
              {
                key: 'WPM-200',
                summary: 'Test ticket for local development',
                status: 'In Progress',
                updated: timestamp,
              },
            ],
            checkpoint: timestamp,
          },
        ],
      };

    case 'triage-sanitise':
      return {
        signals: [
          {
            id: 'local-signal-001',
            source: 'jira',
            timestamp,
            type: 'ticket_updated',
            summary: 'WPM-200 moved to In Progress',
            raw: { key: 'WPM-200', status: 'In Progress' },
            projectId: '11111111-1111-1111-1111-111111111111',
          },
        ],
      };

    case 'triage-classify':
      return {
        signals: [
          {
            id: 'local-signal-001',
            source: 'jira',
            timestamp,
            type: 'ticket_updated',
            summary: 'WPM-200 moved to In Progress',
            raw: { key: 'WPM-200', status: 'In Progress' },
            projectId: '11111111-1111-1111-1111-111111111111',
            sanitised: true,
            sanitisedContent: 'WPM-200 moved to In Progress',
          },
        ],
      };

    case 'reasoning':
      return {
        signals: [
          {
            id: 'local-signal-001',
            source: 'jira',
            timestamp,
            type: 'ticket_updated',
            summary: 'WPM-200 moved to In Progress',
            raw: { key: 'WPM-200', status: 'In Progress' },
            projectId: '11111111-1111-1111-1111-111111111111',
            sanitised: true,
            classification: 'routine',
            priority: 'low',
          },
        ],
        needsComplexReasoning: true,
      };

    case 'execute':
      return {
        signals: [
          {
            id: 'local-signal-001',
            source: 'jira',
            timestamp,
            type: 'ticket_updated',
            summary: 'WPM-200 moved to In Progress',
            projectId: '11111111-1111-1111-1111-111111111111',
          },
        ],
        proposedActions: [],
      };

    case 'artefact-update':
      return {
        executed: 0,
        held: 0,
        escalations: 0,
      };

    case 'housekeeping':
      return {
        housekeepingDue: true,
      };

    case 'hold-queue':
      return {
        version: '0',
        id: 'local-test',
        'detail-type': 'Scheduled Event',
        source: 'aws.events',
        account: '000000000000',
        time: timestamp,
        region: 'ap-southeast-2',
        resources: [],
        detail: {},
      };

    default:
      return {};
  }
}

// ---------------------------------------------------------------------------
// Mock Lambda context
// ---------------------------------------------------------------------------

function getMockContext() {
  return {
    callbackWaitsForEmptyEventLoop: true,
    functionName: `agentic-pm-${handlerName}`,
    functionVersion: '$LATEST',
    invokedFunctionArn: `arn:aws:lambda:ap-southeast-2:000000000000:function:agentic-pm-${handlerName}`,
    memoryLimitInMB: '256',
    awsRequestId: `local-${Date.now()}`,
    logGroupName: `/aws/lambda/agentic-pm-${handlerName}`,
    logStreamName: `local/${new Date().toISOString().split('T')[0]}`,
    getRemainingTimeInMillis: () => 300_000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  };
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const event = customEvent ?? getMockEvent(handlerName);
  const context = getMockContext();

  console.log(`\n${BOLD}${CYAN}Invoking handler: ${handlerName}${RESET}`);
  console.log(
    `${DIM}Handler path: packages/lambdas/src/${handlerName}/handler.ts${RESET}`
  );
  console.log(
    `${DIM}Event: ${JSON.stringify(event, null, 2).slice(0, 500)}${RESET}\n`
  );

  const startTime = performance.now();

  try {
    // Dynamically import the handler module
    const handlerPath = path.resolve(
      process.cwd(),
      'packages',
      'lambdas',
      'src',
      handlerName,
      'handler.ts'
    );
    const handlerModule = await import(pathToFileURL(handlerPath).href);

    if (typeof handlerModule.handler !== 'function') {
      throw new Error(
        `No "handler" export found in ${handlerPath}. ` +
          `Available exports: ${Object.keys(handlerModule).join(', ')}`
      );
    }

    const result = await handlerModule.handler(event, context);
    const durationMs = (performance.now() - startTime).toFixed(0);

    console.log(`\n${BOLD}${GREEN}Handler completed successfully${RESET}`);
    console.log(`${DIM}Duration: ${durationMs}ms${RESET}\n`);
    console.log(`${BOLD}Output:${RESET}`);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    const durationMs = (performance.now() - startTime).toFixed(0);

    console.log(`\n${BOLD}${RED}Handler failed${RESET}`);
    console.log(`${DIM}Duration: ${durationMs}ms${RESET}\n`);

    if (err instanceof Error) {
      console.error(`${RED}Error: ${err.message}${RESET}`);
      if (err.stack) {
        console.error(`${DIM}${err.stack}${RESET}`);
      }
    } else {
      console.error(err);
    }

    process.exit(1);
  }
}

main();
