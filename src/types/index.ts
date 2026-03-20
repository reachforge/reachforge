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
  LockInfo,
  PublishOptions,
  PublishResult,
  LLMGenerateOptions,
  LLMAdaptOptions,
  ReachforgeConfig,
} from './pipeline.js';

// PlatformProvider and ValidationResult are canonical in providers/types.ts
export type {
  ContentFormat,
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

export type { AssetEntry, AssetRegistry, AssetSource, AssetSubdir } from './assets.js';
export { AssetEntrySchema, AssetRegistrySchema, AssetSourceSchema, AssetSubdirSchema } from './assets.js';

export {
  ReachforgeError,
  ProjectNotFoundError,
  InvalidDateError,
  PathTraversalError,
  LLMError,
  LLMNotConfiguredError,
  ProviderError,
  ValidationFailedError,
  MetadataParseError,
  AdapterNotFoundError,
  AdapterNotInstalledError,
  AdapterAuthError,
  AdapterTimeoutError,
  AdapterEmptyResponseError,
  AdapterValidationError,
  SessionValidationError,
} from './errors.js';
