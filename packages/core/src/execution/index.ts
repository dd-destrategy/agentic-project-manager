/**
 * Execution module
 *
 * Executes agent actions, manages the hold queue, and creates escalations.
 * Implements dry-run mode and autonomy level enforcement.
 */

// Main execution functions
export {
  executeAction,
  executeActions,
  previewActions,
  canExecuteImmediately,
  wouldBeHeld,
  wouldRequireApproval,
} from './execute.js';

// Confidence scoring
export {
  checkConfidence,
  computeConfidence,
  canAutoExecute,
  getBlockingReasons,
  formatConfidenceForDisplay,
} from './confidence.js';

export type {
  ConfidenceInput,
  ConfidenceDisplay,
  DimensionDisplay,
} from './confidence.js';

// Decision boundaries
export {
  DECISION_BOUNDARIES,
  AUTONOMY_LEVEL_PERMISSIONS,
  validateAction,
  isProhibitedAction,
  canAutoExecute,
  requiresHoldQueue,
  requiresApproval,
  getBoundaryCategory,
  isActionAllowedAtLevel,
  getMinimumAutonomyLevel,
  getAllowedActionsAtLevel,
  compareAutonomyLevels,
} from './boundaries.js';

// Types
export type {
  ExecutionResult,
  ExecutionInput,
  ExecutionConfig,
} from './types.js';

export type {
  BoundaryCategory,
  BoundaryActionType,
  BoundaryValidationResult,
} from './boundaries.js';
