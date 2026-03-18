import type { ValidationResult } from '../providers/types.js';

const MAX_CHARS = 280;

function parseThreadSegments(content: string): string[] {
  // Try --- delimiter first
  const dashSegments = content.split(/\n---\n/).map(s => s.trim()).filter(Boolean);
  if (dashSegments.length > 1) return dashSegments;

  // Try numbered markers (1/, 2/, etc.)
  const numberedSegments = content.split(/\n\d+\/\s*/).map(s => s.trim()).filter(Boolean);
  if (numberedSegments.length > 1) return numberedSegments;

  // Single segment
  return content.trim() ? [content.trim()] : [];
}

export function validateXContent(content: string): ValidationResult {
  const errors: string[] = [];

  if (!content || content.trim().length === 0) {
    return { valid: false, errors: ['X content is empty -- no thread segments found.'] };
  }

  const segments = parseThreadSegments(content);

  if (segments.length === 0) {
    return { valid: false, errors: ['X content is empty -- no thread segments found.'] };
  }

  for (let i = 0; i < segments.length; i++) {
    if (segments[i].length > MAX_CHARS) {
      errors.push(
        `X post segment ${i + 1} exceeds ${MAX_CHARS} character limit (found: ${segments[i].length})`
      );
    }
  }

  return { valid: errors.length === 0, errors };
}
