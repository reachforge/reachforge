import type { ValidationResult } from '../providers/types.js';

const THREAD_DELIMITER = /^---$/m;
const MAX_CHARS = 280;

export function validateXContent(content: string): ValidationResult {
  const errors: string[] = [];

  if (!content || content.trim().length === 0) {
    return { valid: false, errors: ['Content is empty'] };
  }

  const segments = content.split(THREAD_DELIMITER).map(s => s.trim()).filter(Boolean);

  for (let i = 0; i < segments.length; i++) {
    if (segments[i].length > MAX_CHARS) {
      errors.push(
        `X post segment ${i + 1} exceeds ${MAX_CHARS} character limit (found: ${segments[i].length})`
      );
    }
  }

  return { valid: errors.length === 0, errors };
}
