import type { PlatformProvider } from './types.js';
import type { AphypeConfig } from '../types/index.js';
import { MockProvider } from './mock.js';
import { DevtoProvider } from './devto.js';
import { PostizProvider } from './postiz.js';
import { HashnodeProvider } from './hashnode.js';
import { GitHubProvider } from './github.js';

export class ProviderLoader {
  private providers: Map<string, PlatformProvider> = new Map();

  constructor(config: AphypeConfig) {
    this.loadProviders(config);
  }

  private loadProviders(config: AphypeConfig): void {
    if (config.devtoApiKey) {
      this.register(new DevtoProvider(config.devtoApiKey));
    }

    if (config.postizApiKey) {
      this.register(new PostizProvider(config.postizApiKey));
    }

    if (config.hashnodeApiKey && config.hashnodePublicationId) {
      this.register(new HashnodeProvider(config.hashnodeApiKey, config.hashnodePublicationId));
    }

    if (config.githubToken && config.githubOwner && config.githubRepo) {
      this.register(new GitHubProvider(config.githubToken, {
        owner: config.githubOwner,
        repo: config.githubRepo,
        category: config.githubDiscussionCategory ?? 'General',
      }));
    }
  }

  private register(provider: PlatformProvider): void {
    for (const platform of provider.platforms) {
      this.providers.set(platform, provider);
    }
  }

  getProvider(platform: string): PlatformProvider | undefined {
    return this.providers.get(platform);
  }

  getProviderOrMock(platform: string): PlatformProvider {
    return this.providers.get(platform) || new MockProvider();
  }

  listRegistered(): string[] {
    return Array.from(new Set(
      Array.from(this.providers.values()).map(p => p.id)
    ));
  }

  hasRealProvider(platform: string): boolean {
    return this.providers.has(platform);
  }

  get size(): number {
    return this.providers.size;
  }
}
