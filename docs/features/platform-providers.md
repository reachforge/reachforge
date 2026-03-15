# Feature Spec: Platform Providers

| Field        | Value                                      |
|--------------|--------------------------------------------|
| **Component**| Platform Provider Plugins                  |
| **Directory**| `src/providers/`                           |
| **Priority** | P0 (Dev.to, Postiz), P1 (Hashnode, GitHub) |
| **SRS Refs** | FR-PUB-001 through FR-PUB-009, FR-PROV-001 through FR-PROV-003, FR-PLUG-001 through FR-PLUG-004 |
| **NFR Refs** | NFR-PERF-003, NFR-REL-001, NFR-MAINT-002  |

---

## 1. Purpose and Scope

Platform providers are independent modules that implement the `PlatformProvider` interface to publish content to specific platforms. Each provider handles authentication, content formatting, validation, and API communication for one platform. Providers are discovered at runtime by the plugin loader.

This module covers four providers:
- **Dev.to** (native REST API) — P0, MVP
- **Postiz/X** (SaaS bridge REST API) — P0, MVP
- **Hashnode** (native GraphQL API) — P1, Phase 3
- **GitHub** (native GraphQL/REST API) — P1, Phase 3

## 2. Files

| File | Platform | API Type | Max Lines |
|------|----------|----------|-----------|
| `providers/types.ts` | (shared) | N/A | 80 |
| `providers/loader.ts` | (plugin loader) | N/A | 120 |
| `providers/devto.ts` | Dev.to | REST | 200 |
| `providers/postiz.ts` | X via Postiz | REST | 180 |
| `providers/hashnode.ts` | Hashnode | GraphQL | 180 |
| `providers/github.ts` | GitHub | GraphQL | 200 |

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
  id: string;                         // e.g., 'devto', 'x', 'hashnode', 'github'
  name: string;                       // e.g., 'Dev.to', 'X (via Postiz)'
  type: 'native' | 'saas-bridge';
  platforms: string[];
  requiredCredentials: string[];
  supportedFeatures: string[];
}

export interface PublishOptions {
  publishLive: boolean;               // Default: false (publish as draft)
  dryRun?: boolean;                   // Default: false
  metadata?: Record<string, unknown>;
}

export interface PublishResult {
  platform: string;
  status: 'success' | 'failed';
  url?: string;
  platformId?: string;
  error?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
```

## 4. Provider Implementations

### 4.1 Dev.to Provider

**Constructor**: `constructor(apiKey: string)`

**manifest()** returns:
```typescript
{
  id: 'devto',
  name: 'Dev.to',
  type: 'native',
  platforms: ['devto'],
  requiredCredentials: ['devto_api_key'],
  supportedFeatures: ['articles', 'draft-mode', 'tags', 'series'],
}
```

**validate(content)** logic:
1. Check content is non-empty — error: "Dev.to article content is empty."
2. Extract YAML frontmatter block (`---\n...\n---`)
3. If no frontmatter: error: "Dev.to article missing required frontmatter block (---...---)."
4. Parse frontmatter with `js-yaml`
5. Check `title` field exists and is non-empty — error: "Dev.to article missing required frontmatter field: title."
6. Check `title` length <= 128 chars — error: "Dev.to article title exceeds 128 character limit (found: {length})."
7. If `tags` present: check each tag is <= 20 chars and contains only alphanumeric/hyphens — error per invalid tag
8. Return `{ valid: errors.length === 0, errors }`

**publish(content, options)** logic:
1. Parse frontmatter to extract `title`, `tags`, `series`
2. Extract body_markdown (everything after frontmatter closing `---`)
3. Build request body:
   ```json
   {
     "article": {
       "title": "<title>",
       "body_markdown": "<body>",
       "published": false,
       "tags": ["<tag1>", "<tag2>"],
       "series": "<series_or_null>"
     }
   }
   ```
4. Set `published` to `options.publishLive` (FR-PUB-004)
5. POST to `https://dev.to/api/articles` with `api-key` header
6. On HTTP 201: return `{ platform: 'devto', status: 'success', url: response.url, platformId: response.id }`
7. On HTTP 401/403: throw `AuthenticationError('Dev.to')` (no retry)
8. On HTTP 429: HttpClient retries with exponential backoff (1s, 2s, 4s) up to 3 attempts
9. On HTTP 422: throw `PlatformApiError('devto', 422, response.error)` — content validation failed on server
10. After 3 retry failures: throw `HttpRetryExhaustedError`

### 4.2 Postiz Provider (X/Twitter)

**Constructor**: `constructor(apiKey: string)`

**manifest()** returns:
```typescript
{
  id: 'x',
  name: 'X (via Postiz)',
  type: 'saas-bridge',
  platforms: ['x'],
  requiredCredentials: ['postiz_api_key'],
  supportedFeatures: ['threads', 'single-post'],
}
```

**validate(content)** logic:
1. Parse content into thread segments by splitting on `\n---\n` or numbered markers `\n\d+\/\s*`
2. Trim each segment, filter empty strings
3. If no segments: error: "X content is empty -- no thread segments found."
4. For each segment (index `i`):
   a. If `segment.length > 280`: error: "X post segment {i+1} exceeds 280 character limit (found: {length})."
5. Return validation result

**publish(content, options)** logic:
1. Parse content into thread segments (same splitting logic as validate)
2. Build request body:
   ```json
   {
     "platform": "twitter",
     "content": ["segment1", "segment2", ...],
     "type": "thread"
   }
   ```
   > Note: `"twitter"` is the Postiz API's external convention. aphype's internal platform identifier is `x`.
   (Use `"single"` if only one segment)
3. POST to `https://api.postiz.com/posts` with `Authorization: Bearer <key>`
4. On success: return `{ platform: 'x', status: 'success', url: response.postUrl }`
5. On HTTP 401: throw `AuthenticationError('Postiz')`
6. On HTTP 429/500/502/503: HttpClient retries (3 attempts, exponential backoff)

### 4.3 Hashnode Provider

**Constructor**: `constructor(apiKey: string, publicationId: string)`

**manifest()** returns:
```typescript
{
  id: 'hashnode',
  name: 'Hashnode',
  type: 'native',
  platforms: ['hashnode'],
  requiredCredentials: ['hashnode_api_key'],
  supportedFeatures: ['articles', 'tags'],
}
```

**validate(content)** logic:
1. Check content is non-empty
2. Extract title from first H1 heading (`# Title`) or YAML frontmatter `title:` field
3. If no title found: error: "Hashnode article missing title (no H1 heading or frontmatter title found)."
4. Return validation result

**publish(content, options)** logic:
1. Extract title from H1 or frontmatter
2. Extract body (content after title line or after frontmatter block)
3. Build GraphQL mutation:
   ```graphql
   mutation CreateStory($input: CreateStoryInput!) {
     createPublicationStory(publicationId: "<pubId>", input: $input) {
       post { slug, publication { domain } }
     }
   }
   ```
4. POST to `https://gql.hashnode.com` with `Authorization` header
5. Construct URL: `https://{domain}/{slug}`
6. Return success result

### 4.4 GitHub Provider

**Constructor**: `constructor(token: string, config: { owner: string; repo: string; category: string })`

**manifest()** returns:
```typescript
{
  id: 'github',
  name: 'GitHub Discussions',
  type: 'native',
  platforms: ['github'],
  requiredCredentials: ['github_token'],
  supportedFeatures: ['discussions', 'file-update'],
}
```

**validate(content)** logic:
1. Check content is non-empty
2. Extract title from first H1 heading
3. If no title: error: "GitHub discussion missing title (no H1 heading found)."
4. Return validation result

**publish(content, options)** logic:
1. Extract title and body from content
2. Resolve repository ID and discussion category ID via GraphQL query:
   ```graphql
   query {
     repository(owner: "<owner>", name: "<repo>") {
       id
       discussionCategories(first: 10) {
         nodes { id, name }
       }
     }
   }
   ```
3. Find category by name match
4. Create discussion via mutation:
   ```graphql
   mutation CreateDiscussion($input: CreateDiscussionInput!) {
     createDiscussion(input: $input) {
       discussion { url, id }
     }
   }
   ```
5. Return success result with discussion URL

## 5. Error Handling

| Provider | Error | Response | Retry? | User Message |
|----------|-------|----------|--------|-------------|
| Dev.to | 401 | Auth failure | No | "Dev.to authentication failed. Verify your API key." |
| Dev.to | 403 | Forbidden | No | "Dev.to authentication failed. Verify your API key." |
| Dev.to | 422 | Validation | No | "Dev.to rejected the article: {details}" |
| Dev.to | 429 | Rate limit | Yes (3x) | (silent retry, then) "Dev.to rate limit exceeded after 3 attempts." |
| Postiz | 401 | Auth failure | No | "Postiz authentication failed. Verify your API key." |
| Postiz | 429/5xx | Transient | Yes (3x) | "Postiz API unavailable after 3 attempts." |
| Hashnode | 401 | Auth failure | No | "Hashnode authentication failed. Verify your API key." |
| Hashnode | GraphQL errors | Various | No | "Hashnode API error: {message}" |
| GitHub | 401/403 | Auth failure | No | "GitHub authentication failed. Verify your token." |
| GitHub | 404 | Repo/category not found | No | "GitHub repository or discussion category not found." |

## 6. Test Scenarios

### Dev.to Provider Tests

1. `validate()` passes with valid frontmatter containing title
2. `validate()` fails with missing frontmatter block
3. `validate()` fails with missing title field
4. `validate()` fails with title exceeding 128 characters
5. `publish()` sends correct request body to POST /api/articles
6. `publish()` sets `published: false` by default (draft mode)
7. `publish()` sets `published: true` when `publishLive` is true
8. `publish()` returns success with URL from response
9. `publish()` throws `AuthenticationError` on 401 response
10. `publish()` retries on 429 with exponential backoff
11. `publish()` throws after 3 failed retry attempts

### Postiz Provider Tests

12. `validate()` passes with segments all under 280 chars
13. `validate()` fails when any segment exceeds 280 chars (reports exact count)
14. `validate()` fails with empty content
15. `validate()` correctly splits on `---` delimiter
16. `validate()` correctly splits on numbered markers (1/, 2/)
17. `publish()` sends thread array in request body
18. `publish()` uses "single" type for single-segment content
19. `publish()` returns X post URL from response

### Hashnode Provider Tests

20. `validate()` passes with H1 title present
21. `validate()` fails with no title
22. `publish()` sends correct GraphQL mutation
23. `publish()` constructs URL from domain and slug

### GitHub Provider Tests

24. `validate()` passes with H1 title
25. `validate()` fails with no title
26. `publish()` resolves repository and category IDs first
27. `publish()` creates discussion with correct variables
28. `publish()` returns discussion URL

## 7. Dependencies

| Dependency | Direction | Purpose |
|-----------|-----------|---------|
| `utils/http.ts` | Imports from | HTTP client with retry |
| `core/config.ts` | Receives config from | API keys |
| `providers/loader.ts` | Loaded by | Plugin discovery |
| `types/errors.ts` | Imports from | Error classes |
| `js-yaml` | npm dependency | Frontmatter parsing (Dev.to) |

---

*SRS Traceability: FR-PUB-001 (Dev.to auth), FR-PUB-002 (Dev.to publish), FR-PUB-003 (receipt), FR-PUB-004 (draft mode), FR-PUB-005 (retry), FR-PUB-006 (Postiz auth), FR-PUB-007 (Postiz publish), FR-PUB-008 (X receipt), FR-PUB-009 (Postiz retry), FR-PROV-001 (Hashnode), FR-PROV-002 (GitHub), FR-PROV-003 (per-article config), FR-PLUG-001 (interface), NFR-PERF-003 (concurrent publish), NFR-REL-001 (no data loss), NFR-MAINT-002 (provider interface).*
