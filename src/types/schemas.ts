import { z } from 'zod';

// --- Credentials ---

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

export type CredentialsInput = z.infer<typeof CredentialsSchema>;

// --- Multi-Article Schemas ---

export const PlatformPublishStatusSchema = z.object({
  status: z.enum(['pending', 'success', 'failed']),
  url: z.string().url().optional(),
  error: z.string().optional(),
  published_at: z.string().optional(),
});

export const ArticleMetaSchema = z.object({
  status: z.enum(['inbox', 'drafted', 'master', 'adapted', 'scheduled', 'published', 'failed']),
  platforms: z.record(z.string(), PlatformPublishStatusSchema).optional(),
  schedule: z.string().optional(),
  adapted_platforms: z.array(z.string()).optional(),
  template: z.string().optional(),
  notes: z.string().optional(),
  error: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const LockInfoSchema = z.object({
  pid: z.number(),
  started_at: z.string(),
  hostname: z.string(),
});

export const MultiArticleProjectMetaSchema = z.object({
  articles: z.record(z.string(), ArticleMetaSchema).default({}),
  _locks: z.record(z.string(), LockInfoSchema).optional(),
});

export type ArticleMeta = z.infer<typeof ArticleMetaSchema>;
export type MultiArticleProjectMeta = z.infer<typeof MultiArticleProjectMetaSchema>;
export type PlatformPublishStatus = z.infer<typeof PlatformPublishStatusSchema>;
