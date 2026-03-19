# Feature Spec: Skill Resolver

| Field        | Value                                              |
|--------------|----------------------------------------------------|
| **Component**| Skill Resolution Layer                             |
| **Directory**| `src/llm/skills.ts`                                |
| **Priority** | P0                                                 |
| **SRS Refs** | FR-ADAPT-002, FR-ADAPT-006 (replaces hardcoded prompts) |
| **NFR Refs** | NFR-MAINT-002 (extensible without core changes)    |
| **Tech Design** | [LLM Adapter Tech Design](../llm-adapter/tech-design.md) |

---

## 1. Purpose and Scope

The Skill Resolver implements a three-layer cascade for resolving skill markdown files that are injected into LLM prompts. Skills replace the hardcoded `PLATFORM_PROMPTS` and `DEFAULT_DRAFT_PROMPT` strings currently in `src/llm/types.ts`. This enables users to customize LLM behavior at the workspace or project level without modifying reachforge source code.

The three layers (highest priority first):
1. **Project skills** at `{project}/skills/` -- per-project overrides
2. **Workspace skills** at `{workspace}/skills/` -- shared across projects in a workspace
3. **Built-in skills** at `{cliRoot}/skills/` -- bundled with the reachforge binary

The module provides:
- `SkillResolver` class with `resolve()` and `listAll()` methods
- `ResolvedSkill` type
- Built-in skill file definitions for draft and adapt stages

## 2. Files

| File | Responsibility | Max Lines |
|------|---------------|-----------|
| `llm/skills.ts` | SkillResolver class, ResolvedSkill type, cascade resolution logic | 120 |
| `skills/stages/draft.md` | Built-in draft generation instructions | 50 |
| `skills/stages/adapt.md` | Built-in adaptation instructions | 30 |
| `skills/platforms/x.md` | Built-in X/Twitter formatting rules | 40 |
| `skills/platforms/devto.md` | Built-in Dev.to formatting rules | 30 |
| `skills/platforms/wechat.md` | Built-in WeChat formatting rules | 25 |
| `skills/platforms/zhihu.md` | Built-in Zhihu formatting rules | 25 |
| `skills/platforms/hashnode.md` | Built-in Hashnode formatting rules | 25 |

## 3. TypeScript Interfaces

```typescript
// Defined in llm/types.ts

export interface ResolvedSkill {
  /** Relative skill path (e.g., "stages/draft.md", "platforms/x.md"). */
  name: string;

  /** Absolute path to the resolved skill file. */
  path: string;

  /** Which layer provided this skill. */
  source: "built-in" | "workspace" | "project";
}
```

## 4. Method Signatures

```typescript
// llm/skills.ts

export class SkillResolver {
  /**
   * @param builtInDir - Absolute path to built-in skills directory ({cliRoot}/skills/).
   *   Must be absolute. If directory doesn't exist, built-in layer is empty.
   * @param workspaceDir - Absolute path to workspace root (skills at {workspaceDir}/skills/).
   *   May be empty string if no workspace context. If directory doesn't exist, workspace layer is empty.
   * @param projectDir - Absolute path to project root (skills at {projectDir}/skills/).
   *   May be empty string if no project context. If directory doesn't exist, project layer is empty.
   */
  constructor(
    builtInDir: string,
    workspaceDir: string,
    projectDir: string,
  );

  /**
   * Resolve skills for a given pipeline stage and optional platform.
   *
   * @param stage - "draft" or "adapt". Determines which stage skill to resolve.
   * @param platform - Target platform (e.g., "x", "devto"). Only used for adapt stage.
   *   If provided, resolves both the stage skill and the platform skill.
   * @returns Array of ResolvedSkill objects. May be empty if no skills found.
   *   For draft: returns [stages/draft.md] (if found).
   *   For adapt: returns [stages/adapt.md, platforms/{platform}.md] (if found).
   *   Each skill is resolved independently through the cascade.
   */
  async resolve(stage: string, platform?: string): Promise<ResolvedSkill[]>;

  /**
   * List all available skills across all three layers.
   * Returns all skills with their source layer, useful for diagnostics.
   *
   * @returns Array of all discoverable skills, ordered: project first, then workspace, then built-in.
   *   Does NOT deduplicate (shows all layers including shadowed skills).
   */
  async listAll(): Promise<ResolvedSkill[]>;

  /**
   * Read the content of a resolved skill file.
   *
   * @param skill - ResolvedSkill with an absolute path.
   * @returns File content as string. Empty string if file is unreadable.
   *   Logs warning if file cannot be read.
   *   Truncates to 100,000 characters if file is larger.
   */
  async readSkillContent(skill: ResolvedSkill): Promise<string>;
}
```

## 5. Logic Steps

### SkillResolver.constructor(builtInDir, workspaceDir, projectDir)

1. Store `builtInDir` as is. If empty string, built-in layer is disabled.
2. Compute `workspaceSkillsDir = workspaceDir ? path.join(workspaceDir, "skills") : ""`.
3. Compute `projectSkillsDir = projectDir ? path.join(projectDir, "skills") : ""`.
4. Store all three paths as private fields.

### SkillResolver.resolve(stage, platform?)

1. Determine which relative skill paths to resolve:
   ```typescript
   const relativePaths: string[] = [];
   if (stage === "draft") {
     relativePaths.push("stages/draft.md");
   } else if (stage === "adapt") {
     relativePaths.push("stages/adapt.md");
     if (platform) {
       relativePaths.push(`platforms/${platform}.md`);
     }
   }
   ```
   - If `stage` is neither "draft" nor "adapt": return `[]` (unknown stage, no skills).
   - If `stage` is "adapt" and `platform` is undefined: resolve only `stages/adapt.md`.

2. For each relative path, resolve through the cascade:
   ```typescript
   async function resolveOne(relativePath: string): ResolvedSkill | null {
     // Layer 3 (highest): project
     if (this.projectSkillsDir) {
       const candidate = path.join(this.projectSkillsDir, relativePath);
       if (await fileExists(candidate)) {
         return { name: relativePath, path: candidate, source: "project" };
       }
     }

     // Layer 2: workspace
     if (this.workspaceSkillsDir) {
       const candidate = path.join(this.workspaceSkillsDir, relativePath);
       if (await fileExists(candidate)) {
         return { name: relativePath, path: candidate, source: "workspace" };
       }
     }

     // Layer 1 (lowest): built-in
     if (this.builtInDir) {
       const candidate = path.join(this.builtInDir, relativePath);
       if (await fileExists(candidate)) {
         return { name: relativePath, path: candidate, source: "built-in" };
       }
     }

     return null;
   }
   ```
   Where `fileExists` is:
   ```typescript
   async function fileExists(filePath: string): Promise<boolean> {
     try {
       const stat = await fs.stat(filePath);
       return stat.isFile();
     } catch {
       return false;
     }
   }
   ```

3. Collect non-null results into the output array.
4. Return the array (may be empty).

### SkillResolver.listAll()

1. Initialize `results: ResolvedSkill[]`.
2. For each layer (project, workspace, built-in) that has a non-empty directory:
   a. Check if the directory exists.
   b. Recursively scan for `.md` files.
   c. For each `.md` file found:
      - Compute relative path from the skills root.
      - Add `{ name: relativePath, path: absolutePath, source: layerName }`.
3. Return results ordered: project first, workspace second, built-in last.
4. Do NOT deduplicate. The caller can see which skills are shadowed.

### SkillResolver.readSkillContent(skill)

1. Verify `skill.path` is an absolute path and exists.
2. Read file: `const content = await fs.readFile(skill.path, "utf-8")`.
   - If read error: log `console.warn("Warning: Could not read skill file ${skill.path}: ${reason}")`, return `""`.
3. If `content.length > 100_000`: truncate to 100,000 chars, log warning.
4. Return content.

## 6. Built-in Skill Definitions

### skills/stages/draft.md

```markdown
# Draft Generation Skill

You are an expert content strategist and technical writer. Your task is to expand
the provided idea or outline into a comprehensive, high-quality long-form article.

## Requirements

- Output in clean Markdown format with proper headings (H2, H3)
- Include an engaging introduction that hooks the reader
- Develop each point with examples, code snippets (if technical), and explanations
- Add a conclusion with key takeaways
- Aim for 1500-3000 words depending on topic complexity
- Use a professional but approachable tone
- Do NOT include a title (the user will add their own)

## Input

The content below is the raw idea or outline to expand:
```

### skills/stages/adapt.md

```markdown
# Platform Adaptation Skill

You are a social media content expert. Your task is to rewrite the provided article
for a specific target platform, following that platform's conventions and best practices.

## General Rules

- Preserve the core message and key points from the original
- Adapt tone, length, and formatting for the target platform
- Do NOT add information not present in the original article
- Output ONLY the adapted content, no meta-commentary

## Input

The article to adapt is provided below:
```

### skills/platforms/x.md

```markdown
# X (Twitter) Platform Skill

Rewrite the content as a high-engagement X/Twitter thread.

## Format Rules

- Each tweet MUST be under 280 characters (including spaces, punctuation, emojis)
- Separate tweets with `---` on its own line
- First tweet should hook the reader (question, bold statement, or surprising fact)
- Use short paragraphs (1-2 sentences per tweet)
- End thread with a call to action or summary tweet
- Use 1-3 relevant hashtags in the final tweet only
- Do NOT use hashtags in every tweet

## Example Format

This is the first tweet of the thread. It hooks the reader.

---

This is the second tweet. It expands on the main point.

---

Final tweet with a takeaway. #topic
```

### skills/platforms/devto.md

```markdown
# Dev.to Platform Skill

Rewrite the content as a Dev.to article with proper frontmatter.

## Format Rules

- Start with YAML frontmatter: title, published (false), tags (up to 4)
- Use Markdown headings (H2, H3) for structure
- Include code blocks with language tags where relevant
- Add a cover_image field in frontmatter if applicable
- Keep paragraphs short (3-5 sentences)
- Use the Dev.to liquid tags format for embeds: {% embed url %}
- Tone: friendly, educational, developer-to-developer
```

### skills/platforms/wechat.md

```markdown
# WeChat Official Account Platform Skill

Rewrite the content as a formal WeChat Official Account article.

## Format Rules

- Use a structured format with clear section headings
- Professional, authoritative tone
- Include a brief summary/abstract at the beginning
- Use numbered lists for key points
- Paragraphs should be 2-4 sentences
- Output in Chinese if the original is in Chinese; otherwise in the original language
- Add section dividers between major sections
```

### skills/platforms/zhihu.md

```markdown
# Zhihu Platform Skill

Rewrite the content as a Zhihu answer or column article.

## Format Rules

- Deep-dive, analytical format
- Include personal insights and professional experience
- Use data and references where possible
- Structured with clear headings
- Start with a direct answer or thesis statement
- Professional but conversational tone
- Output in Chinese if the original is in Chinese; otherwise in the original language
```

### skills/platforms/hashnode.md

```markdown
# Hashnode Platform Skill

Rewrite the content as a Hashnode blog post.

## Format Rules

- Start with an H1 title
- Include SEO-friendly headings (H2, H3)
- Add a brief introduction (2-3 sentences)
- Include code snippets with language tags
- Add key takeaways section at the end
- Use bullet points for lists of items
- Tone: educational, helpful, developer-focused
```

## 7. Adapter-Specific Skill Injection

After resolving skills, the adapter layer injects them differently per CLI tool:

### Claude Injection

1. Create temp directory: `mkdtemp("reachforge-skills-")`.
2. Create `.claude/skills/` inside temp dir.
3. For each resolved skill:
   - Copy the skill file to `{tmpdir}/.claude/skills/{skillName}`.
   - (Use copy, not symlink, since the temp dir is short-lived.)
4. Pass `--add-dir {tmpdir}` to the claude command.
5. Additionally, prepend skill content to the stdin prompt.
6. Delete temp dir in `finally` block.

### Gemini Injection

1. Target: `~/.gemini/skills/`.
2. Create the directory if it doesn't exist.
3. For each resolved skill:
   - Create symlink: `~/.gemini/skills/{skillBaseName} -> {skill.path parent dir}`.
   - If symlink already exists pointing to the same target: skip.
   - If symlink exists pointing elsewhere: skip (do not overwrite user's own skills).
   - If a regular file/directory exists with the same name: skip.
4. Additionally, prepend skill content to the prompt text (positional arg).

### Codex Injection

1. Target: `~/.codex/skills/`.
2. Same symlink logic as Gemini.
3. Additionally, prepend skill content to the stdin prompt.

### Prompt Prepending

For all adapters, the skill content is prepended to the user's prompt:

```typescript
function buildFullPrompt(skills: ResolvedSkill[], userPrompt: string, resolver: SkillResolver): string {
  const parts: string[] = [];
  for (const skill of skills) {
    const content = await resolver.readSkillContent(skill);
    if (content) parts.push(content);
  }
  parts.push(userPrompt);
  return parts.join("\n\n---\n\n");
}
```

## 8. Error Handling

| Error Condition                      | Behavior                                          | Recovery |
|--------------------------------------|---------------------------------------------------|----------|
| Built-in skills directory missing    | Warning logged, layer skipped                     | Reinstall reachforge |
| Workspace skills directory missing   | Silent skip (normal for projects without custom skills) | N/A |
| Project skills directory missing     | Silent skip (normal)                              | N/A |
| Skill file unreadable (permissions)  | Warning logged, skill skipped                     | Fix permissions |
| Skill file too large (>100KB)        | Truncated to 100K chars, warning logged           | Reduce skill size |
| Empty skill file                     | Warning logged, skill skipped                     | Add content or remove |
| Invalid stage name                   | Return empty array (no skills)                    | Fix caller |
| Invalid platform name                | Platform skill not found (only stage skill returned) | Fix platform name |

## 9. Test Scenarios

### Unit Tests (`llm/__tests__/skills.test.ts`)

1. `resolve("draft")` returns built-in `stages/draft.md` when only built-in exists
2. `resolve("draft")` returns project `stages/draft.md` when project overrides built-in
3. `resolve("draft")` returns workspace `stages/draft.md` when workspace overrides built-in
4. `resolve("draft")` returns project skill when all three layers have the same file
5. `resolve("adapt", "x")` returns both `stages/adapt.md` and `platforms/x.md`
6. `resolve("adapt", "x")` returns only `stages/adapt.md` when `platforms/x.md` doesn't exist in any layer
7. `resolve("adapt")` without platform returns only `stages/adapt.md`
8. `resolve("unknown")` returns empty array for unknown stage
9. `resolve("adapt", "nonexistent")` returns only `stages/adapt.md`
10. `resolve()` with empty built-in dir returns only workspace/project skills
11. `resolve()` with all dirs empty returns empty array
12. `listAll()` returns skills from all three layers without deduplication
13. `listAll()` returns empty array when no skill directories exist
14. `readSkillContent()` returns file content for valid skill
15. `readSkillContent()` returns empty string for unreadable file
16. `readSkillContent()` truncates content exceeding 100K characters
17. Skill file at project layer shadows same file at workspace layer
18. Skill file at workspace layer shadows same file at built-in layer

### Mock Strategy

- Create temp directories with skill files for each test.
- Use `fs-extra.ensureDir` and `fs-extra.writeFile` to set up fixtures.
- Test cascade by creating overlapping skill files in different layer directories.

## 10. Dependencies

| Dependency | Direction | Purpose |
|-----------|-----------|---------|
| `node:fs/promises` | Node built-in | File existence checks, reading skill files |
| `node:path` | Node built-in | Path construction and resolution |
| `llm/types.ts` | Imports from | ResolvedSkill interface |
| `llm/factory.ts` | Imported by | Factory creates SkillResolver and calls resolve() |
| `commands/draft.ts` | Consumed by | Uses resolved skills for draft prompt |
| `commands/adapt.ts` | Consumed by | Uses resolved skills for adaptation prompt |

---

*SRS Traceability: FR-ADAPT-002 (platform-specific adaptation prompts -- now via skill files instead of hardcoded strings), FR-ADAPT-006 (X thread formatting -- now in skills/platforms/x.md), NFR-MAINT-002 (new platforms added by creating a skill file, no core code changes). This component also aligns with the direction of FR-TMPL-001 through FR-TMPL-004 (Template System), providing a simpler, file-based alternative that works with CLI adapters.*
