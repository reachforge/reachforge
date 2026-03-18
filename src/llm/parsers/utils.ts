export const MAX_CAPTURE_BYTES = 4_194_304; // 4 MB

/**
 * Safely parse a single line as JSON.
 * Returns the parsed object or null if parsing fails or input is empty.
 */
export function parseJsonLine(line: string): Record<string, unknown> | null {
  if (!line.trim()) return null;
  try {
    const parsed = JSON.parse(line);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Append content to a buffer, capping at maxBytes.
 * Returns the new buffer content (truncated if necessary).
 */
export function appendWithCap(
  buffer: string,
  chunk: string,
  maxBytes: number = MAX_CAPTURE_BYTES,
): string {
  const bufferBytes = Buffer.byteLength(buffer);
  const chunkBytes = Buffer.byteLength(chunk);

  if (bufferBytes + chunkBytes <= maxBytes) {
    return buffer + chunk;
  }

  const remaining = maxBytes - bufferBytes;
  if (remaining <= 0) return buffer;

  // Truncate chunk to fit within remaining bytes
  const truncated = Buffer.from(chunk).subarray(0, remaining).toString();
  return buffer + truncated;
}

/**
 * Recursively extract all "error" and "message" field values from a nested object.
 * Returns them joined with newline.
 */
export function extractAllErrorText(obj: unknown): string {
  const collected: string[] = [];
  recurse(obj, collected);
  return collected.join('\n');
}

function recurse(obj: unknown, collected: string[]): void {
  if (obj === null || obj === undefined) return;
  if (typeof obj === 'string') return;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      recurse(item, collected);
    }
    return;
  }
  if (typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if ((key === 'error' || key === 'message') && typeof value === 'string') {
        collected.push(value);
      } else if (typeof value === 'object' || Array.isArray(value)) {
        recurse(value, collected);
      }
    }
  }
}
