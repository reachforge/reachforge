import type { ValidationResult } from '../providers/types.js';
import { validateXContent } from './x.js';
import { validateDevtoContent } from './devto.js';
import { validateHashnodeContent } from './hashnode.js';
import { validateGitHubContent } from './github.js';
import { validateGhostContent } from './ghost.js';
import { validateWordPressContent } from './wordpress.js';
import { validateTelegraphContent } from './telegraph.js';
import { validateWriteasContent } from './writeas.js';
import { validateRedditContent } from './reddit.js';

type ValidatorFn = (content: string) => ValidationResult;

const VALIDATORS: Record<string, ValidatorFn> = {
  x: validateXContent,
  devto: validateDevtoContent,
  hashnode: validateHashnodeContent,
  github: validateGitHubContent,
  ghost: validateGhostContent,
  wordpress: validateWordPressContent,
  telegraph: validateTelegraphContent,
  writeas: validateWriteasContent,
  reddit: validateRedditContent,
};

export interface AggregateValidationResult {
  allValid: boolean;
  results: Record<string, ValidationResult>;
}

export function validateContent(
  contentByPlatform: Record<string, string>,
): AggregateValidationResult {
  const results: Record<string, ValidationResult> = {};
  let allValid = true;

  for (const [platform, content] of Object.entries(contentByPlatform)) {
    const validator = VALIDATORS[platform];
    if (validator) {
      results[platform] = validator(content);
      if (!results[platform].valid) allValid = false;
    } else {
      // No validator for this platform — pass by default
      results[platform] = { valid: true, errors: [] };
    }
  }

  return { allValid, results };
}
