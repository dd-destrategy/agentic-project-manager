/**
 * Start and monitor a Step Functions execution against LocalStack.
 *
 * Starts an execution of the agentic-pm-agent-cycle state machine,
 * polls until completion, and prints the result.
 *
 * Usage:
 *   npx tsx scripts/invoke-state-machine.ts
 *   npx tsx scripts/invoke-state-machine.ts --input '{"source":"manual"}'
 *   npx tsx scripts/invoke-state-machine.ts --help
 *
 * Requires: LocalStack running with Step Functions enabled
 *   docker compose up -d && npx tsx scripts/setup-local-aws.ts
 */

import {
  SFNClient,
  StartExecutionCommand,
  DescribeExecutionCommand,
  GetExecutionHistoryCommand,
  type HistoryEvent,
} from '@aws-sdk/client-sfn';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: npx tsx scripts/invoke-state-machine.ts [--input '<json>']

Starts the agentic-pm-agent-cycle state machine in LocalStack and
polls until the execution completes (or fails).

Options:
  --input '<json>'   Custom JSON input for the execution
                     Default: {"source":"manual"}
  --help, -h         Show this help message

Environment:
  STEP_FUNCTIONS_ENDPOINT  Step Functions endpoint (default: http://127.0.0.1:4566)
  LOCALSTACK_ENDPOINT      Fallback endpoint (default: http://127.0.0.1:4566)
  AWS_REGION               AWS region (default: ap-southeast-2)
`);
  process.exit(0);
}

// Parse --input flag
let inputPayload: string = JSON.stringify({ source: 'manual' });
const inputFlagIndex = args.indexOf('--input');
if (inputFlagIndex !== -1) {
  const inputJson = args[inputFlagIndex + 1];
  if (!inputJson) {
    console.error('--input flag requires a JSON string argument');
    process.exit(1);
  }
  try {
    // Validate it parses, then keep as string for the API
    JSON.parse(inputJson);
    inputPayload = inputJson;
  } catch (err) {
    console.error(`Invalid JSON for --input: ${(err as Error).message}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ENDPOINT =
  process.env.STEP_FUNCTIONS_ENDPOINT ??
  process.env.LOCALSTACK_ENDPOINT ??
  'http://127.0.0.1:4566';
const REGION = process.env.AWS_REGION ?? 'ap-southeast-2';
const ACCOUNT_ID = '000000000000';
const STATE_MACHINE_NAME = 'agentic-pm-agent-cycle';
const STATE_MACHINE_ARN = `arn:aws:states:${REGION}:${ACCOUNT_ID}:stateMachine:${STATE_MACHINE_NAME}`;

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 300; // 10 minutes at 2s intervals

const credentials = { accessKeyId: 'test', secretAccessKey: 'test' };
const sfnClient = new SFNClient({
  region: REGION,
  endpoint: ENDPOINT,
  credentials,
});

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

function statusColour(status: string): string {
  switch (status) {
    case 'RUNNING':
      return CYAN;
    case 'SUCCEEDED':
      return GREEN;
    case 'FAILED':
    case 'TIMED_OUT':
    case 'ABORTED':
      return RED;
    default:
      return YELLOW;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n${BOLD}Agentic PM — State Machine Execution${RESET}`);
  console.log(`Endpoint: ${ENDPOINT}`);
  console.log(`State machine: ${STATE_MACHINE_NAME}`);
  console.log(`Input: ${inputPayload}\n`);

  // Start execution
  const executionName = `local-${Date.now()}`;

  let executionArn: string;
  try {
    const startResult = await sfnClient.send(
      new StartExecutionCommand({
        stateMachineArn: STATE_MACHINE_ARN,
        name: executionName,
        input: inputPayload,
      })
    );
    executionArn = startResult.executionArn!;
  } catch (err) {
    console.error(
      `${RED}Failed to start execution:${RESET}`,
      err instanceof Error ? err.message : err
    );
    console.error(
      `\nMake sure LocalStack is running and the state machine has been created:`
    );
    console.error(
      `  docker compose up -d && npx tsx scripts/setup-local-aws.ts`
    );
    process.exit(1);
  }

  console.log(`${GREEN}Execution started${RESET}`);
  console.log(`${DIM}Execution ARN: ${executionArn}${RESET}`);
  console.log(`${DIM}Polling every ${POLL_INTERVAL_MS / 1000}s...${RESET}\n`);

  // Poll until completion
  let lastStatus = '';
  let finalOutput: string | undefined;
  let finalError: { error?: string; cause?: string } | undefined;

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const describeResult = await sfnClient.send(
      new DescribeExecutionCommand({ executionArn })
    );

    const status = describeResult.status ?? 'UNKNOWN';

    if (status !== lastStatus) {
      const colour = statusColour(status);
      console.log(
        `  ${colour}${status}${RESET} ${DIM}(${new Date().toLocaleTimeString()})${RESET}`
      );
      lastStatus = status;
    }

    // Check for terminal states
    if (
      status === 'SUCCEEDED' ||
      status === 'FAILED' ||
      status === 'TIMED_OUT' ||
      status === 'ABORTED'
    ) {
      finalOutput = describeResult.output;

      if (status === 'FAILED' || status === 'TIMED_OUT') {
        finalError = {
          error: describeResult.error,
          cause: describeResult.cause,
        };
      }

      break;
    }
  }

  // Print results
  console.log('');

  if (lastStatus === 'SUCCEEDED') {
    console.log(`${BOLD}${GREEN}Execution succeeded${RESET}\n`);
    if (finalOutput) {
      console.log(`${BOLD}Output:${RESET}`);
      try {
        console.log(JSON.stringify(JSON.parse(finalOutput), null, 2));
      } catch {
        console.log(finalOutput);
      }
    }
  } else if (
    lastStatus === 'FAILED' ||
    lastStatus === 'TIMED_OUT' ||
    lastStatus === 'ABORTED'
  ) {
    console.log(`${BOLD}${RED}Execution ${lastStatus.toLowerCase()}${RESET}\n`);
    if (finalError?.error) {
      console.log(`${RED}Error: ${finalError.error}${RESET}`);
    }
    if (finalError?.cause) {
      console.log(`${RED}Cause: ${finalError.cause}${RESET}`);
    }
  } else {
    console.log(
      `${YELLOW}Execution still running after ${(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s — giving up polling.${RESET}`
    );
    console.log(
      `Check status manually: aws --endpoint-url=${ENDPOINT} stepfunctions describe-execution --execution-arn ${executionArn}`
    );
  }

  // Print execution history summary
  console.log(`\n${BOLD}Execution History:${RESET}`);
  try {
    const history = await sfnClient.send(
      new GetExecutionHistoryCommand({
        executionArn,
        maxResults: 100,
      })
    );

    const events = history.events ?? [];
    const stateEvents = events.filter(
      (e: HistoryEvent) =>
        e.type === 'TaskStateEntered' ||
        e.type === 'TaskStateExited' ||
        e.type === 'ChoiceStateEntered' ||
        e.type === 'PassStateEntered' ||
        e.type === 'SucceedStateEntered' ||
        e.type === 'FailStateEntered' ||
        e.type === 'ExecutionFailed' ||
        e.type === 'ExecutionTimedOut'
    );

    for (const event of stateEvents) {
      const ts = event.timestamp
        ? new Date(event.timestamp).toLocaleTimeString()
        : '';

      // Extract state name from the event details
      const details =
        event.stateEnteredEventDetails ?? event.stateExitedEventDetails;
      const stateName = details?.name ?? event.type ?? '';
      const eventType = event.type ?? '';

      let icon = ' ';
      if (eventType.includes('Entered')) icon = '>';
      else if (eventType.includes('Exited')) icon = '<';
      else if (eventType.includes('Failed')) icon = 'X';
      else if (eventType.includes('Succeed')) icon = '*';

      console.log(
        `  ${DIM}${ts}${RESET}  ${icon} ${stateName} ${DIM}(${eventType})${RESET}`
      );
    }

    if (stateEvents.length === 0) {
      console.log(`  ${DIM}No state transition events found${RESET}`);
    }
  } catch (err) {
    console.log(
      `  ${DIM}Could not retrieve execution history: ${err instanceof Error ? err.message : err}${RESET}`
    );
  }

  // Exit with appropriate code
  if (lastStatus !== 'SUCCEEDED') {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`\n${RED}Unexpected error:${RESET}`, err);
  process.exit(1);
});
