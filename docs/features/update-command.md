# Feature Spec: Update Command

| Field          | Value                                          |
|----------------|------------------------------------------------|
| **Document**   | Feature Spec v1.0                              |
| **Date**       | 2026-03-27                                     |
| **Tech Design** | [Update Command Tech Design](../update-command/tech-design.md) |
| **Depends On** | [update-schema-changes.md](update-schema-changes.md), [update-publish-id-capture.md](update-publish-id-capture.md), [update-provider-methods.md](update-provider-methods.md) |
| **Priority**   | P0                                             |
| **Status**     | Draft                                          |

---

## Summary

New command `reach update --article <article>` that pushes content changes to already-published platforms using their update APIs. Reads updated content from `02_adapted/` (preferred) or `03_published/`, resolves stored `article_id` from meta.yaml, and calls each provider's `update()` method. Includes MCP tool integration, CLI registration, and help text.

---

## 1. CLI Signature

```
reach update --article <article> [--platforms <list>] [--dryRun] [--json] [--force] [--cover <path>]
```

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `--article` | string | Yes | — | Pipeline article name (slug from meta.yaml) |
| `--platforms` | string | No | All published platforms | Comma-separated platform filter |
| `--dryRun` | boolean | No | false | Preview without calling APIs |
| `--json` | boolean | No | false | JSON output envelope |
| `--force` | boolean | No | false | Skip platforms missing `article_id` instead of erroring |
| `--cover` | string | No | — | Cover image path or URL |

---

## 2. Command Module

**New file**: `src/commands/update.ts`

### Exports

```typescript
export interface UpdateOptions {
  article: string;
  platforms?: string;
  dryRun?: boolean;
  json?: boolean;
  force?: boolean;
  cover?: string;
  config?: ReachforgeConfig;
}

export async function updateCommand(
  engine: PipelineEngine,
  options: UpdateOptions,
): Promise<void>;
```

### Full Implementation Flow

```typescript
export async function updateCommand(
  engine: PipelineEngine,
  options: UpdateOptions,
): Promise<void> {
  const { article } = options;
  await engine.initPipeline();

  // --- Step 1: Resolve article metadata ---
  const articleMeta = await engine.metadata.readArticleMeta(article);
  if (!articleMeta) {
    throw new ReachforgeError(
      `Article "${article}" not found in meta.yaml`,
      'Check the article name with: reach status',
    );
  }

  if (articleMeta.status !== 'published') {
    throw new ReachforgeError(
      `Article "${article}" has not been published yet (status: ${articleMeta.status})`,
      'Publish first with: reach publish --article ' + article,
    );
  }

  // --- Step 2: Determine updatable platforms ---
  const allPlatforms = articleMeta.platforms ?? {};
  const platformFilter = parsePlatformFilter(options.platforms);

  // Filter to platforms with status=success AND article_id present
  const updatable: Array<{ platform: string; articleId: string; url?: string }> = [];
  const missingId: string[] = [];
  const notPublished: string[] = [];

  for (const [platform, status] of Object.entries(allPlatforms)) {
    if (platformFilter && !platformFilter.includes(platform)) continue;

    if (status.status !== 'success') {
      notPublished.push(platform);
      continue;
    }

    if (!status.article_id) {
      missingId.push(platform);
      continue;
    }

    updatable.push({ platform, articleId: status.article_id, url: status.url });
  }

  // Handle missing IDs
  if (missingId.length > 0 && !options.force) {
    throw new ReachforgeError(
      `${missingId.length} platform(s) lack article_id: ${missingId.join(', ')}`,
      'These were published before ID capture was added. Use --force to skip them, or manually add article_id to meta.yaml.',
    );
  }

  if (updatable.length === 0) {
    const reasons: string[] = [];
    if (missingId.length > 0) reasons.push(`${missingId.join(', ')} lack article_id`);
    if (notPublished.length > 0) reasons.push(`${notPublished.join(', ')} not successfully published`);
    throw new ReachforgeError(
      `No updatable platforms for "${article}"`,
      reasons.length > 0 ? reasons.join('; ') : 'Article has no published platforms',
    );
  }

  // --- Step 3: Read content ---
  const contentByPlatform: Record<string, string> = {};
  for (const { platform } of updatable) {
    const content = await readContentForUpdate(engine, article, platform);
    if (!content) {
      throw new ReachforgeError(
        `No content found for "${article}" on platform "${platform}"`,
        `Expected file: ${article}.${platform}.md in 02_adapted/ or 03_published/. Run 'reach adapt --article ${article}' first.`,
      );
    }
    contentByPlatform[platform] = content;
  }

  // --- Step 4: Validate ---
  const validation = validateContent(contentByPlatform);
  if (!validation.allValid) {
    if (options.json) {
      process.stdout.write(jsonSuccess('update', {
        updated: [], failed: [], skipped: [article],
      }));
      return;
    }
    console.log(chalk.red(`  Validation failed for "${article}":`));
    for (const [platform, result] of Object.entries(validation.results)) {
      if (!result.valid) {
        result.errors.forEach(err => console.log(chalk.red(`     ${platform}: ${err}`)));
      }
    }
    return;
  }

  // --- Step 5: Dry run ---
  if (options.dryRun) {
    if (options.json) {
      process.stdout.write(jsonSuccess('update', {
        updated: [], failed: [], skipped: updatable.map(u => u.platform),
      }));
      return;
    }
    console.log(chalk.yellow(`[DRY RUN] Would update "${article}" on: ${updatable.map(u => u.platform).join(', ')}`));
    for (const { platform, articleId } of updatable) {
      console.log(chalk.dim(`  ${platform}: article_id=${articleId}`));
    }
    return;
  }

  // --- Step 6: Update each platform ---
  if (!options.json) {
    console.log(chalk.cyan(`Updating: ${article}`));
  }

  const config = options.config || {};
  const loader = new ProviderLoader(config);

  const jsonUpdated: Array<{ article: string; platform: string; status: 'success'; url?: string }> = [];
  const jsonFailed: Array<{ article: string; platform: string; status: 'failed'; error?: string }> = [];
  const jsonSkipped: string[] = [];

  // Resolve cover image
  const sampleContent = Object.values(contentByPlatform)[0] ?? '';
  const coverImagePath = resolveCoverImage(options, sampleContent, articleMeta);

  for (const { platform, articleId } of updatable) {
    const provider = loader.getProviderOrMock(platform);

    // Check if provider supports update
    if (typeof provider.update !== 'function') {
      if (!options.json) {
        console.log(chalk.yellow(`  Platform "${platform}" does not support updates. Skipping.`));
      }
      jsonSkipped.push(platform);
      continue;
    }

    if (!options.json) {
      if (provider.id === 'mock') {
        console.log(chalk.yellow(`  [MOCK] ${platform} -- no API key, using mock provider`));
      } else {
        console.log(chalk.dim(`  Updating ${platform} via ${provider.name}...`));
      }
    }

    // Format content
    let content = contentByPlatform[platform];

    // Process media and assets (same as publish flow)
    const projectDir = engine.projectDir;
    const assetManager = new AssetManager(projectDir);
    content = assetManager.resolveAssetReferences(content);

    const formatted = provider.contentFormat === 'html'
      ? markdownToHtml(content)
      : provider.formatContent(content);

    // Build meta
    const publishMeta: PublishMeta = {
      ...(coverImagePath ? { coverImage: coverImagePath } : {}),
    };

    try {
      const result = await provider.update(articleId, formatted, publishMeta);

      if (result.status === 'success') {
        // Update meta.yaml: new url (if changed), updated_at, preserve article_id
        await engine.metadata.updatePlatformStatus(article, platform, {
          url: result.url,
          article_id: result.articleId ?? articleId,
          updated_at: new Date().toISOString(),
        });

        jsonUpdated.push({ article, platform, status: 'success', url: result.url });
        if (!options.json) console.log(chalk.green(`  ${platform}: ${result.url}`));
      } else {
        jsonFailed.push({ article, platform, status: 'failed', error: result.error });
        if (!options.json) console.log(chalk.red(`  ${platform}: ${result.error}`));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      jsonFailed.push({ article, platform, status: 'failed', error: message });
      if (!options.json) console.log(chalk.red(`  ${platform}: ${message}`));
    }
  }

  // --- Step 7: Summary ---
  if (missingId.length > 0 && options.force && !options.json) {
    console.log(chalk.yellow(`  Skipped (no article_id): ${missingId.join(', ')}`));
  }

  printUpdateSummary(jsonUpdated, jsonFailed, jsonSkipped, article, !!options.json);

  if (options.json) {
    process.stdout.write(jsonSuccess('update', {
      updated: jsonUpdated,
      failed: jsonFailed,
      skipped: [...jsonSkipped, ...missingId],
    }));
  }
}
```

---

## 3. Content Source Resolution

```typescript
async function readContentForUpdate(
  engine: PipelineEngine,
  article: string,
  platform: string,
): Promise<string | null> {
  // Priority 1: 02_adapted (user has edited post-publish)
  const adaptedPath = engine.getArticlePath('02_adapted', article, platform);
  if (await fs.pathExists(adaptedPath)) {
    return fs.readFile(adaptedPath, 'utf-8');
  }

  // Priority 2: 03_published (original published version)
  const publishedPath = engine.getArticlePath('03_published', article, platform);
  if (await fs.pathExists(publishedPath)) {
    return fs.readFile(publishedPath, 'utf-8');
  }

  return null;
}
```

This supports both user workflow paths:
- **Path A (quick edit)**: User directly edits `02_adapted/article.devto.md` -> content is read from `02_adapted/`.
- **Path B (full pipeline)**: User edits draft -> runs `reach adapt --article article` -> adapted files land in `02_adapted/` -> content is read from there.

---

## 4. Summary Printer

```typescript
function printUpdateSummary(
  updated: Array<{ platform: string; url?: string }>,
  failed: Array<{ platform: string; error?: string }>,
  skipped: string[],
  articleLabel: string,
  json: boolean,
): void {
  if (json) return;
  if (updated.length === 0 && failed.length === 0) return;

  console.log('');
  if (updated.length > 0) {
    console.log(chalk.green(`  "${articleLabel}" updated on ${updated.length} platform(s):`));
    for (const r of updated) {
      console.log(chalk.dim(`     ${r.platform}: `) + (r.url ?? ''));
    }
  }
  if (failed.length > 0) {
    console.log(chalk.red(`  ${failed.length} platform(s) failed:`));
    for (const r of failed) {
      console.log(chalk.red(`     ${r.platform}: ${r.error ?? 'unknown error'}`));
    }
  }
}
```

---

## 5. CLI Registration

**File**: Main CLI entry point (Commander.js program definition)

```typescript
program
  .command('update')
  .description('Update a published article on its platforms')
  .option('--article <name>', 'Article name (slug from meta.yaml)')
  .option('--platforms <list>', 'Comma-separated platform filter')
  .option('--dryRun', 'Preview without executing')
  .option('--force', 'Skip platforms without article_id')
  .option('--json', 'JSON output')
  .option('--cover <path>', 'Cover image path or URL')
  .action(async (opts) => {
    const engine = await resolveEngine();
    await updateCommand(engine, { ...opts, config });
  });
```

---

## 6. MCP Integration

**File**: `src/mcp/tools.ts`

### Schema

```typescript
export const UpdateToolSchema = z.object({
  article: z.string().min(1).describe('Name of the published article to update on platforms'),
  platforms: z.string().optional().describe('Comma-separated platform filter. Default: all published platforms with article_id'),
  dryRun: z.boolean().optional().describe('If true, preview what would be updated without calling APIs'),
  force: z.boolean().optional().describe('If true, skip platforms without article_id instead of erroring'),
  cover: z.string().optional().describe('Cover image path or URL'),
});
```

### Tool Metadata

```typescript
'reach.update': {
  description: 'Update an already-published article on its platforms. Reads updated content from 02_adapted (or 03_published) and pushes changes via platform update APIs. Only works for pipeline articles with stored article_id.',
  inputSchema: jsonSchema(UpdateToolSchema),
},
```

### Legacy MCP Export

Add to the `schemaMap` in `MCP_TOOL_DEFINITIONS`:

```typescript
'reach.update': UpdateToolSchema,
```

---

## 7. Help Text

**File**: `src/help.ts`

Add to the "Pipeline" group:

```
reach update --article <article>     # Update published article on platforms
```

Add to the detailed `--help --all` output:

```
UPDATE
  reach update --article <article>    Update a published article on its platforms
    --platforms <list>                Comma-separated platform filter
    --dryRun                          Preview without executing
    --force                           Skip platforms without article_id
    --json                            JSON output
    --cover <path>                    Cover image path or URL
```

---

## 8. JSON Output Envelope

```json
{
  "jsonVersion": 1,
  "command": "update",
  "success": true,
  "data": {
    "updated": [
      { "article": "my-article", "platform": "devto", "status": "success", "url": "https://dev.to/user/my-article" },
      { "article": "my-article", "platform": "hashnode", "status": "success", "url": "https://blog.example.com/my-article" }
    ],
    "failed": [],
    "skipped": ["github"]
  }
}
```

Error envelope (article not found):
```json
{
  "jsonVersion": 1,
  "command": "update",
  "success": false,
  "error": "Article \"missing-article\" not found in meta.yaml"
}
```

---

## 9. Error Cases

| # | Condition | Message | Hint |
|---|-----------|---------|------|
| E1 | Article not in meta.yaml | `Article "X" not found in meta.yaml` | `Check the article name with: reach status` |
| E2 | Article not published | `Article "X" has not been published yet (status: adapted)` | `Publish first with: reach publish --article X` |
| E3 | No platforms with article_id (no --force) | `N platform(s) lack article_id: devto, hashnode` | `Use --force to skip them, or manually add article_id to meta.yaml` |
| E4 | No updatable platforms at all | `No updatable platforms for "X"` | Lists reasons |
| E5 | Content file missing | `No content found for "X" on platform "devto"` | `Run 'reach adapt --article X' first` |
| E6 | Provider lacks update() | Warning: `Platform "x" does not support updates. Skipping.` | (non-fatal, continues) |
| E7 | API failure | Per-platform failure in results | Other platforms continue |
| E8 | No engine (outside project) | `No project context` | `Run from inside a project directory` |

---

## 10. Test Cases

### Unit Tests (`tests/unit/update-command.test.ts`)

```typescript
describe('updateCommand()', () => {
  it('throws if article not in meta.yaml', async () => {
    // Setup: empty meta.yaml
    await expect(updateCommand(engine, { article: 'missing' }))
      .rejects.toThrow('not found in meta.yaml');
  });

  it('throws if article not published', async () => {
    // Setup: article with status 'adapted'
    await expect(updateCommand(engine, { article: 'draft-only' }))
      .rejects.toThrow('has not been published yet');
  });

  it('throws if no platforms have article_id (without --force)', async () => {
    // Setup: article published, platforms.devto has no article_id
    await expect(updateCommand(engine, { article: 'no-ids' }))
      .rejects.toThrow('lack article_id');
  });

  it('skips platforms without article_id when --force is set', async () => {
    // Setup: devto has article_id, hashnode does not
    // Verify: only devto is updated, hashnode appears in skipped
  });

  it('prefers 02_adapted content over 03_published', async () => {
    // Setup: same article exists in both directories with different content
    // Verify: content from 02_adapted is sent to provider
  });

  it('falls back to 03_published if 02_adapted missing', async () => {
    // Setup: article only in 03_published
    // Verify: content from 03_published is sent to provider
  });

  it('throws if content file missing for target platform', async () => {
    // Setup: article_id exists for devto, but no devto.md file
    await expect(updateCommand(engine, { article: 'no-content' }))
      .rejects.toThrow('No content found');
  });

  it('updates meta.yaml with updated_at on success', async () => {
    // Setup: mock provider, article with article_id
    // Run update
    // Verify: meta.yaml platforms.mock.updated_at is set
  });

  it('preserves article_id after update', async () => {
    // Setup: article with article_id '42'
    // Run update
    // Verify: article_id still '42' (or updated if provider returns new one)
  });

  it('updates URL if provider returns new one', async () => {
    // Setup: article with url 'old-url'
    // Mock provider returns url 'new-url' from update
    // Verify: meta.yaml url is 'new-url'
  });

  it('applies platform filter', async () => {
    // Setup: article published to devto + hashnode
    // Run with --platforms devto
    // Verify: only devto updated
  });

  it('dry run does not call provider', async () => {
    // Setup: article with article_id
    // Run with --dryRun
    // Verify: provider.update() never called
  });

  it('produces correct JSON output', async () => {
    // Setup: mock provider
    // Run with --json
    // Verify: stdout contains jsonVersion, command, success, data
  });

  it('continues on per-platform failure', async () => {
    // Setup: devto update fails, hashnode update succeeds
    // Verify: hashnode appears in updated, devto in failed
  });

  it('skips platform when provider has no update() method', async () => {
    // Setup: article published to x (PostizProvider has no update)
    // Verify: x appears in skipped with warning
  });
});
```

### Integration Tests (`tests/integration/update.test.ts`)

```typescript
describe('update integration', () => {
  it('publish then update roundtrip', async () => {
    // 1. Publish article (mock provider captures article_id)
    // 2. Edit content in 02_adapted/
    // 3. Run reach update --article article
    // 4. Verify mock provider.update() called with correct content and article_id
    // 5. Verify meta.yaml updated_at is set
  });

  it('MCP tool schema present', async () => {
    // Verify TOOL_METADATA['reach.update'] exists
    // Verify inputSchema has article (required), platforms, dryRun, force, cover
  });
});
```

---

## 11. Dependencies

| Dependency | Source | Used For |
|------------|--------|----------|
| `PipelineEngine` | `src/core/pipeline.ts` | File operations, metadata |
| `MetadataManager` | `src/core/metadata.ts` | Read/write article meta, `updatePlatformStatus()` |
| `ProviderLoader` | `src/providers/loader.ts` | Get provider instances |
| `validateContent` | `src/validators/runner.ts` | Pre-update validation |
| `AssetManager` | `src/core/asset-manager.ts` | Resolve @assets/ references |
| `markdownToHtml` | `src/utils/markdown.ts` | Format conversion for HTML providers |
| `parsePlatformFilter` | `src/commands/publish.ts` | Parse --platforms option |
| `resolveCoverImage` | `src/commands/publish.ts` | Cover image resolution |
| `jsonSuccess` | `src/core/json-output.ts` | JSON output envelope |
| `ReachforgeError` | `src/types/index.ts` | User-facing errors |
| `chalk` | External | CLI output coloring |
| `fs-extra` | External | File existence checks |
