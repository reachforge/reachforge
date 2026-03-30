import type { PipelineStage } from '../types/index.js';
import { ReachforgeError } from '../types/index.js';

// --- Constants ---

export const PLATFORM_IDS = [
  'x', 'devto', 'hashnode', 'wechat', 'zhihu',
  'github', 'linkedin', 'medium', 'reddit',
  'ghost', 'wordpress', 'telegraph', 'writeas',
] as const;

export type PlatformId = typeof PLATFORM_IDS[number];

/** Matches a single platform key: lowercase alpha/digits, with optional _suffix for named accounts. */
export const PLATFORM_ID_REGEX = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

export const ADAPTED_STAGES: PipelineStage[] = ['02_adapted', '03_published'];

// --- Types ---

export interface ParsedFilename {
  article: string;
  platform: string | null;
}

// --- Functions ---

/**
 * Extract the base platform from a (possibly named) platform key.
 *   'x'           → 'x'
 *   'x_company'   → 'x'
 *   'linkedin'    → 'linkedin'
 *   'x_my_brand'  → 'x'   (first segment before any underscore)
 */
export function basePlatform(platformKey: string): string {
  const idx = platformKey.indexOf('_');
  return idx === -1 ? platformKey : platformKey.slice(0, idx);
}

/**
 * Returns true if the candidate string is a valid platform key:
 *   - A known static platform ID (e.g. 'x', 'linkedin')
 *   - OR a named slot where the prefix is a known platform (e.g. 'x_company', 'linkedin_brand')
 */
export function isValidPlatformKey(candidate: string): boolean {
  if (!PLATFORM_ID_REGEX.test(candidate)) return false;
  if ((PLATFORM_IDS as readonly string[]).includes(candidate)) return true;
  const base = basePlatform(candidate);
  return (PLATFORM_IDS as readonly string[]).includes(base);
}

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
  if (isValidPlatformKey(candidatePlatform)) {
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
      'Platform ID must be lowercase alphanumeric with optional _suffix (e.g., "devto", "x_company")',
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
