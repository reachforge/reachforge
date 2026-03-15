import type { PlatformProvider } from './types.js';
import type { AphypeConfig } from '../types/index.js';
import { MockProvider } from './mock.js';
import { DevtoProvider } from './devto.js';
import { PostizProvider } from './postiz.js';

export class ProviderLoader {
  private providers: Map<string, PlatformProvider> = new Map();

  constructor(config: AphypeConfig) {
    this.loadProviders(config);
  }

  private loadProviders(config: AphypeConfig): void {
    // Real providers: only loaded if API keys are configured
    if (config.devtoApiKey) {
      const devto = new DevtoProvider(config.devtoApiKey);
      this.register(devto);
    }

    if (config.postizApiKey) {
      const postiz = new PostizProvider(config.postizApiKey);
      this.register(postiz);
    }

    // TODO: Add Hashnode and GitHub providers when implemented
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
