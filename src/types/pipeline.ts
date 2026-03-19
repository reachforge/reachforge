export type PipelineStage =
  | '01_inbox' | '02_drafts' | '03_master'
  | '04_adapted' | '05_scheduled' | '06_sent';

export type ProjectStatus =
  | 'inbox' | 'drafted' | 'master' | 'adapted' | 'scheduled' | 'published' | 'failed';

export interface PlatformStatus {
  status: 'pending' | 'success' | 'failed';
  url?: string;
  error?: string;
  published_at?: string;
}

export interface ProjectMeta {
  article: string;
  status: ProjectStatus;
  publish_date?: string;
  adapted_platforms?: string[];
  platforms?: Record<string, PlatformStatus>;
  notes?: string;
  template?: string;
  error?: string;
  created_at?: string;
  updated_at?: string;
}

export interface StageTransition {
  from: PipelineStage;
  to: PipelineStage;
  project: string;
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

export interface ReceiptEntry {
  platform: string;
  status: 'pending' | 'sending' | 'success' | 'failed';
  url?: string;
  error?: string;
}

export interface Receipt {
  status: 'publishing' | 'completed' | 'partial';
  published_at: string;
  items: ReceiptEntry[];
}

export interface LockInfo {
  pid: number;
  started_at: string;
  hostname: string;
}

export interface PublishOptions {
  dryRun?: boolean;
  retry?: boolean;
  platforms?: string[];
}

export interface PublishResult {
  platform: string;
  status: 'success' | 'failed';
  url?: string;
  error?: string;
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
