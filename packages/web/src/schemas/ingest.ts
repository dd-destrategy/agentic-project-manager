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

export type CreateIngestionSessionInput = z.infer<
  typeof createIngestionSessionSchema
>;
export type SendIngestionMessageInput = z.infer<
  typeof sendIngestionMessageSchema
>;
