import type { ValidationResult } from '../providers/types.js';

export function validateWordPressContent(content: string): ValidationResult {
  const errors: string[] = [];

  if (!content || content.trim().length === 0) {
    return { valid: false, errors: ['WordPress article content is empty.'] };
  }

  const hasFm = content.match(/^---\n([\s\S]*?)\n---/);
  const hasH1 = content.match(/^#\s+(.+)$/m);

  if (!hasFm && !hasH1) {
    errors.push('WordPress article missing title (no frontmatter block or H1 heading found).');
  } else if (hasFm && !content.match(/^---[\s\S]*?title:/m)) {
    errors.push('WordPress article missing required frontmatter field: title.');
  }

  return { valid: errors.length === 0, errors };
}
