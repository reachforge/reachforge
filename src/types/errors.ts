export class AphypeError extends Error {
  constructor(message: string, public readonly cause?: string, public readonly hint?: string) {
    super(hint ? `${message} ${hint}` : message);
    this.name = 'AphypeError';
  }
}

export class ProjectNotFoundError extends AphypeError {
  constructor(project: string, stage: string, hint?: string) {
    super(
      `Project "${project}" not found in ${stage}.`,
      `Project directory does not exist at ${stage}/${project}`,
      hint,
    );
    this.name = 'ProjectNotFoundError';
  }
}

export class InvalidDateError extends AphypeError {
  constructor(date: string) {
    super(
      `Invalid date format: "${date}".`,
      'Date does not match expected pattern',
      'Use YYYY-MM-DD format (e.g., 2026-03-20).',
    );
    this.name = 'InvalidDateError';
  }
}

export class PathTraversalError extends AphypeError {
  constructor(input: string) {
    super(
      `Unsafe path component rejected: "${input}".`,
      'Path contains traversal sequences or absolute path components',
      'Use a simple name without "..", "/", or special characters.',
    );
    this.name = 'PathTraversalError';
  }
}

export class LLMError extends AphypeError {
  constructor(message: string, hint?: string) {
    super(message, 'LLM API call failed', hint);
    this.name = 'LLMError';
  }
}

export class LLMNotConfiguredError extends AphypeError {
  constructor(provider: string = 'Gemini') {
    super(
      `${provider} API key is not set.`,
      'No API key found in environment or credentials',
      `Set it in your .env file (e.g., GEMINI_API_KEY=your-key) or export it as an environment variable.`,
    );
    this.name = 'LLMNotConfiguredError';
  }
}

export class ProviderError extends AphypeError {
  constructor(provider: string, message: string, hint?: string) {
    super(`[${provider}] ${message}`, `Provider "${provider}" failed`, hint);
    this.name = 'ProviderError';
  }
}

export class ValidationFailedError extends AphypeError {
  constructor(platform: string, errors: string[]) {
    super(
      `Content validation failed for ${platform}: ${errors.join('; ')}`,
      'Content does not meet platform requirements',
      'Fix the issues and try again.',
    );
    this.name = 'ValidationFailedError';
  }
}

export class MetadataParseError extends AphypeError {
  constructor(filePath: string, details: string) {
    super(
      `Failed to parse metadata at ${filePath}: ${details}`,
      'YAML content does not match expected schema',
      'Check the file for syntax errors or missing required fields.',
    );
    this.name = 'MetadataParseError';
  }
}

// --- CLI Adapter errors ---

export class AdapterNotFoundError extends AphypeError {
  constructor(name: string) {
    super(
      `Unknown LLM adapter: '${name}'. Supported: claude, gemini, codex`,
      'Adapter name is not recognized',
      'Set APHYPE_LLM_ADAPTER to one of: claude, gemini, codex',
    );
    this.name = 'AdapterNotFoundError';
  }
}

export class AdapterNotInstalledError extends AphypeError {
  constructor(name: string, installUrl: string) {
    super(
      `${name} CLI is not installed or not in PATH.`,
      `Command '${name}' could not be found`,
      `Install from ${installUrl}`,
    );
    this.name = 'AdapterNotInstalledError';
  }
}

export class AdapterAuthError extends AphypeError {
  constructor(name: string, command: string) {
    super(
      `${name} requires authentication.`,
      'CLI reported authentication failure',
      `Run '${command} login' first.`,
    );
    this.name = 'AdapterAuthError';
  }
}

export class AdapterTimeoutError extends AphypeError {
  constructor(timeoutSec: number) {
    super(
      `LLM generation timed out after ${timeoutSec}s.`,
      'CLI process exceeded timeout',
      'Increase with APHYPE_LLM_TIMEOUT environment variable.',
    );
    this.name = 'AdapterTimeoutError';
  }
}

export class AdapterEmptyResponseError extends AphypeError {
  constructor(name: string) {
    super(
      `${name} returned an empty response.`,
      'CLI completed but produced no content',
      'Try again or check your input.',
    );
    this.name = 'AdapterEmptyResponseError';
  }
}

export class AdapterValidationError extends AphypeError {
  constructor(message: string) {
    super(message, 'Input validation failed');
    this.name = 'AdapterValidationError';
  }
}

export class SessionValidationError extends AphypeError {
  constructor(message: string) {
    super(message, 'Session validation failed');
    this.name = 'SessionValidationError';
  }
}
