export type PipelineStage =
  | '01_drafts' | '02_adapted' | '03_published';

export type ProjectStatus =
  | 'drafted' | 'adapted' | 'scheduled' | 'published' | 'failed';

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
  ghostUrl?: string;
  ghostAdminApiKey?: string;
  wordpressUrl?: string;
  wordpressUsername?: string;
  wordpressAppPassword?: string;
  telegraphAccessToken?: string;
  writeasAccessToken?: string;
  writeasUrl?: string;
  redditClientId?: string;
  redditClientSecret?: string;
  redditUsername?: string;
  redditPassword?: string;
  redditSubreddit?: string;
  llmModel?: string;
  llmAdapter?: string;
  draftAdapter?: string;
  adaptAdapter?: string;
  llmTimeout?: number;
  claudeCommand?: string;
  geminiCommand?: string;
  codexCommand?: string;
  mcpAuthKey?: string;
}
