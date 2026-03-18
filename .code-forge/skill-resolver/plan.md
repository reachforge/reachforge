# Implementation Plan: Skill Resolver

| Field | Value |
|-------|-------|
| **Feature** | Skill Resolver |
| **Spec** | `docs/features/skill-resolver.md` |
| **Status** | Planned |
| **Tasks** | 5 |
| **Test Count** | 21 |

## Dependency Graph

```
T01 (ResolvedSkill type)  ──┐
T02 (Built-in skill files) ──┼── T03 (resolve)
                              └── T04 (listAll + readSkillContent)
                                   └── T05 (exports)
```

## Tasks

### T01: ResolvedSkill type
- **Files**: `src/llm/types.ts`
- Add `ResolvedSkill` interface: `name`, `path`, `source` ("built-in" | "workspace" | "project")
- **Tests**: 1

### T02: Built-in skill files
- **Files**: `skills/stages/draft.md`, `skills/stages/adapt.md`, `skills/platforms/x.md`, `skills/platforms/devto.md`, `skills/platforms/wechat.md`, `skills/platforms/zhihu.md`, `skills/platforms/hashnode.md`
- 7 markdown files with platform-specific LLM instructions
- Replaces hardcoded `PLATFORM_PROMPTS` and `DEFAULT_DRAFT_PROMPT`
- **Tests**: 1

### T03: SkillResolver.resolve()
- **Files**: `src/llm/skills.ts`
- Three-layer cascade: project > workspace > built-in
- draft stage → `stages/draft.md`
- adapt stage → `stages/adapt.md` + `platforms/{platform}.md`
- **Tests**: 11

### T04: listAll() + readSkillContent()
- **Files**: `src/llm/skills.ts`
- `listAll()` — recursive scan, all layers, no dedup
- `readSkillContent()` — read with 100K truncation + error handling
- **Tests**: 7

### T05: Exports
- **Files**: `src/llm/index.ts`
- Export `SkillResolver`, `ResolvedSkill`
- **Tests**: 1

## Notes

- Built-in skills dir: project root `skills/` (bundled with CLI binary)
- Workspace skills: `{workspace}/skills/`
- Project skills: `{project}/skills/`
- Skills are markdown — injected into LLM prompt via adapter-specific mechanisms
- `readSkillContent()` truncates at 100K chars to prevent oversized prompts
