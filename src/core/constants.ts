import type { PipelineStage, ProjectStatus } from '../types/index.js';

export const STAGES: PipelineStage[] = [
  '01_drafts',
  '02_adapted',
  '03_published',
];

export const STAGE_STATUS_MAP: Record<PipelineStage, ProjectStatus> = {
  '01_drafts': 'drafted',
  '02_adapted': 'adapted',
  '03_published': 'published',
};

export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export const DEFAULT_LLM_MODEL = 'gemini-pro';
export const DEFAULT_WATCH_INTERVAL_MINUTES = 60;
export const MIN_WATCH_INTERVAL_MINUTES = 1;
export const DEFAULT_MCP_PORT = 8000;
export const DEFAULT_MCP_TRANSPORT = 'stdio' as const;

export const META_FILENAME = 'meta.yaml';

export const ASSETS_DIR = 'assets';
export const ASSET_SUBDIRS = ['images', 'videos', 'audio'] as const;
export const ASSET_REGISTRY_FILENAME = '.asset-registry.yaml';
export const ASSET_PREFIX = '@assets/';

export const TEMPLATES_DIR = 'templates';

export const LANGUAGE_NAMES: Record<string, string> = {
  'en': 'English',
  'zh-CN': 'Chinese (Simplified)',
  'zh-TW': 'Chinese (Traditional)',
  'ja': 'Japanese',
  'ko': 'Korean',
  'fr': 'French',
  'de': 'German',
  'es': 'Spanish',
  'pt': 'Portuguese',
  'ru': 'Russian',
  'ar': 'Arabic',
};

export const WATCH_DIR = 'watch';
export const WATCH_PID_EXTENSION = '.pid.json';

export const WORKSPACE_CONFIG_DIR = '.reach';
export const WORKSPACE_CONFIG_FILE = 'config.yaml';
export const PROJECT_CONFIG_FILE = 'project.yaml';
export const DEFAULT_WORKSPACE_NAME = 'reach-workspace';
