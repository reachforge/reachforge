# Feature Spec: Media Asset Manager

| Field        | Value                                      |
|--------------|--------------------------------------------|
| **Component**| Media Asset Management                     |
| **Directory**| `src/utils/media.ts`                       |
| **Priority** | P1                                         |
| **SRS Refs** | FR-MEDIA-001 through FR-MEDIA-004          |

---

## 1. Purpose and Scope

The media manager handles the two-stage image upload pipeline: (1) detect local image references in adapted content, (2) upload them to platform-specific CDNs and replace local paths with CDN URLs. An upload cache (`.upload_cache.yaml`) prevents re-uploading unchanged files across multiple publish attempts.

The media manager runs between content validation and publishing in the publish flow.

## 2. Files

| File | Responsibility | Max Lines |
|------|---------------|-----------|
| `utils/media.ts` | MediaManager class: detect, upload, replace, cache | 200 |

## 3. TypeScript Interfaces

```typescript
// utils/media.ts

export interface MediaReference {
  alt: string;                // Alt text from markdown image syntax
  localPath: string;          // Relative file path
  absolutePath: string;       // Resolved absolute path
  lineNumber: number;         // Line in content where reference appears
}

export interface MediaUploadResult {
  localPath: string;
  cdnUrl: string;
  platform: string;
  sizeBytes: number;
  uploadedAt: string;         // ISO 8601 datetime
}

export class MediaManager {
  constructor(workingDir: string, httpClient: HttpClient);

  /**
   * Scans content for local image references.
   * FR-MEDIA-001: Detects ![alt](local-path) patterns.
   * Ignores URLs starting with http:// or https://.
   */
  detectLocalImages(content: string, projectDir: string): MediaReference[];

  /**
   * Uploads a single image to a platform's CDN.
   * FR-MEDIA-002: Calls platform-specific upload endpoint.
   * @throws MediaUploadError if file does not exist (logged as warning, not fatal)
   */
  async uploadImage(
    ref: MediaReference,
    platform: string,
    credentials: Record<string, string>
  ): Promise<MediaUploadResult>;

  /**
   * Replaces local file paths in content with CDN URLs.
   * FR-MEDIA-003: String replacement in adapted content.
   */
  replaceUrls(content: string, uploads: MediaUploadResult[]): string;

  /**
   * Processes all media for a piece of content: detect, check cache, upload missing, replace.
   * FR-MEDIA-004: Uses .upload_cache.yaml to skip re-uploads.
   */
  async processMedia(
    content: string,
    projectDir: string,
    platform: string,
    credentials: Record<string, string>,
    cache: UploadCache | null
  ): Promise<{ processedContent: string; updatedCache: UploadCache; uploads: MediaUploadResult[] }>;
}
```

## 4. Logic Steps

### detectLocalImages(content, projectDir)

1. Define regex: `/!\[([^\]]*)\]\(([^)]+)\)/g` to match all Markdown image references
2. For each match:
   a. Extract `alt` (capture group 1) and `rawPath` (capture group 2)
   b. If `rawPath` starts with `http://` or `https://`: skip (already hosted)
   c. Compute `absolutePath = path.resolve(projectDir, rawPath)`
   d. Determine `lineNumber` from match position in content
   e. Add to results: `{ alt, localPath: rawPath, absolutePath, lineNumber }`
3. Return array of `MediaReference`

### uploadImage(ref, platform, credentials)

1. Check `ref.absolutePath` exists via `fs.pathExists()`
   - If not: log warning "Image file not found: {absolutePath}; skipping." and return null
2. Read file as Buffer via `fs.readFile(ref.absolutePath)`
3. Get file size in bytes from Buffer length
4. Determine upload endpoint by platform:
   | Platform | Endpoint | Method | Auth |
   |----------|---------|--------|------|
   | `devto` | `POST https://dev.to/api/images` | multipart/form-data with `image` field | `api-key` header |
   | `hashnode` | Hashnode image upload API (varies) | multipart/form-data | `Authorization` header |
   | `github` | GitHub content API or external CDN | Base64 in JSON body | `Authorization: Bearer` |
   | `x` | Images uploaded through Postiz API as part of post | (handled by Postiz) | N/A |
5. Send upload request via HttpClient
6. Extract CDN URL from response
7. Return `MediaUploadResult { localPath: ref.localPath, cdnUrl, platform, sizeBytes, uploadedAt: now }`

### replaceUrls(content, uploads)

1. For each `upload` in `uploads`:
   a. Replace all occurrences of `upload.localPath` in content with `upload.cdnUrl`
   b. Use exact string replacement (not regex) to avoid partial matches
2. Return modified content

### processMedia(content, projectDir, platform, credentials, cache)

1. Call `detectLocalImages(content, projectDir)` to find all local image references
2. If no references found: return `{ processedContent: content, updatedCache: cache ?? { uploads: {} }, uploads: [] }`
3. Initialize `updatedCache` from existing cache or empty
4. For each `ref` in detected references:
   a. Check if `ref.localPath` exists in cache for this platform:
      - If cached and file size unchanged: use cached `cdnUrl`, skip upload
      - If cached but file size changed: re-upload
      - If not cached: upload
   b. Call `uploadImage(ref, platform, credentials)`
   c. If upload returned null (file missing): skip, log warning
   d. Add result to uploads array
   e. Update cache entry:
      ```
      updatedCache.uploads[ref.localPath] = {
        cdn_url: result.cdnUrl,
        platform: platform,
        uploaded_at: result.uploadedAt,
        size_bytes: result.sizeBytes,
      }
      ```
5. Call `replaceUrls(content, uploads)` to get processed content
6. Return `{ processedContent, updatedCache, uploads }`

## 5. Field Mappings

### Image Reference Detection

| Content Pattern | Detected? | localPath | Notes |
|----------------|-----------|-----------|-------|
| `![arch](./images/arch.png)` | Yes | `./images/arch.png` | Relative path |
| `![](images/pic.jpg)` | Yes | `images/pic.jpg` | Empty alt text |
| `![logo](/Users/me/logo.svg)` | Yes | `/Users/me/logo.svg` | Absolute path |
| `![ext](https://cdn.example.com/img.png)` | No | N/A | Already hosted |
| `![ext](http://example.com/img.png)` | No | N/A | Already hosted |
| `[link](./file.pdf)` | No | N/A | Not an image (no `!`) |

### Cache Entry Schema

```yaml
# .upload_cache.yaml
uploads:
  "./images/arch.png":
    cdn_url: "https://dev-to-uploads.s3.amazonaws.com/uploads/articles/abc123.png"
    platform: "devto"
    uploaded_at: "2026-03-14T10:00:00Z"
    size_bytes: 245760
```

## 6. Error Handling

| Error Condition | Behavior | Severity |
|----------------|----------|----------|
| Image file not found at local path | Log warning, skip this image, continue processing others | Warning (non-fatal) |
| Upload API returns error | Log warning, skip this image, continue processing others | Warning (non-fatal) |
| Cache file (.upload_cache.yaml) not found | Start with empty cache; no error | Normal |
| Cache file has invalid YAML | Log warning, start with empty cache | Warning |
| Platform has no image upload endpoint | Skip media processing for this platform | Normal |
| File read permission denied | Log warning, skip this image | Warning |

Media processing errors are non-fatal by design. Missing images result in broken image references in the published content, which the user can fix and re-publish.

## 7. Test Scenarios

### detectLocalImages Tests

1. Detects single image reference `![alt](path.png)`
2. Detects multiple image references in content
3. Ignores HTTPS URLs — not treated as local
4. Ignores HTTP URLs
5. Handles empty alt text `![](path.png)`
6. Handles absolute paths `/Users/me/img.png`
7. Returns empty array for content with no images
8. Does not detect non-image links `[text](path)`

### uploadImage Tests

9. Reads file and sends to correct platform upload endpoint
10. Returns CDN URL from API response
11. Returns null and logs warning when file does not exist
12. Includes file size in result
13. Handles upload API error gracefully (returns null)

### replaceUrls Tests

14. Replaces single local path with CDN URL
15. Replaces multiple local paths
16. Does not modify content when uploads array is empty
17. Handles paths with special regex characters (e.g., dots)

### processMedia Tests

18. Full flow: detect -> upload -> replace with no cache
19. Skips upload for cached images with matching file size
20. Re-uploads when file size has changed since cache entry
21. Returns original content when no local images detected
22. Updates cache with new upload entries
23. Handles mix of cached and uncached images
24. Continues processing when one image upload fails

## 8. Dependencies

| Dependency | Direction | Purpose |
|-----------|-----------|---------|
| `utils/http.ts` | Imports from | HTTP client for upload requests |
| `core/metadata.ts` | Imports from | Read/write .upload_cache.yaml |
| `fs-extra` | npm dependency | File reading |
| `core/pipeline.ts` | Imported by | Called during publish flow |

---

*SRS Traceability: FR-MEDIA-001 (detect local images via regex), FR-MEDIA-002 (upload to platform CDN), FR-MEDIA-003 (replace local paths with CDN URLs), FR-MEDIA-004 (cache in .upload_cache.yaml, skip re-uploads).*
