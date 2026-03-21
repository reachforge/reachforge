import type { PipelineStage, ProjectStatus } from '../types/index.js';

export const STAGES: PipelineStage[] = [
  '01_inbox',
  '02_drafts',
  '03_master',
  '04_adapted',
  '05_scheduled',
  '06_sent',
];

export const STAGE_STATUS_MAP: Record<PipelineStage, ProjectStatus> = {
  '01_inbox': 'inbox',
  '02_drafts': 'drafted',
  '03_master': 'master',
  '04_adapted': 'adapted',
  '05_scheduled': 'scheduled',
  '06_sent': 'published',
};

export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export const SCHEDULED_DIR_REGEX = /^(\d{4}-\d{2}-\d{2})-(.+)$/;

export const DEFAULT_LLM_MODEL = 'gemini-pro';
export const DEFAULT_WATCH_INTERVAL_MINUTES = 60;
export const MIN_WATCH_INTERVAL_MINUTES = 1;
export const DEFAULT_MCP_PORT = 8000;
export const DEFAULT_MCP_TRANSPORT = 'stdio' as const;

export const META_FILENAME = 'meta.yaml';
export const RECEIPT_FILENAME = 'receipt.yaml';
export const LOCK_FILENAME = '.publish.lock';
export const MASTER_FILENAME = 'master.md';
export const DRAFT_FILENAME = 'draft.md';
export const PLATFORM_VERSIONS_DIR = 'platform_versions';
export const UPLOAD_CACHE_FILENAME = '.upload_cache.yaml';

export const ASSETS_DIR = 'assets';
export const ASSET_SUBDIRS = ['images', 'videos', 'audio'] as const;
export const ASSET_REGISTRY_FILENAME = '.asset-registry.yaml';
export const ASSET_PREFIX = '@assets/';

export const TEMPLATES_DIR = 'templates';

export const WATCH_DIR = 'watch';
export const WATCH_PID_EXTENSION = '.pid.json';

export const WORKSPACE_CONFIG_DIR = '.reach';
export const WORKSPACE_CONFIG_FILE = 'config.yaml';
export const PROJECT_CONFIG_FILE = 'project.yaml';
export const DEFAULT_WORKSPACE_NAME = 'reach-workspace';
