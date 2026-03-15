import { PathTraversalError } from '../types/index.js';
import * as path from 'path';

/**
 * Sanitize a user-supplied path component to prevent path traversal attacks.
 * Rejects inputs containing '..', absolute paths, null bytes, or path separators.
 * Returns the sanitized basename.
 */
export function sanitizePath(input: string): string {
  if (!input || input.trim().length === 0) {
    throw new PathTraversalError(input || '(empty)');
  }

  // Reject null bytes
  if (input.includes('\0')) {
    throw new PathTraversalError(input);
  }

  // Reject path traversal sequences
  if (input.includes('..')) {
    throw new PathTraversalError(input);
  }

  // Reject absolute paths
  if (path.isAbsolute(input)) {
    throw new PathTraversalError(input);
  }

  // Reject path separators (both / and \)
  if (input.includes('/') || input.includes('\\')) {
    throw new PathTraversalError(input);
  }

  // Reject hidden files (starting with .)
  if (input.startsWith('.')) {
    throw new PathTraversalError(input);
  }

  const sanitized = path.basename(input);

  // Final check: basename should equal input (no directory components were stripped)
  if (sanitized !== input) {
    throw new PathTraversalError(input);
  }

  return sanitized;
}

/**
 * Validate a date string is in YYYY-MM-DD format and represents a real date.
 */
export function validateDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }
  const parsed = new Date(date + 'T00:00:00Z');
  return !isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date);
}
