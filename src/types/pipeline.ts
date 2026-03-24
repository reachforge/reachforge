export type PipelineStage =
  | '01_inbox' | '02_drafts' | '03_master'
  | '04_adapted' | '05_scheduled' | '06_sent';

export type ProjectStatus =
  | 'inbox' | 'drafted' | 'master' | 'adapted' | 'scheduled' | 'published' | 'failed';

export interface StageTransition {
  from: PipelineStage;
  to: PipelineStage;
  project: string;
  article?: string;
  timestamp: string;
}

export interface StageInfo {
  count: number;
  items: string[];
}

export interface PipelineStatus {
  stages: Record<PipelineStage, StageInfo>;
  totalProjects: number;
  dueToday: string[];
}

export interface LLMGenerateOptions {
  model?: string;
  template?: string;
  templateVars?: Record<string, string>;
}

export interface LLMAdaptOptions extends LLMGenerateOptions {
  platform: string;
}

// PlatformProvider, ValidationResult, and PublishResult are defined in providers/types.ts
// Re-exported from providers/index.ts — do not duplicate here.

export interface ReachforgeConfig {
  geminiApiKey?: string;
  devtoApiKey?: string;
  postizApiKey?: string;
  hashnodeApiKey?: string;
  hashnodePublicationId?: string;
  githubToken?: string;
  githubOwner?: string;
  githubRepo?: string;
  githubDiscussionCategory?: string;
  llmModel?: string;
  mcpAuthKey?: string;
}
