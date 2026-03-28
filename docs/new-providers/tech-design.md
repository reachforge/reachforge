# Technical Design: New Publishing Providers

| Field        | Value                                      |
|--------------|--------------------------------------------|
| **Document** | New Providers Tech Design v1.0             |
| **Date**     | 2026-03-27                                 |
| **Scope**    | Ghost, WordPress, Telegraph, Write.as, Reddit |

---

## 1. Overview

Add 5 new publishing providers to ReachForge following existing `PlatformProvider` interface patterns. Each provider gets a class in `src/providers/`, a validator in `src/validators/`, config fields in `ReachforgeConfig`, registration in `ProviderLoader`, and a platform ID in `PLATFORM_IDS`.

## 2. Provider Summary

| Provider | Platform ID | Content Format | Auth Method | Has `update()` |
|----------|-------------|---------------|-------------|-----------------|
| Ghost | `ghost` | `html` | JWT (HS256, self-signed from admin key) | Yes |
| WordPress | `wordpress` | `html` | Basic Auth (Application Password) | Yes |
| Telegraph | `telegraph` | `html` (converted to node JSON) | Access token | Yes |
| Write.as | `writeas` | `markdown` | Access token | Yes |
| Reddit | `reddit` | `markdown` | OAuth2 password grant (cached bearer) | Yes |

## 3. Config Changes

### 3.1 `ReachforgeConfig` additions (`src/types/pipeline.ts`)

```typescript
// Ghost
ghostUrl?: string;
ghostAdminApiKey?: string;          // format: "{key_id}:{secret}"

// WordPress
wordpressUrl?: string;
wordpressUsername?: string;
wordpressAppPassword?: string;

// Telegraph
telegraphAccessToken?: string;

// Write.as / WriteFreely
writeasAccessToken?: string;
writeasUrl?: string;                // optional, defaults to https://write.as

// Reddit
redditClientId?: string;
redditClientSecret?: string;
redditUsername?: string;
redditPassword?: string;
redditSubreddit?: string;           // default subreddit
```

### 3.2 `config.yaml` mapping

Keys follow existing `camelCase` config convention. Example:

```yaml
ghost_url: https://myblog.com
ghost_admin_api_key: "64af...b3c0:a1b2c3..."
wordpress_url: https://mysite.com
wordpress_username: admin
wordpress_app_password: "xxxx xxxx xxxx xxxx"
telegraph_access_token: "abc123..."
writeas_access_token: "..."
reddit_client_id: "..."
reddit_client_secret: "..."
reddit_username: "..."
reddit_password: "..."
reddit_subreddit: "programming"
```

## 4. Platform ID Registration

### 4.1 `PLATFORM_IDS` (`src/core/filename-parser.ts`)

Add: `'ghost'`, `'wordpress'`, `'telegraph'`, `'writeas'`, `'reddit'`

Note: `'reddit'` already exists in `PLATFORM_IDS`. The others are new.

### 4.2 `PLATFORM_DISPLAY_NAMES` (`src/providers/loader.ts`)

```typescript
ghost: 'Ghost',
wordpress: 'WordPress',
telegraph: 'Telegraph',
writeas: 'Write.as',
// reddit already exists
```

### 4.3 `PLATFORM_DEFAULT_LANGUAGES` (`src/providers/loader.ts`)

```typescript
ghost: 'en',
wordpress: 'en',
telegraph: 'en',
writeas: 'en',
// reddit already exists as 'en'
```

## 5. Provider Loader Registration (`src/providers/loader.ts`)

```typescript
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
```

## 6. Validator Registration (`src/validators/runner.ts`)

```typescript
import { validateGhostContent } from './ghost.js';
import { validateWordPressContent } from './wordpress.js';
import { validateTelegraphContent } from './telegraph.js';
import { validateWriteasContent } from './writeas.js';
import { validateRedditContent } from './reddit.js';

const VALIDATORS: Record<string, ValidatorFn> = {
  // ...existing
  ghost: validateGhostContent,
  wordpress: validateWordPressContent,
  telegraph: validateTelegraphContent,
  writeas: validateWriteasContent,
  reddit: validateRedditContent,
};
```

## 7. HTML Conversion Strategy

Ghost, WordPress, and Telegraph all require HTML input. The pipeline calls `formatContent()` on the provider, which should call `markdownToHtml()` from `src/utils/markdown.ts`.

- **Ghost**: `formatContent()` returns HTML via `markdownToHtml(content)`
- **WordPress**: Same as Ghost
- **Telegraph**: `formatContent()` returns HTML, then `publish()` converts HTML to Telegraph node JSON internally

Write.as and Reddit accept Markdown natively -- `formatContent()` strips frontmatter only.

## 8. File Manifest

| File | Action | Description |
|------|--------|-------------|
| `src/types/pipeline.ts` | Modify | Add config fields to `ReachforgeConfig` |
| `src/core/filename-parser.ts` | Modify | Add platform IDs to `PLATFORM_IDS` |
| `src/providers/loader.ts` | Modify | Import + register 5 providers, add display names/languages |
| `src/providers/index.ts` | Modify | Re-export new providers |
| `src/providers/ghost.ts` | Create | Ghost provider |
| `src/providers/wordpress.ts` | Create | WordPress provider |
| `src/providers/telegraph.ts` | Create | Telegraph provider |
| `src/providers/writeas.ts` | Create | Write.as provider |
| `src/providers/reddit.ts` | Create | Reddit provider |
| `src/validators/ghost.ts` | Create | Ghost validator |
| `src/validators/wordpress.ts` | Create | WordPress validator |
| `src/validators/telegraph.ts` | Create | Telegraph validator |
| `src/validators/writeas.ts` | Create | Write.as validator |
| `src/validators/reddit.ts` | Create | Reddit validator |
| `src/validators/runner.ts` | Modify | Register new validators |
| `src/mcp/tools.ts` | Modify | Add new platform IDs to MCP tool enums |
| `src/help.ts` | Modify | Add new platforms to help text |

## 9. Implementation Order

1. **Config + IDs**: `ReachforgeConfig` fields, `PLATFORM_IDS`, display names (all modify-only)
2. **Validators**: 5 new validator files + runner registration (no external deps)
3. **Providers** (in order of complexity):
   - Write.as (simplest -- Markdown, token auth)
   - WordPress (HTML, Basic Auth)
   - Ghost (HTML, JWT signing)
   - Telegraph (HTML-to-nodes conversion)
   - Reddit (OAuth token flow)
4. **Loader**: Register all providers
5. **Exports/MCP/Help**: Update index, MCP tools, help text

## 10. Testing Strategy

Each provider needs:
- **Unit tests**: Validator functions, `formatContent()`, payload construction
- **Integration tests**: Mock HTTP to verify correct API calls, headers, error handling
- **JWT/OAuth tests** (Ghost, Reddit): Verify token generation with known inputs

Test files: `tests/unit/providers/{provider}.test.ts`, `tests/unit/validators/{provider}.test.ts`

## 11. Error Handling

All providers follow the DevtoProvider pattern:
- Wrap API calls in try/catch
- Throw `ProviderError(providerId, message)` for non-OK HTTP responses
- Return `{ status: 'failed', error: message }` for caught non-provider errors
- Use `httpRequest()` from `src/utils/http.ts` for automatic retry + timeout

## 12. Dependencies

No new npm dependencies required:
- JWT signing (Ghost): Node `crypto` module (`createHmac`)
- Base64 encoding (WordPress): `btoa()` / `Buffer.from().toString('base64')`
- HTML-to-nodes (Telegraph): Custom lightweight parser (~50 lines)
- OAuth (Reddit): Standard HTTP POST via `httpRequest()`
