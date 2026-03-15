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
