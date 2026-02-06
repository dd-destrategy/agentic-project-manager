import { z } from 'zod';

/**
 * Schema for updating autonomy level
 * Level values: 1 = monitoring, 2 = artefact, 3 = tactical
 */
export const updateAutonomySchema = z.object({
  level: z.enum(['1', '2', '3']),
});

/**
 * Schema for deciding on an escalation
 */
export const decideEscalationSchema = z.object({
  decision: z.string(),
  notes: z.string().optional(),
});

/**
 * Schema for approving a held action
 */
export const approveHeldActionSchema = z.object({
  actionId: z.string(),
  projectId: z.string(),
});

/**
 * Schema for confirming graduation to a higher autonomy level
 */
export const confirmGraduationSchema = z.object({
  targetLevel: z.number().min(2).max(3),
});

/**
 * Schema for cancelling a held action
 */
export const cancelHeldActionSchema = z.object({
  projectId: z.string(),
  reason: z.string().optional(),
});

/**
 * Schema for autonomy PATCH request (existing API compatibility)
 */
export const updateAutonomySettingsSchema = z.object({
  autonomyLevel: z.enum(['monitoring', 'artefact', 'tactical']).optional(),
  dryRun: z.boolean().optional(),
});

/**
 * Schema for autonomy acknowledgement action
 */
export const autonomyAcknowledgeSchema = z.object({
  action: z.enum(['acknowledge', 'clear']),
});

export type UpdateAutonomyInput = z.infer<typeof updateAutonomySchema>;
export type DecideEscalationInput = z.infer<typeof decideEscalationSchema>;
export type ApproveHeldActionInput = z.infer<typeof approveHeldActionSchema>;
export type ConfirmGraduationInput = z.infer<typeof confirmGraduationSchema>;
export type CancelHeldActionInput = z.infer<typeof cancelHeldActionSchema>;
export type UpdateAutonomySettingsInput = z.infer<
  typeof updateAutonomySettingsSchema
>;
export type AutonomyAcknowledgeInput = z.infer<
  typeof autonomyAcknowledgeSchema
>;

// ============================================================================
// Project schemas (C02 + C05)
// ============================================================================

/**
 * Schema for PATCH /api/projects/[id]
 * Only allows safe, known fields to prevent arbitrary field injection.
 */
export const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(['active', 'paused', 'archived']).optional(),
  autonomyLevel: z.enum(['monitoring', 'artefact', 'tactical']).optional(),
  config: z.record(z.unknown()).optional(),
});

/**
 * Schema for POST /api/projects
 */
export const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  source: z.enum(['jira', 'outlook', 'asana', 'ses']),
  sourceProjectKey: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  autonomyLevel: z.enum(['monitoring', 'artefact', 'tactical']).optional(),
  config: z.record(z.unknown()).optional(),
});

/**
 * Schema for POST /api/graduation (the route.ts POST in graduation/)
 * Note: graduation/confirm already uses confirmGraduationSchema above.
 */
export const graduationRequestSchema = z.object({
  targetLevel: z.number().int().min(2).max(3),
});

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type GraduationRequestInput = z.infer<typeof graduationRequestSchema>;
