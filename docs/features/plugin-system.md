# Feature Spec: Plugin System

| Field        | Value                                      |
|--------------|--------------------------------------------|
| **Component**| Plugin Loader and Provider Discovery       |
| **Directory**| `src/providers/loader.ts`                  |
| **Priority** | P1                                         |
| **SRS Refs** | FR-PLUG-001 through FR-PLUG-004            |
| **NFR Refs** | NFR-MAINT-002                              |

---

## 1. Purpose and Scope

The plugin system enables reachforge to discover, load, and manage platform provider plugins at runtime. It scans the `providers/` directory for TypeScript modules that implement the `PlatformProvider` interface, instantiates them with credentials from ConfigManager, and makes them available to the pipeline engine for publishing operations.

The system is designed so that adding a new provider requires creating exactly one file in `providers/` and optionally adding credentials — no modifications to core, commands, or other providers (NFR-MAINT-002).

## 2. Files

| File | Responsibility | Max Lines |
|------|---------------|-----------|
| `providers/loader.ts` | ProviderLoader class: discovery, loading, registry | 120 |
| `providers/types.ts` | PlatformProvider interface, ProviderManifest type | 80 |

## 3. TypeScript Interfaces

```typescript
// providers/types.ts

export interface PlatformProvider {
  manifest(): ProviderManifest;
  validate(content: string): Promise<ValidationResult>;
  publish(content: string, options: PublishOptions): Promise<PublishResult>;
  formatContent(content: string): string;
}

export interface ProviderManifest {
  id: string;                         // Unique platform ID (e.g., 'devto')
  name: string;                       // Human-readable name (e.g., 'Dev.to')
  type: 'native' | 'saas-bridge';    // Direct API or SaaS intermediary
  platforms: string[];                // Platform IDs served
  requiredCredentials: string[];      // Credential keys needed
  supportedFeatures: string[];        // Feature tags
}

// providers/loader.ts

export class ProviderLoader {
  private providers: Map<string, PlatformProvider>;
  private manifests: ProviderManifest[];

  constructor();

  async discoverProviders(config: ConfigManager): Promise<void>;
  getProvider(platform: string): PlatformProvider | undefined;
  listProviders(): ProviderManifest[];
  getProvidersForProject(platforms: string[]): Map<string, PlatformProvider>;
  isProviderAvailable(platform: string): boolean;
}
```

## 4. Method Signatures

```typescript
class ProviderLoader {
  /**
   * Scans providers/ directory and loads all valid provider modules.
   * FR-PLUG-002: Filesystem-based discovery.
   * FR-PLUG-003: Credentials loaded via ConfigManager.
   */
  async discoverProviders(config: ConfigManager): Promise<void>;

  /**
   * Returns a specific provider by platform ID.
   * Returns undefined if not loaded.
   */
  getProvider(platform: string): PlatformProvider | undefined;

  /**
   * Returns all loaded provider manifests for display/introspection.
   */
  listProviders(): ProviderManifest[];

  /**
   * Filters loaded providers by a list of platform IDs.
   * FR-PROV-003: Used to get providers for a specific project's adapted_platforms.
   */
  getProvidersForProject(platforms: string[]): Map<string, PlatformProvider>;

  /**
   * Checks if a provider is loaded and has valid credentials.
   */
  isProviderAvailable(platform: string): boolean;
}
```

## 5. Logic Steps

### discoverProviders(config)

1. Determine `providersDir` path:
   - In development: `path.join(__dirname, '.')` (same directory as loader.ts)
   - In compiled binary: resolved from the binary's module path
2. Read directory listing of `providersDir`
3. Filter files:
   a. Must end with `.ts` or `.js`
   b. Must NOT be `types.ts`, `types.js`, `loader.ts`, `loader.js`
   c. Must NOT start with `.` (hidden files)
   d. Must NOT contain `.test.` or `.spec.` (test files)
4. For each qualifying file:
   a. Extract platform name from filename: `path.basename(file, path.extname(file))`
   b. Attempt dynamic import: `const module = await import(path.join(providersDir, file))`
   c. Check that module has a default export: `if (!module.default) { log warning; continue; }`
   d. Check that default export is a constructor: `if (typeof module.default !== 'function') { log warning; continue; }`
   e. Gather required credentials from a temporary instance or static method:
      - Instantiate with empty/dummy config to call `manifest()`
      - Read `manifest().requiredCredentials`
   f. Check if all required credentials are available via `config.getApiKey()`:
      - If any required key is missing: log info "Provider '{name}' skipped: missing {key}"; continue
   g. Instantiate provider with actual credentials:
      ```typescript
      // Provider-specific instantiation
      const apiKey = config.getApiKey(manifest.requiredCredentials[0]);
      const provider = new module.default(apiKey, ...additionalConfig);
      ```
   h. Call `provider.manifest()` to get the real manifest
   i. Register: `this.providers.set(manifest.id, provider)`
   j. Store manifest: `this.manifests.push(manifest)`
   k. Log: "Loaded provider: {manifest.name} ({manifest.id})"
5. Log summary: "Discovered {count} providers: {ids.join(', ')}"

### getProvider(platform)

1. Return `this.providers.get(platform)` or `undefined`

### listProviders()

1. Return copy of `this.manifests` array

### getProvidersForProject(platforms)

1. Create new `Map<string, PlatformProvider>`
2. For each `platform` in the `platforms` array:
   a. Look up in `this.providers` by platform ID
   b. If found: add to result map
   c. If not found: skip (the platform has no loaded provider)
3. Return result map

### isProviderAvailable(platform)

1. Return `this.providers.has(platform)`

## 6. Provider Registration Contract

To be recognized by the plugin loader, a provider file must:

1. **Be located in `src/providers/`** with a descriptive filename (e.g., `devto.ts`, `postiz.ts`)
2. **Export a default class** that implements `PlatformProvider`:
   ```typescript
   export default class MyProvider implements PlatformProvider {
     constructor(apiKey: string, ...additionalConfig: any[]);
     manifest(): ProviderManifest;
     validate(content: string): Promise<ValidationResult>;
     publish(content: string, options: PublishOptions): Promise<PublishResult>;
     formatContent(content: string): string;
   }
   ```
3. **Return a valid `ProviderManifest`** from `manifest()` with a unique `id`
4. **List required credentials** in `manifest().requiredCredentials` so the loader can check availability

### Adding a New Provider (Step-by-Step)

1. Create `src/providers/linkedin.ts`
2. Implement `PlatformProvider` interface with `manifest()` returning `{ id: 'linkedin', requiredCredentials: ['linkedin_api_key'], ... }`
3. Add `linkedin_api_key` to `credentials.yaml` or set `LINKEDIN_API_KEY` env var
4. Run `reach publish` — the loader discovers and loads LinkedIn provider automatically
5. No changes to `core/`, `commands/`, `index.ts`, or any other file

## 7. Error Handling

| Error Condition | Behavior | Severity |
|----------------|----------|----------|
| Provider file has no default export | Log warning: "Provider file {file} has no default export; skipping." | Warning |
| Default export is not a constructor | Log warning: "Provider {file} default export is not a class; skipping." | Warning |
| Provider instantiation throws | Log warning: "Failed to load provider {file}: {error.message}; skipping." | Warning |
| Required credential missing | Log info: "Provider '{name}' skipped: missing {credential}." | Info (expected) |
| manifest() returns invalid data | Log warning: "Provider {file} manifest is invalid; skipping." | Warning |
| Duplicate provider ID | Log warning: "Duplicate provider ID '{id}' from {file}; keeping first." | Warning |
| Dynamic import fails (syntax error) | Log warning: "Failed to import provider {file}: {error.message}; skipping." | Warning |
| providers/ directory does not exist | Create it; load no providers | Normal |

All provider loading errors are non-fatal. A provider that fails to load is simply unavailable for publishing. The system continues operating with whatever providers loaded successfully.

## 8. Test Scenarios

### Discovery Tests

1. Discovers `.ts` files in providers/ directory (excluding types.ts, loader.ts)
2. Ignores hidden files (`.hidden-provider.ts`)
3. Ignores test files (`devto.test.ts`, `postiz.spec.ts`)
4. Handles empty providers/ directory (zero providers loaded)
5. Handles missing providers/ directory (creates it, loads zero)

### Loading Tests

6. Successfully instantiates provider with correct API key from config
7. Skips provider when required credential is missing (logs info, not error)
8. Skips file with no default export (logs warning)
9. Skips file where default export is not a class (logs warning)
10. Handles provider constructor throwing an error (logs warning, skips)
11. Loads multiple providers simultaneously
12. Handles duplicate provider IDs (keeps first, warns about second)

### Registry Tests

13. `getProvider('devto')` returns loaded Dev.to provider
14. `getProvider('nonexistent')` returns undefined
15. `listProviders()` returns manifests for all loaded providers
16. `getProvidersForProject(['devto', 'x'])` returns matching providers
17. `getProvidersForProject(['devto', 'linkedin'])` returns only devto if linkedin not loaded
18. `isProviderAvailable('devto')` returns true when loaded
19. `isProviderAvailable('linkedin')` returns false when not loaded

### Integration Tests

20. Adding a new provider file makes it discoverable on next `discoverProviders()` call
21. Provider loaded with correct API key can authenticate with mock API

## 9. Bun Compiled Binary Consideration

Dynamic imports (`import()`) in Bun compiled binaries may have limitations depending on Bun version. If dynamic import from the filesystem is not supported in compiled mode:

**Fallback plan**: Create a static registry file `providers/registry.ts` that explicitly imports all known providers:

```typescript
// providers/registry.ts (fallback for compiled binary)
import DevtoProvider from './devto';
import PostizProvider from './postiz';
import HashnodeProvider from './hashnode';
import GitHubProvider from './github';

export const KNOWN_PROVIDERS = [
  DevtoProvider,
  PostizProvider,
  HashnodeProvider,
  GitHubProvider,
];
```

The loader would use `KNOWN_PROVIDERS` instead of filesystem scanning when dynamic import is unavailable. This sacrifices automatic discovery for community providers in compiled mode but maintains all other functionality.

## 10. Dependencies

| Dependency | Direction | Purpose |
|-----------|-----------|---------|
| `providers/types.ts` | Imports from | PlatformProvider interface |
| `core/config.ts` | Imports from | Credential retrieval |
| `core/pipeline.ts` | Imported by | Pipeline requests providers |
| `commands/publish.ts` | Imported by | Publish command needs providers |

---

*SRS Traceability: FR-PLUG-001 (PlatformProvider interface), FR-PLUG-002 (filesystem discovery), FR-PLUG-003 (credential loading with env > yaml precedence), FR-PLUG-004 (validate before publish — enforced by pipeline, not loader), NFR-MAINT-002 (new providers without core changes).*
