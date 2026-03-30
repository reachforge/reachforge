import type { PlatformProvider } from './types.js';
import type { ReachforgeConfig } from '../types/index.js';
import { MockProvider } from './mock.js';
import { DevtoProvider } from './devto.js';
import { PostizProvider, type PostizWhoCanReply } from './postiz.js';
import { HashnodeProvider } from './hashnode.js';
import { GitHubProvider } from './github.js';
import { GhostProvider } from './ghost.js';
import { WordPressProvider } from './wordpress.js';
import { TelegraphProvider } from './telegraph.js';
import { WriteasProvider } from './writeas.js';
import { RedditProvider } from './reddit.js';
import { PLATFORM_IDS } from '../core/filename-parser.js';
import { ReachforgeError } from '../types/index.js';

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
  /** Tracks platforms where multiple providers are registered (conflict). */
  private conflicts: Map<string, PlatformProvider[]> = new Map();

  constructor(config: ReachforgeConfig) {
    this.loadProviders(config);
  }

  private loadProviders(config: ReachforgeConfig): void {
    // Postiz: registered first so native providers (if added later) take priority
    if (config.postizApiKey && config.postizIntegrations) {
      for (const [platformKey, integrationId] of Object.entries(config.postizIntegrations)) {
        this.register(new PostizProvider(config.postizApiKey, integrationId, {
          platform: platformKey,
          baseUrl: config.postizBaseUrl,
          whoCanReply: config.postizWhoCanReply as PostizWhoCanReply | undefined,
        }));
      }
    }

    // Native providers registered after Postiz — they win on conflict
    if (config.devtoApiKey) {
      this.register(new DevtoProvider(config.devtoApiKey));
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
      if (this.providers.has(platform)) {
        // Track conflict; the new provider overwrites in the primary map (last = highest priority)
        const existing = this.conflicts.get(platform) ?? [this.providers.get(platform)!];
        this.conflicts.set(platform, [...existing, provider]);
      }
      this.providers.set(platform, provider);
    }
  }

  /**
   * Resolve the provider for a platform, with conflict handling.
   *
   * - No conflict → returns the registered provider (or undefined if none)
   * - Conflict + preferredProviderId → returns the matching provider
   * - Conflict + no preference → throws with a helpful --provider hint
   */
  resolveProvider(platform: string, preferredProviderId?: string): PlatformProvider | undefined {
    const conflictList = this.conflicts.get(platform);
    if (conflictList) {
      const allProviders = conflictList; // includes all registered (last in conflictList = current in providers map)
      if (preferredProviderId) {
        const match = allProviders.find(p => p.id === preferredProviderId);
        if (!match) {
          throw new ReachforgeError(
            `Provider "${preferredProviderId}" is not registered for platform "${platform}"`,
            `Available: ${[...new Set(allProviders.map(p => p.id))].join(', ')}`,
          );
        }
        return match;
      }
      const ids = [...new Set(allProviders.map(p => p.id))].join(', ');
      throw new ReachforgeError(
        `Multiple providers configured for "${platform}": ${ids}`,
        `Use --provider <id> to specify which to use (e.g. --provider postiz)`,
      );
    }
    return this.providers.get(platform);
  }

  /** Like resolveProvider but falls back to MockProvider when none registered. */
  resolveProviderOrMock(platform: string, preferredProviderId?: string): PlatformProvider {
    return this.resolveProvider(platform, preferredProviderId) ?? new MockProvider();
  }

  /** @deprecated Use resolveProvider instead. */
  getProvider(platform: string): PlatformProvider | undefined {
    return this.providers.get(platform);
  }

  /** @deprecated Use resolveProviderOrMock instead. */
  getProviderOrMock(platform: string): PlatformProvider {
    return this.providers.get(platform) ?? new MockProvider();
  }

  listRegistered(): string[] {
    return Array.from(new Set(
      Array.from(this.providers.values()).map(p => p.id)
    ));
  }

  hasRealProvider(platform: string): boolean {
    return this.providers.has(platform);
  }

  hasConflict(platform: string): boolean {
    return this.conflicts.has(platform);
  }

  listPlatforms(): Array<{ platform: string; provider: string; configured: boolean; conflict?: boolean }> {
    // Static well-known list
    const rows: Array<{ platform: string; provider: string; configured: boolean; conflict?: boolean }> = PLATFORM_IDS.map(platform => {
      const provider = this.providers.get(platform);
      return {
        platform,
        provider: provider?.name ?? PLATFORM_DISPLAY_NAMES[platform] ?? platform,
        configured: this.providers.has(platform),
        ...(this.conflicts.has(platform) ? { conflict: true } : {}),
      };
    });

    // Dynamically registered named slots (e.g. x_company) not in static list
    for (const [platform, provider] of this.providers.entries()) {
      if (!(PLATFORM_IDS as readonly string[]).includes(platform)) {
        rows.push({
          platform,
          provider: provider.name,
          configured: true,
          ...(this.conflicts.has(platform) ? { conflict: true } : {}),
        });
      }
    }

    return rows;
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
