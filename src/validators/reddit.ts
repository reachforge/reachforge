import type { ValidationResult } from '../providers/types.js';

export function validateRedditContent(content: string): ValidationResult {
  const errors: string[] = [];

  if (!content || content.trim().length === 0) {
    return { valid: false, errors: ['Reddit post content is empty.'] };
  }

  // Extract title
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
    errors.push('Reddit post missing title (no frontmatter title or H1 heading found).');
  } else if (title.length > 300) {
    errors.push(`Reddit post title exceeds 300 character limit (found: ${title.length}).`);
  }

  // Check body is non-empty after stripping frontmatter + H1
  const stripped = content
    .replace(/^---\n[\s\S]*?\n---\n?/, '')
    .replace(/^\s*#\s+.+\n?/, '')
    .trim();
  if (stripped.length === 0) {
    errors.push('Reddit post body is empty after stripping title.');
  }

  return { valid: errors.length === 0, errors };
}
