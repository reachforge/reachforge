import type { ValidationResult } from '../providers/types.js';

export function validateGitHubContent(content: string): ValidationResult {
  const errors: string[] = [];

  if (!content || content.trim().length === 0) {
    return { valid: false, errors: ['GitHub discussion content is empty.'] };
  }

  const h1Match = content.match(/^#\s+(.+)$/m);
  if (!h1Match) {
    errors.push('GitHub discussion missing title (no H1 heading found).');
  } else {
    const title = h1Match[1].trim();
    if (title.length > 256) {
      errors.push(`GitHub discussion title exceeds 256 character limit (found: ${title.length}).`);
    }
  }

  return { valid: errors.length === 0, errors };
}
