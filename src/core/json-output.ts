/**
 * JSON output helpers for the --json CLI flag.
 * All --json responses follow the CliJsonEnvelope format.
 */

export interface CliJsonEnvelope<T = unknown> {
  jsonVersion: 1;
  command: string;
  success: boolean;
  data: T;
  error?: {
    message: string;
    code: string;
    hint?: string;
  };
}

export function jsonSuccess<T>(command: string, data: T): string {
  const envelope: CliJsonEnvelope<T> = {
    jsonVersion: 1,
    command,
    success: true,
    data,
  };
  return JSON.stringify(envelope);
}

export function jsonError(command: string, error: { message: string; code: string; hint?: string }): string {
  const envelope: CliJsonEnvelope<null> = {
    jsonVersion: 1,
    command,
    success: false,
    data: null,
    error,
  };
  return JSON.stringify(envelope);
}

/**
 * Map error class names to error codes for JSON output.
 */
export function errorToCode(err: Error): string {
  const nameMap: Record<string, string> = {
    ProjectNotFoundError: 'PROJECT_NOT_FOUND',
    InvalidDateError: 'INVALID_DATE',
    LLMError: 'LLM_ERROR',
    LLMNotConfiguredError: 'LLM_ERROR',
    AdapterNotFoundError: 'LLM_ERROR',
    AdapterNotInstalledError: 'LLM_ERROR',
    AdapterAuthError: 'LLM_ERROR',
    AdapterTimeoutError: 'LLM_ERROR',
    AdapterEmptyResponseError: 'LLM_ERROR',
    ProviderError: 'PROVIDER_ERROR',
    ValidationFailedError: 'VALIDATION_ERROR',
    PathTraversalError: 'INVALID_INPUT',
    MetadataParseError: 'CONFIG_ERROR',
  };
  return nameMap[err.constructor.name] ?? 'UNKNOWN_ERROR';
}

/**
 * Extract hint from ReachforgeError if available.
 */
export function errorToHint(err: Error): string | undefined {
  if ('hint' in err && typeof (err as any).hint === 'string') {
    return (err as any).hint;
  }
  return undefined;
}
