import { z } from 'zod';

export const AssetSourceSchema = z.enum(['manual', 'ai']);

export const AssetSubdirSchema = z.enum(['images', 'videos', 'audio']);

export const AssetEntrySchema = z.object({
  filename: z.string().min(1),
  subdir: AssetSubdirSchema,
  mime: z.string().min(1),
  size_bytes: z.number().int().nonnegative(),
  source: AssetSourceSchema.default('manual'),
  created_at: z.string(),
  // Future AI generation fields
  generator: z.string().optional(),
  prompt: z.string().optional(),
  duration_sec: z.number().optional(),
});

export const AssetRegistrySchema = z.object({
  assets: z.array(AssetEntrySchema).default([]),
});

export type AssetEntry = z.infer<typeof AssetEntrySchema>;
export type AssetRegistry = z.infer<typeof AssetRegistrySchema>;
export type AssetSource = z.infer<typeof AssetSourceSchema>;
export type AssetSubdir = z.infer<typeof AssetSubdirSchema>;
