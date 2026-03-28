import type { ValidationResult } from '../providers/types.js';

export function validateWriteasContent(content: string): ValidationResult {
  const errors: string[] = [];

  if (!content || content.trim().length === 0) {
    return { valid: false, errors: ['Write.as article content is empty.'] };
  }

  // Write.as does not strictly require a title, but body must be non-empty after frontmatter strip
  const stripped = content.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
  if (stripped.length === 0) {
    errors.push('Write.as article body is empty after stripping frontmatter.');
  }

  return { valid: errors.length === 0, errors };
}
