export interface LLMProvider {
  readonly name: string;
  generate(content: string, options: GenerateOptions): Promise<LLMResult>;
  adapt(content: string, options: AdaptOptions): Promise<LLMResult>;
}

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  template?: string;
  templateVars?: Record<string, string>;
}

export interface AdaptOptions {
  platform: string;
  temperature?: number;
  maxTokens?: number;
  template?: string;
  templateVars?: Record<string, string>;
}

export interface LLMResult {
  content: string;
  model: string;
  provider: string;
  tokenUsage: {
    prompt: number;
    completion: number;
  };
}

export const PLATFORM_PROMPTS: Record<string, string> = {
  x: 'Rewrite this into a high-engagement Twitter/X thread. Separate each tweet with --- on its own line. Each tweet must be under 280 characters.',
  wechat: 'Rewrite this into a formal, structured WeChat article with clear sections and professional tone.',
  zhihu: 'Rewrite this into a deep-dive, professional Zhihu answer with analysis and personal insights.',
  devto: 'Rewrite this into a well-structured Dev.to article with code examples, headings, and a clear introduction.',
  hashnode: 'Rewrite this into an engaging Hashnode blog post with SEO-friendly headings and takeaways.',
};

export const DEFAULT_DRAFT_PROMPT = 'You are an expert content strategist. Expand the following idea into a comprehensive, high-quality long-form article. Output in Markdown format.';

// --- CLI Adapter types ---

export interface CLIAdapter {
  readonly name: "claude" | "gemini" | "codex";
  readonly command: string;
  execute(options: AdapterExecuteOptions): Promise<AdapterResult>;
  probe(): Promise<AdapterProbeResult>;
}

export interface AdapterExecuteOptions {
  prompt: string;
  cwd: string;
  skillPaths: string[];
  sessionId: string | null;
  timeoutSec: number;
  extraArgs: string[];
}

export interface AdapterResult {
  success: boolean;
  content: string;
  sessionId: string | null;
  usage: TokenUsage;
  costUsd: number | null;
  model: string;
  errorMessage: string | null;
  errorCode: AdapterErrorCode | null;
  exitCode: number | null;
  timedOut: boolean;
}

export type AdapterErrorCode =
  | "auth_required"
  | "command_not_found"
  | "timeout"
  | "parse_error"
  | "session_expired"
  | "unknown";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
}

export interface AdapterProbeResult {
  available: boolean;
  authenticated: boolean;
  version: string | null;
  errorMessage: string | null;
}

// --- Skill types ---

export interface ResolvedSkill {
  /** Relative skill path (e.g., "stages/draft.md", "platforms/x.md"). */
  name: string;
  /** Absolute path to the resolved skill file. */
  path: string;
  /** Which layer provided this skill. */
  source: 'built-in' | 'workspace' | 'project';
}

// --- Session types ---

export interface SessionData {
  sessionId: string;
  adapter: 'claude' | 'gemini' | 'codex';
  stage: string;
  cwd: string;
  createdAt: string;
  lastUsedAt: string;
}
