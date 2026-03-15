export type {
  PipelineStage,
  ProjectStatus,
  PlatformStatus,
  ProjectMeta,
  StageTransition,
  StageInfo,
  PipelineStatus,
  ReceiptEntry,
  Receipt,
  PublishOptions,
  PublishResult,
  LLMGenerateOptions,
  LLMAdaptOptions,
  AphypeConfig,
} from './pipeline.js';

// PlatformProvider and ValidationResult are canonical in providers/types.ts
export type {
  PlatformProvider,
  ValidationResult,
  PublishMeta,
  PluginManifest,
} from '../providers/types.js';

export {
  ProjectMetaSchema,
  ReceiptSchema,
  CredentialsSchema,
  UploadCacheSchema,
  PlatformStatusSchema,
  ReceiptEntrySchema,
  UploadRecordSchema,
} from './schemas.js';
export type { ProjectMetaInput, ReceiptInput, CredentialsInput } from './schemas.js';

export {
  AphypeError,
  ProjectNotFoundError,
  InvalidDateError,
  PathTraversalError,
  LLMError,
  LLMNotConfiguredError,
  ProviderError,
  ValidationFailedError,
  MetadataParseError,
} from './errors.js';
