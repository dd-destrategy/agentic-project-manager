import { z } from 'zod';

/**
 * Schema for creating an ingestion session
 */
export const createIngestionSessionSchema = z.object({
  title: z.string().min(1).max(200),
  projectId: z.string().optional(),
});

/**
 * Schema for a single attachment in a message
 */
const attachmentSchema = z.object({
  id: z.string(),
  mimeType: z.string().regex(/^image\/(png|jpeg|gif|webp)$/),
  dataUrl: z.string().min(1),
  filename: z.string().optional(),
});

/**
 * Schema for sending a message to an ingestion session
 */
export const sendIngestionMessageSchema = z.object({
  content: z.string().min(1).max(50000),
  attachments: z.array(attachmentSchema).max(5).optional(),
});

/**
 * Schema for updating an extracted item (inline editing)
 */
export const updateExtractedItemSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(10000).optional(),
  type: z
    .enum([
      'risk',
      'action_item',
      'decision',
      'blocker',
      'status_update',
      'dependency',
      'stakeholder_request',
    ])
    .optional(),
  targetArtefact: z
    .enum(['raid_log', 'delivery_state', 'backlog_summary', 'decision_log'])
    .optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  projectId: z.string().optional(),
});

export type CreateIngestionSessionInput = z.infer<
  typeof createIngestionSessionSchema
>;
export type SendIngestionMessageInput = z.infer<
  typeof sendIngestionMessageSchema
>;
export type UpdateExtractedItemInput = z.infer<
  typeof updateExtractedItemSchema
>;
