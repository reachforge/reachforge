import type { ValidationResult } from '../providers/types.js';

export function validateTelegraphContent(content: string): ValidationResult {
  const errors: string[] = [];

  if (!content || content.trim().length === 0) {
    return { valid: false, errors: ['Telegraph article content is empty.'] };
  }

  // Extract title from frontmatter or H1
  let title: string | undefined;
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const titleMatch = fmMatch[1].match(/title:\s*(.+)/);
    title = titleMatch?.[1]?.trim();
  }
  if (!title) {
    const h1Match = content.match(/^#\s+(.+)$/m);
    title = h1Match?.[1]?.trim();
  }

  if (!title) {
    errors.push('Telegraph article missing title (no frontmatter title or H1 heading found).');
  } else if (title.length > 256) {
    errors.push(`Telegraph title exceeds 256 character limit (found: ${title.length}).`);
  }

  return { valid: errors.length === 0, errors };
}
