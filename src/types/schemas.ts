import { z } from 'zod';

export const PlatformStatusSchema = z.object({
  status: z.enum(['pending', 'success', 'failed']),
  url: z.string().url().optional(),
  error: z.string().optional(),
  published_at: z.string().optional(),
});

export const ProjectMetaSchema = z.object({
  article: z.string().min(1),
  status: z.enum(['inbox', 'drafted', 'master', 'adapted', 'scheduled', 'published', 'failed']),
  publish_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format').optional(),
  adapted_platforms: z.array(z.string()).optional(),
  platforms: z.record(z.string(), PlatformStatusSchema).optional(),
  notes: z.string().optional(),
  template: z.string().optional(),
  error: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const ReceiptEntrySchema = z.object({
  platform: z.string().min(1),
  status: z.enum(['success', 'failed']),
  url: z.string().url().optional(),
  error: z.string().optional(),
});

export const ReceiptSchema = z.object({
  published_at: z.string(),
  items: z.array(ReceiptEntrySchema),
});

export const CredentialsSchema = z.object({
  gemini_api_key: z.string().min(1).optional(),
  devto_api_key: z.string().min(1).optional(),
  postiz_api_key: z.string().min(1).optional(),
  hashnode_api_key: z.string().min(1).optional(),
  hashnode_publication_id: z.string().min(1).optional(),
  github_token: z.string().min(1).optional(),
  github_owner: z.string().min(1).optional(),
  github_repo: z.string().min(1).optional(),
  github_discussion_category: z.string().min(1).optional(),
});

export const UploadRecordSchema = z.object({
  localPath: z.string(),
  remotePath: z.string().url(),
  uploadedAt: z.string(),
  platform: z.string(),
});

export const UploadCacheSchema = z.object({
  uploads: z.record(z.string(), UploadRecordSchema),
});

export type ProjectMetaInput = z.infer<typeof ProjectMetaSchema>;
export type ReceiptInput = z.infer<typeof ReceiptSchema>;
export type CredentialsInput = z.infer<typeof CredentialsSchema>;
