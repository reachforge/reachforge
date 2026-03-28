import { z } from 'zod';

export const SERIES_STATUSES = [
  'planned',
  'outlined',
  'outline_approved',
  'detailed',
  'detail_approved',
  'drafting',
  'completed',
] as const;

export type SeriesStatus = typeof SERIES_STATUSES[number];

export const SeriesArticleSchema = z.object({
  slug: z.string().min(1),
  title: z.string().default(''),
  synopsis: z.string().default(''),
  outline: z.string().optional(),
  order: z.number().int().positive(),
  depends_on: z.array(z.string()).optional(),
});

export const SeriesScheduleSchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  interval: z.string().default('7d'),
});

export const SeriesSchema = z.object({
  name: z.string().min(1),
  title: z.string().default(''),
  description: z.string().default(''),
  audience: z.string().default(''),
  tone: z.string().default('professional'),
  language: z.string().default('en'),
  status: z.enum(SERIES_STATUSES).default('planned'),
  outline: z.string().optional(),
  outline_approved_at: z.string().optional(),
  detail_approved_at: z.string().optional(),
  articles: z.array(SeriesArticleSchema).default([]),
  schedule: SeriesScheduleSchema.optional(),
  platforms: z.array(z.string()).optional(),
});

export type Series = z.infer<typeof SeriesSchema>;
export type SeriesArticle = z.infer<typeof SeriesArticleSchema>;
export type SeriesSchedule = z.infer<typeof SeriesScheduleSchema>;
