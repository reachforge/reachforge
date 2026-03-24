export type {
  PipelineStage,
  ProjectStatus,
  StageTransition,
  StageInfo,
  PipelineStatus,
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
  CredentialsSchema,
} from './schemas.js';
export type { CredentialsInput } from './schemas.js';

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
