import type { PlatformProvider } from './types.js';
import type { ReachforgeConfig } from '../types/index.js';
import { MockProvider } from './mock.js';
import { DevtoProvider } from './devto.js';
import { PostizProvider } from './postiz.js';
import { HashnodeProvider } from './hashnode.js';
import { GitHubProvider } from './github.js';
import { GhostProvider } from './ghost.js';
import { WordPressProvider } from './wordpress.js';
import { TelegraphProvider } from './telegraph.js';
import { WriteasProvider } from './writeas.js';
import { RedditProvider } from './reddit.js';
import { PLATFORM_IDS } from '../core/filename-parser.js';

/** Human-readable display names for all known platforms. */
const PLATFORM_DISPLAY_NAMES: Record<string, string> = {
  devto: 'Dev.to (Forem)',
  hashnode: 'Hashnode',
  x: 'X/Twitter (via Postiz)',
  github: 'GitHub Discussions',
  wechat: 'WeChat',
  zhihu: 'Zhihu',
  linkedin: 'LinkedIn',
  medium: 'Medium',
  reddit: 'Reddit',
  ghost: 'Ghost',
  wordpress: 'WordPress',
  telegraph: 'Telegraph',
  writeas: 'Write.as',
};

/**
 * Default target language per platform.
 * Providers with real implementations declare their own language.
 * This map covers platforms that only use MockProvider.
 * 'auto' = use source language from project.yaml.
 */
const PLATFORM_DEFAULT_LANGUAGES: Record<string, string> = {
  wechat: 'zh-CN',
  zhihu: 'zh-CN',
  linkedin: 'en',
  medium: 'en',
  reddit: 'en',
};

export class ProviderLoader {
  private providers: Map<string, PlatformProvider> = new Map();

  constructor(config: ReachforgeConfig) {
    this.loadProviders(config);
  }

  private loadProviders(config: ReachforgeConfig): void {
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

    if (config.ghostUrl && config.ghostAdminApiKey) {
      this.register(new GhostProvider(config.ghostUrl, config.ghostAdminApiKey));
    }

    if (config.wordpressUrl && config.wordpressUsername && config.wordpressAppPassword) {
      this.register(new WordPressProvider(config.wordpressUrl, config.wordpressUsername, config.wordpressAppPassword));
    }

    if (config.telegraphAccessToken) {
      this.register(new TelegraphProvider(config.telegraphAccessToken));
    }

    if (config.writeasAccessToken) {
      this.register(new WriteasProvider(config.writeasAccessToken, config.writeasUrl));
    }

    if (config.redditClientId && config.redditClientSecret && config.redditUsername && config.redditPassword) {
      this.register(new RedditProvider(
        config.redditClientId, config.redditClientSecret,
        config.redditUsername, config.redditPassword,
        config.redditSubreddit ?? 'programming',
      ));
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

  listPlatforms(): Array<{ platform: string; provider: string; configured: boolean }> {
    return PLATFORM_IDS.map(platform => {
      const provider = this.providers.get(platform);
      return {
        platform,
        provider: provider?.name ?? PLATFORM_DISPLAY_NAMES[platform] ?? platform,
        configured: this.providers.has(platform),
      };
    });
  }

  /**
   * Get the default target language for a platform.
   * Priority: registered provider's language > PLATFORM_DEFAULT_LANGUAGES > 'auto'
   */
  getLanguage(platform: string): string {
    const provider = this.providers.get(platform);
    if (provider) return provider.language;
    return PLATFORM_DEFAULT_LANGUAGES[platform] ?? 'auto';
  }

  get size(): number {
    return this.providers.size;
  }
}
