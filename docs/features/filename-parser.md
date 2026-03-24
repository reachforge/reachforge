# Filename Parser

> Feature spec for code-forge implementation planning.
> Source: extracted from docs/multi-article/tech-design.md §8
> Created: 2026-03-24

| Field | Value |
|-------|-------|
| Component | filename-parser |
| Priority | P0 |
| SRS Refs | — |
| Tech Design | §8.1 — filename-parser |
| Depends On | — |
| Blocks | multi-article-metadata, pipeline-engine-refactor |

## Purpose

Pure utility module that parses and constructs article filenames following the `{article}.{platform}.md` convention. Foundation for the entire multi-article system — all other components depend on it to interpret filenames consistently.

## Scope

**Included:**
- Parse `{article}.{platform}.md` filenames into structured objects
- Build filenames from article name + optional platform
- Determine if a pipeline stage uses platform-suffixed filenames
- Validate platform IDs and article names

**Excluded:**
- Filesystem operations
- Metadata handling
- Pipeline stage transitions

## Core Responsibilities

1. **Parse filenames** — extract article name and platform from `.md` filenames
2. **Build filenames** — construct canonical filenames from article + platform
3. **Stage classification** — determine if a stage uses platform suffixes
4. **Validation** — reject invalid platform IDs and conflicting article names

## Interfaces

### Inputs
- **filename** (string) — a `.md` filename from any pipeline stage
- **article** (string) — article name for construction
- **platform** (string | null) — platform ID for construction
- **stage** (PipelineStage) — stage for context-aware parsing

### Outputs
- **ParsedFilename** — `{ article: string, platform: string | null }`
- **filename** (string) — constructed filename

### Dependencies
- None (pure utility)

## Key Behaviors

### parseArticleFilename(filename: string, stage: PipelineStage): ParsedFilename

```typescript
interface ParsedFilename {
  article: string;
  platform: string | null;
}
```

**Logic steps:**
1. If `filename` does not end with `.md`, throw `ReachforgeError("Expected .md file: {filename}")`
2. Strip `.md` suffix → `stem`
3. If `!isAdaptedStage(stage)`, return `{ article: stem, platform: null }`
4. `lastDotIndex = stem.lastIndexOf('.')`
5. If `lastDotIndex === -1`, return `{ article: stem, platform: null }`
6. `candidatePlatform = stem.slice(lastDotIndex + 1)`
7. If `PLATFORM_ID_REGEX.test(candidatePlatform) && PLATFORM_IDS.includes(candidatePlatform)`:
   - Return `{ article: stem.slice(0, lastDotIndex), platform: candidatePlatform }`
8. Else return `{ article: stem, platform: null }`

**Edge cases:**

| Input | Stage | Result |
|-------|-------|--------|
| `teaser.md` | 04_adapted | `{ article: "teaser", platform: null }` |
| `teaser.x.md` | 04_adapted | `{ article: "teaser", platform: "x" }` |
| `my.first.post.devto.md` | 04_adapted | `{ article: "my.first.post", platform: "devto" }` |
| `teaser.x.md` | 01_inbox | `{ article: "teaser.x", platform: null }` |
| `teaser.UNKNOWN.md` | 04_adapted | `{ article: "teaser.UNKNOWN", platform: null }` |

### buildArticleFilename(article: string, platform: string | null): string

1. If `platform` is null/empty, return `${article}.md`
2. Validate: `if (!PLATFORM_ID_REGEX.test(platform)) throw error`
3. Return `${article}.${platform}.md`

### isAdaptedStage(stage: PipelineStage): boolean

```typescript
const ADAPTED_STAGES: PipelineStage[] = ['04_adapted', '05_scheduled', '06_sent'];
return ADAPTED_STAGES.includes(stage);
```

### validateArticleName(name: string): void

1. Empty → throw `"Article name cannot be empty"`
2. Length > 200 → throw `"Article name too long (max 200 chars)"`
3. Doesn't match `^[a-zA-Z0-9][a-zA-Z0-9._-]*$` → throw format error
4. `PLATFORM_IDS.includes(name.toLowerCase())` → throw `"Article name '{name}' conflicts with platform ID"`

### Constants

```typescript
export const PLATFORM_IDS = ['x', 'devto', 'hashnode', 'wechat', 'zhihu', 'github', 'linkedin', 'medium', 'reddit'] as const;
export type PlatformId = typeof PLATFORM_IDS[number];
export const PLATFORM_ID_REGEX = /^[a-z0-9]+$/;
export const ADAPTED_STAGES: PipelineStage[] = ['04_adapted', '05_scheduled', '06_sent'];
```

## Constraints

- **No filesystem access**: Pure logic only
- **Platform IDs case-sensitive**: Only lowercase `[a-z0-9]+`
- **Deterministic**: Same input → same output

## Acceptance Criteria

| AC-ID | Criterion | Verification Method |
|-------|-----------|---------------------|
| AC-004 | Parse `my.first.post.devto.md` correctly in adapted stage | Unit test |
| AC-013 | PLATFORM_IDS all match `[a-z0-9]+`; reject "dev.to" | Unit test |
| AC-FP-001 | `buildArticleFilename("teaser", "x")` → `"teaser.x.md"` | Unit test |
| AC-FP-002 | `validateArticleName("x")` throws platform conflict | Unit test |
| AC-FP-003 | Inbox stage ignores platform suffix in filename | Unit test |

## Error Handling

- Invalid filename (no .md): `ReachforgeError`
- Invalid platform in build: `ReachforgeError`
- Article name = platform ID: `ReachforgeError`

## File Structure

```
src/
└── core/
    └── filename-parser.ts
```

## Test Module

**Test file**: `src/core/filename-parser.test.ts`

**Test scope**:
- **Unit**: `parseArticleFilename()` all edge cases, `buildArticleFilename()`, `isAdaptedStage()`, `validateArticleName()`
- **Fixtures**: None needed — pure functions
