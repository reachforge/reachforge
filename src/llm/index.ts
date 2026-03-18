// Legacy API-based exports (kept for backward compatibility)
export type { LLMProvider, GenerateOptions, AdaptOptions, LLMResult } from './types.js';
export { PLATFORM_PROMPTS, DEFAULT_DRAFT_PROMPT } from './types.js';
export { GeminiProvider } from './gemini.js';
export { LLMFactory } from './factory.js';

// CLI Adapter exports
export type {
  CLIAdapter,
  AdapterExecuteOptions,
  AdapterResult,
  AdapterProbeResult,
  AdapterErrorCode,
  TokenUsage,
} from './types.js';
export { AdapterFactory } from './factory.js';
export { ClaudeAdapter } from './adapters/claude.js';
export { GeminiAdapter } from './adapters/gemini.js';
export { CodexAdapter } from './adapters/codex.js';
export { runCLIProcess } from './process.js';
export type { ProcessOptions, ProcessResult } from './process.js';

// Skill resolution
export type { ResolvedSkill } from './types.js';
export { SkillResolver } from './skills.js';

// Session management
export type { SessionData } from './types.js';
export { SessionManager, SessionDataSchema } from './session.js';

// Parsers
export { parseClaudeStreamJson, detectClaudeAuthRequired, isClaudeUnknownSessionError } from './parsers/claude.js';
export { parseGeminiJsonl, detectGeminiAuthRequired, isGeminiUnknownSessionError } from './parsers/gemini.js';
export { parseCodexJsonl, isCodexUnknownSessionError } from './parsers/codex.js';
