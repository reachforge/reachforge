export type ContentFormat = 'markdown' | 'html' | 'plaintext';

export interface PlatformProvider {
  readonly id: string;
  readonly name: string;
  readonly platforms: string[];
  readonly contentFormat: ContentFormat;
  /** Default target language for this platform. 'auto' = use source language. */
  readonly language: string;

  validate(content: string): ValidationResult;
  publish(content: string, meta: PublishMeta): Promise<PublishResult>;
  formatContent(content: string): string;
}

export interface PublishMeta {
  title?: string;
  tags?: string[];
  canonical?: string;
  draft?: boolean;
  coverImage?: string;
}

export interface PublishResult {
  platform: string;
  status: 'success' | 'failed';
  url?: string;
  error?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  platforms: string[];
  requiresKey: string;
}
