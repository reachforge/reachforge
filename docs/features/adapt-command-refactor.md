# Feature Spec: Adapt Command Refactor

| Field        | Value                                    |
|--------------|------------------------------------------|
| **Feature**  | Adapt Command -- Read from Drafts        |
| **Parent**   | [Tech Design](../pipeline-simplification/tech-design.md) |
| **Depends**  | [Pipeline Core](pipeline-simplification-core.md) |
| **Status**   | Implemented                              |
| **Date**     | 2026-03-27                               |

---

## 1. Scope

Refactor the `reach adapt` command to read source content from `01_drafts/` instead of `03_master/`, and write platform-adapted versions to `02_adapted/` instead of `04_adapted/`. Running `reach adapt` implicitly signals that the draft is approved for publishing -- no separate `reach approve` step is needed.

### Files Affected

| File | Change Type |
|------|-------------|
| `src/commands/adapt.ts` | Modify stage references |
| `src/mcp/tools.ts` | Update `AdaptToolSchema` description |
| `tests/unit/commands/commands.test.ts` | Update adapt tests |

---

## 2. Current Behavior

```typescript
// Read from 03_master
const masterFile = engine.getArticlePath('03_master', safeName);
if (!await fs.pathExists(masterFile)) {
  throw new Error(`Master article not found at 03_master/${safeName}.md`);
}
const content = await fs.readFile(masterFile, 'utf-8');

// Write to 04_adapted
const versionPath = engine.getArticlePath('04_adapted', safeName, platform);
await engine.writeArticleFile('04_adapted', safeName, result.content, platform);

// Update metadata
await engine.metadata.writeArticleMeta(safeName, {
  status: 'adapted',
  adapted_platforms: platforms,
});
```

The user flow is: `reach draft` -> `reach approve` -> `reach adapt`.

---

## 3. New Behavior

```typescript
// Read from 01_drafts
const draftFile = engine.getArticlePath('01_drafts', safeName);
if (!await fs.pathExists(draftFile)) {
  throw new Error(`Draft not found at 01_drafts/${safeName}.md. Run 'reach draft' first.`);
}
const content = await fs.readFile(draftFile, 'utf-8');

// Write to 02_adapted
const versionPath = engine.getArticlePath('02_adapted', safeName, platform);
await engine.writeArticleFile('02_adapted', safeName, result.content, platform);

// Update metadata
await engine.metadata.writeArticleMeta(safeName, {
  status: 'adapted',
  adapted_platforms: platforms,
});
```

The user flow simplifies to: `reach draft` -> `reach adapt`.

### Console Output Changes

```typescript
// BEFORE
console.log(chalk.green(`Adaptation complete! ${adapted}/${platforms.length} platforms. Check 04_adapted/`));

// AFTER
console.log(chalk.green(`Adaptation complete! ${adapted}/${platforms.length} platforms. Check 02_adapted/`));
```

Skip message:

```typescript
// BEFORE
console.log(chalk.yellow(`  ${safeName}.${platform}.md already exists, skipping (use --force to overwrite)`));

// AFTER (same message, different path internally)
```

### JSON Output Changes

```typescript
// BEFORE
process.stdout.write(jsonSuccess('adapt', {
  article: safeName,
  adaptedPlatforms: platforms,
  stage: '04_adapted' as const,
  items: adaptedItems,
}));

// AFTER
process.stdout.write(jsonSuccess('adapt', {
  article: safeName,
  adaptedPlatforms: platforms,
  stage: '02_adapted' as const,
  items: adaptedItems,
}));
```

### MCP Tool Updates

```typescript
// BEFORE
'reach.adapt': {
  description: 'Generate platform-specific versions from a master article in 03_master. ' +
    'Creates {article}.{platform}.md files in 04_adapted. ' +
    'Call this after reach.approve, before reach.schedule.',
  inputSchema: jsonSchema(AdaptToolSchema),
},

// AFTER
'reach.adapt': {
  description: 'Generate platform-specific versions from a draft in 01_drafts. ' +
    'Creates {article}.{platform}.md files in 02_adapted. ' +
    'Call this after reach.draft, before reach.schedule or reach.publish.',
  inputSchema: jsonSchema(AdaptToolSchema),
},
```

The `AdaptToolSchema` field descriptions also update:

```typescript
// BEFORE
export const AdaptToolSchema = z.object({
  article: z.string().min(1).describe('Name of the article in 03_master to adapt'),
  // ...
});

// AFTER
export const AdaptToolSchema = z.object({
  article: z.string().min(1).describe('Name of the article in 01_drafts to adapt'),
  // ...
});
```

---

## 4. Implementation Steps

1. **Update `src/commands/adapt.ts`**:
   - Change `'03_master'` to `'01_drafts'` in the source read path.
   - Change `'04_adapted'` to `'02_adapted'` in the output write path.
   - Update error message to reference `01_drafts`.
   - Update console output to reference `02_adapted`.
   - Update JSON output stage to `'02_adapted'`.

2. **Update `src/mcp/tools.ts`**:
   - Update `AdaptToolSchema` article description.
   - Update `reach.adapt` tool description.

3. **Update tests** to use new stage names.

---

## 5. Test Cases

### 5.1 Source Reading

| # | Test Case | Expected |
|---|-----------|----------|
| A1 | Article exists in `01_drafts` | Content read successfully |
| A2 | Article does not exist in `01_drafts` | Error: `Draft not found at 01_drafts/{article}.md` |
| A3 | Draft has content | LLM receives draft content for adaptation |

### 5.2 Output Writing

| # | Test Case | Expected |
|---|-----------|----------|
| A4 | Adapt creates platform files | `02_adapted/{article}.{platform}.md` files created |
| A5 | Existing platform file without `--force` | Skipped with warning |
| A6 | Existing platform file with `--force` | Overwritten |
| A7 | Multiple platforms adapted | All platform files in `02_adapted/` |

### 5.3 Metadata

| # | Test Case | Expected |
|---|-----------|----------|
| A8 | After adapt | `meta.yaml` has `status: 'adapted'` |
| A9 | `adapted_platforms` set | Metadata records which platforms were adapted |

### 5.4 Platform Resolution

| # | Test Case | Expected |
|---|-----------|----------|
| A10 | `--platforms devto,hashnode` | Only those platforms adapted |
| A11 | No `--platforms`, meta has `adapted_platforms` | Uses meta platforms |
| A12 | No `--platforms`, no meta, project.yaml has platforms | Uses project.yaml platforms |
| A13 | No `--platforms`, no meta, no project.yaml | Uses default platforms |

### 5.5 JSON Output

| # | Test Case | Expected |
|---|-----------|----------|
| A14 | `--json` flag | JSON envelope with `stage: '02_adapted'` |
