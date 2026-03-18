import type { ValidationResult } from '../providers/types.js';

export function validateHashnodeContent(content: string): ValidationResult {
  const errors: string[] = [];

  if (!content || content.trim().length === 0) {
    return { valid: false, errors: ['Hashnode article content is empty.'] };
  }

  const h1Match = content.match(/^#\s+(.+)$/m);
  const fmMatch = content.match(/^---\n[\s\S]*?title:\s*(.+?)\s*(?:\n|$)/m);
  const title = h1Match?.[1]?.trim() ?? fmMatch?.[1]?.trim() ?? null;

  if (!title) {
    errors.push('Hashnode article missing title (no H1 heading or frontmatter title found).');
  } else if (title.length > 250) {
    errors.push(`Hashnode article title exceeds 250 character limit (found: ${title.length}).`);
  }

  return { valid: errors.length === 0, errors };
}
