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

/**
 * Validate a schedule datetime string. Accepts:
 *   YYYY-MM-DD           → date only (time defaults to 00:00:00)
 *   YYYY-MM-DDTHH:MM     → date + hour:minute (seconds default to 00)
 *   YYYY-MM-DDTHH:MM:SS  → full datetime
 */
export function validateScheduleDate(input: string): boolean {
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return validateDate(input);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)) {
    const parsed = new Date(input + ':00Z');
    return !isNaN(parsed.getTime());
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(input)) {
    const parsed = new Date(input + 'Z');
    return !isNaN(parsed.getTime());
  }
  return false;
}

/**
 * Normalize a schedule date input to ISO 8601 format stored in meta.yaml.
 * Schedule is metadata-only (no filesystem directory), so colons are safe.
 *   YYYY-MM-DD          → YYYY-MM-DDT00:00:00
 *   YYYY-MM-DDTHH:MM    → YYYY-MM-DDTHH:MM:00
 *   YYYY-MM-DDTHH:MM:SS → YYYY-MM-DDTHH:MM:SS
 * Legacy hyphenated format (T00-00-00) is converted to colons for consistency.
 */
export function normalizeScheduleDate(input: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return `${input}T00:00:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)) return `${input}:00`;
  // Convert legacy hyphenated time format to colons
  if (/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/.test(input)) {
    const [datePart, timePart] = input.split('T');
    const [h, m, s] = timePart.split('-');
    return `${datePart}T${h}:${m}:${s}`;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}$/.test(input)) {
    const [datePart, timePart] = input.split('T');
    const [h, m] = timePart.split('-');
    return `${datePart}T${h}:${m}:00`;
  }
  return input;
}
