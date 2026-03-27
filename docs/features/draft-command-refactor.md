# Feature Spec: Draft Command Refactor

| Field        | Value                                    |
|--------------|------------------------------------------|
| **Feature**  | Draft Command -- Multi-Input Support     |
| **Parent**   | [Tech Design](../pipeline-simplification/tech-design.md) |
| **Depends**  | [Pipeline Core](pipeline-simplification-core.md) |
| **Status**   | Implemented                              |
| **Date**     | 2026-03-27                               |

---

## 1. Scope

Refactor the `reach draft` command to accept input directly (prompt string, file path, or directory) instead of requiring a source file in `01_inbox`. Add a `--name` option for explicit slug control.

### Files Affected

| File | Change Type |
|------|-------------|
| `src/commands/draft.ts` | Major rewrite |
| `src/mcp/tools.ts` | Update `DraftToolSchema` and description |
| `src/cli.ts` / `src/index.ts` | Update command registration |
| `tests/unit/commands/commands.test.ts` | Update draft tests |
| `tests/unit/commands/go.test.ts` | Update go tests (calls draft internally) |

---

## 2. Current Behavior

### CLI Signature

```
reach draft <source> [--json]
```

- `<source>` is the name of a file or directory in `01_inbox/`.
- The command looks for `01_inbox/{source}.md` (flat file) or `01_inbox/{source}/` (directory).
- If a directory, reads the first `.md`/`.txt` file by priority: `main.md` > `index.md` > alphabetical.
- Generates an AI draft and writes to `02_drafts/{article}.md`.
- The article name is derived from the source name (strip extension).

### Input Resolution

```typescript
// Current: only looks in 01_inbox
const flatPath = engine.getArticlePath('01_inbox', safeName);
const dirPath = path.join(engine.projectDir, '01_inbox', safeName);
```

### Error Case

```typescript
throw new Error(`Source "${safeName}" not found in 01_inbox`);
```

---

## 3. New Behavior

### CLI Signature

```
reach draft <input> [--name <slug>] [--json]
```

- `<input>` is one of three types, auto-detected:
  1. **File path**: resolves to an existing file on disk. Content is read from the file.
  2. **Directory path**: resolves to an existing directory. Content is read from the first `.md`/`.txt` file (same priority logic).
  3. **Prompt string**: does not resolve to a file or directory. Treated as an inline text prompt.
- `--name <slug>`: explicit article name. If omitted, auto-generated from input:
  - File path: basename without extension (e.g., `/path/to/my-idea.md` -> `my-idea`).
  - Directory path: directory name (e.g., `/path/to/my-idea/` -> `my-idea`).
  - Prompt string: slugified prompt (reuse `slugify()` from `go.ts`).
- Output is written to `01_drafts/{article}.md`.
- No inbox directory is involved.

### Input Detection Logic

```typescript
import * as path from 'path';
import fs from 'fs-extra';
import { slugify } from './go.js';
import { sanitizePath } from '../utils/path.js';

interface ResolvedInput {
  content: string;
  slug: string;
}

async function resolveInput(input: string): Promise<ResolvedInput> {
  // 1. Try as file path (absolute or relative)
  const resolved = path.resolve(input);
  try {
    const stats = await fs.stat(resolved);
    if (stats.isFile()) {
      const content = await fs.readFile(resolved, 'utf-8');
      const slug = sanitizePath(path.basename(resolved, path.extname(resolved)));
      return { content, slug };
    }
    if (stats.isDirectory()) {
      const content = await readDirectoryContent(resolved);
      const slug = sanitizePath(path.basename(resolved));
      return { content, slug };
    }
  } catch {
    // Not a valid path -- fall through to prompt mode
  }

  // 2. Treat as inline prompt
  const slug = slugify(input);
  return { content: input, slug };
}

async function readDirectoryContent(dirPath: string): Promise<string> {
  const files = await fs.readdir(dirPath);
  const sorted = files
    .filter(f => f.endsWith('.md') || f.endsWith('.txt'))
    .sort((a, b) => {
      const priority = (name: string) => {
        if (name === 'main.md') return 0;
        if (name === 'index.md') return 1;
        if (name.endsWith('.md')) return 2;
        return 3;
      };
      return priority(a) - priority(b);
    });

  if (sorted.length === 0) {
    throw new Error(`No .md or .txt files found in directory: ${dirPath}`);
  }

  return fs.readFile(path.join(dirPath, sorted[0]), 'utf-8');
}
```

### Full Command Implementation

```typescript
export async function draftCommand(
  engine: PipelineEngine,
  input: string,
  options: { name?: string; json?: boolean } = {},
): Promise<void> {
  await engine.initPipeline();

  // Resolve input type and content
  const { content, slug: autoSlug } = await resolveInput(input);
  const articleName = options.name ? sanitizePath(options.name) : autoSlug;

  if (!options.json) console.log(chalk.cyan(`Generating AI draft for "${articleName}"...`));

  if (!content.trim()) {
    throw new Error('Input is empty. Provide a prompt, file with content, or directory with .md/.txt files.');
  }

  const projectDir = engine.projectDir;
  const { adapter, resolver } = AdapterFactory.create('draft', { projectDir });
  const skills = await resolver.resolve('draft');

  const meta = await engine.metadata.readArticleMeta(articleName).catch(() => null);
  const templateResolver = new TemplateResolver(projectDir);
  const resolved = await templateResolver.resolveDraftPrompt(meta?.template);
  const prompt = `${resolved.prompt}\n\n${content}`;

  const result = await adapter.execute({
    prompt,
    cwd: projectDir,
    skillPaths: skills.map(s => s.path),
    sessionId: null,
    timeoutSec: 300,
    extraArgs: [],
  });

  if (!result.success) {
    const details = [
      result.errorMessage,
      result.errorCode ? `code: ${result.errorCode}` : null,
      result.exitCode !== null && result.exitCode !== 0 ? `exit: ${result.exitCode}` : null,
      !result.content ? 'LLM returned empty content' : null,
    ].filter(Boolean).join('; ');
    throw new Error(details || 'Draft generation failed (unknown reason)');
  }

  // Write to 01_drafts/{article}.md
  await engine.writeArticleFile('01_drafts', articleName, result.content);
  await engine.metadata.writeArticleMeta(articleName, { status: 'drafted' });

  if (options.json) {
    process.stdout.write(jsonSuccess('draft', {
      input,
      article: articleName,
      stage: '01_drafts' as const,
    }));
    return;
  }

  console.log(chalk.green(`Draft generated! Check 01_drafts/${articleName}.md`));
}
```

### MCP Tool Schema Update

```typescript
// BEFORE
export const DraftToolSchema = z.object({
  source: z.string().min(1).describe('Name of the file or directory in 01_inbox to draft from'),
});

// AFTER
export const DraftToolSchema = z.object({
  input: z.string().min(1).describe(
    'Content input: a free-text prompt, a file path (.md, .txt), or a directory path. ' +
    'File/directory content is read as source material. Plain text is used as a prompt.'
  ),
  name: z.string().optional().describe(
    'Explicit article name (slug). If omitted, auto-generated from input: ' +
    'file basename for files, directory name for dirs, slugified text for prompts.'
  ),
});
```

### MCP Tool Description Update

```typescript
'reach.draft': {
  description: 'Generate an AI draft article. Input can be a free-text prompt, a file path, or a directory path. ' +
    'Creates {article}.md in 01_drafts. Use "name" to set an explicit article name.',
  inputSchema: jsonSchema(DraftToolSchema),
},
```

---

## 4. Implementation Steps

1. **Extract `slugify()`** from `src/commands/go.ts` into a shared utility (e.g., `src/utils/slug.ts`) so both `draft.ts` and `go.ts` can import it. Alternatively, `draft.ts` can import directly from `go.ts` since it already exists there.

2. **Create `resolveInput()` and `readDirectoryContent()`** helper functions in `draft.ts`.

3. **Rewrite `draftCommand()`**:
   - Accept `input` instead of `source`.
   - Add `name` to options.
   - Replace inbox lookup with `resolveInput()`.
   - Write to `01_drafts/` instead of `02_drafts/`.

4. **Update CLI registration**:
   - Change argument from `<source>` to `<input>`.
   - Add `--name <slug>` option.

5. **Update MCP tools**:
   - Change `DraftToolSchema` field from `source` to `input`, add `name`.
   - Update tool description.

6. **Update `go.ts`**:
   - Instead of writing to `01_inbox` then calling `draftCommand(slug)`, call `draftCommand(prompt, { name: slug })` directly.
   - The prompt text is the input; the slug is the name.

---

## 5. Test Cases

### 5.1 Input Detection

| # | Test Case | Input | Expected |
|---|-----------|-------|----------|
| D1 | Prompt string (no file exists) | `"write about TypeScript"` | Content = input string, slug = `write-about-typescript` |
| D2 | Existing file path | `/tmp/my-idea.md` | Content = file contents, slug = `my-idea` |
| D3 | Existing directory | `/tmp/my-idea/` (contains `main.md`) | Content = `main.md` contents, slug = `my-idea` |
| D4 | Directory with multiple files | `/tmp/ideas/` (contains `index.md`, `notes.txt`) | Content = `index.md` contents (priority) |
| D5 | Empty directory | `/tmp/empty/` | Error: no .md or .txt files |
| D6 | Non-existent path | `/tmp/does-not-exist.md` | Treated as prompt string |
| D7 | Relative file path | `./my-idea.md` | Resolved to absolute, read as file |
| D8 | CJK prompt string | `"TypeScript tutorial"` (Chinese chars removed) | Falls back to hash-based slug |

### 5.2 `--name` Option

| # | Test Case | Expected |
|---|-----------|----------|
| N1 | `reach draft "prompt" --name my-post` | Article name is `my-post` |
| N2 | `reach draft ./file.md --name custom` | Article name is `custom` (not derived from filename) |
| N3 | `reach draft "prompt"` (no --name) | Article name auto-generated from prompt |

### 5.3 Draft Output

| # | Test Case | Expected |
|---|-----------|----------|
| O1 | Successful draft generation | File created at `01_drafts/{article}.md` |
| O2 | Metadata written | `meta.yaml` has `status: 'drafted'` for article |
| O3 | JSON output mode | JSON envelope with `input`, `article`, `stage: '01_drafts'` |
| O4 | Empty input after resolution | Error thrown |
| O5 | LLM failure | Error with details from adapter result |

### 5.4 Integration with Go Command

| # | Test Case | Expected |
|---|-----------|----------|
| G1 | `go` command calls `draftCommand(prompt, { name: slug })` | Draft created in `01_drafts` |
| G2 | `go` command no longer writes to `01_inbox` | `01_inbox` directory not created |
