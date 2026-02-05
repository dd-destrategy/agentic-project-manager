/**
 * Artefact content validator
 *
 * Validates artefact content against Zod schemas.
 */

import {
  BacklogSummaryContentSchema,
  DecisionLogContentSchema,
  DeliveryStateContentSchema,
  RaidLogContentSchema,
} from '../schemas/index.js';
import type { ArtefactContent, ArtefactType } from '../types/index.js';

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

/**
 * Validate artefact content against the appropriate schema
 */
export function validateArtefactContent(
  artefactType: ArtefactType,
  content: ArtefactContent
): ValidationResult {
  const schema = getSchemaForType(artefactType);

  const result = schema.safeParse(content);

  if (result.success) {
    return { valid: true };
  }

  const errors = result.error.errors.map(
    (e) => `${e.path.join('.')}: ${e.message}`
  );

  return { valid: false, errors };
}

/**
 * Get the Zod schema for an artefact type
 */
function getSchemaForType(artefactType: ArtefactType) {
  switch (artefactType) {
    case 'delivery_state':
      return DeliveryStateContentSchema;
    case 'raid_log':
      return RaidLogContentSchema;
    case 'backlog_summary':
      return BacklogSummaryContentSchema;
    case 'decision_log':
      return DecisionLogContentSchema;
  }
}
