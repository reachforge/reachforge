import type { ValidationResult } from '../providers/types.js';

export function validateDevtoContent(content: string): ValidationResult {
  const errors: string[] = [];

  if (!content || content.trim().length === 0) {
    return { valid: false, errors: ['Content is empty'] };
  }

  if (!content.match(/^#\s+.+/m) && !content.match(/^---[\s\S]*?title:/m)) {
    errors.push('Dev.to article must have a title (# heading or frontmatter title field)');
  }

  return { valid: errors.length === 0, errors };
}
