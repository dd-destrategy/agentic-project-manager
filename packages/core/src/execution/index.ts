/**
 * Execution module
 *
 * Executes agent actions, manages the hold queue, and creates escalations.
 */

export { executeAction } from './execute.js';
export { checkConfidence } from './confidence.js';
export type { ExecutionResult } from './types.js';
