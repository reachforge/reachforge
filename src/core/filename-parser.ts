import type { PipelineStage } from '../types/index.js';
import { ReachforgeError } from '../types/index.js';

// --- Constants ---

export const PLATFORM_IDS = [
  'x', 'devto', 'hashnode', 'wechat', 'zhihu',
  'github', 'linkedin', 'medium', 'reddit',
] as const;

export type PlatformId = typeof PLATFORM_IDS[number];

export const PLATFORM_ID_REGEX = /^[a-z0-9]+$/;

export const ADAPTED_STAGES: PipelineStage[] = ['02_adapted', '03_published'];

// --- Types ---

export interface ParsedFilename {
  article: string;
  platform: string | null;
}

// --- Functions ---

export function isAdaptedStage(stage: PipelineStage): boolean {
  return ADAPTED_STAGES.includes(stage);
}

export function parseArticleFilename(filename: string, stage: PipelineStage): ParsedFilename {
  if (!filename.endsWith('.md')) {
    throw new ReachforgeError(
      `Expected .md file: "${filename}"`,
      'Filename must end with .md',
    );
  }

  const stem = filename.slice(0, -3); // strip .md

  if (!isAdaptedStage(stage)) {
    return { article: stem, platform: null };
  }

  const lastDotIndex = stem.lastIndexOf('.');
  if (lastDotIndex === -1) {
    return { article: stem, platform: null };
  }

  const candidatePlatform = stem.slice(lastDotIndex + 1);
  if (
    PLATFORM_ID_REGEX.test(candidatePlatform) &&
    (PLATFORM_IDS as readonly string[]).includes(candidatePlatform)
  ) {
    return {
      article: stem.slice(0, lastDotIndex),
      platform: candidatePlatform,
    };
  }

  return { article: stem, platform: null };
}

export function buildArticleFilename(article: string, platform: string | null): string {
  if (!platform) {
    return `${article}.md`;
  }

  if (!PLATFORM_ID_REGEX.test(platform)) {
    throw new ReachforgeError(
      `Invalid platform ID: "${platform}"`,
      'Platform ID must be lowercase alphanumeric (e.g., "devto", "x")',
    );
  }

  return `${article}.${platform}.md`;
}

export function validateArticleName(name: string): void {
  if (name.length === 0) {
    throw new ReachforgeError(
      'Article name cannot be empty',
      'Provide a non-empty article name',
    );
  }

  if (name.length > 200) {
    throw new ReachforgeError(
      'Article name too long (max 200 chars)',
      `Name is ${name.length} characters`,
    );
  }

  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) {
    throw new ReachforgeError(
      'Article name must start with alphanumeric and contain only alphanumeric, dots, hyphens, underscores',
      `Invalid name: "${name}"`,
    );
  }

  if ((PLATFORM_IDS as readonly string[]).includes(name.toLowerCase())) {
    throw new ReachforgeError(
      `Article name "${name}" conflicts with platform ID`,
      `"${name.toLowerCase()}" is a reserved platform identifier`,
    );
  }
}
