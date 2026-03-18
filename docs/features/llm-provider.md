# Feature Spec: LLM Provider Abstraction (Superseded)

| Field        | Value                                              |
|--------------|----------------------------------------------------|
| **Component**| LLM Abstraction Layer                              |
| **Directory**| `src/llm/`                                         |
| **Priority** | P0                                                 |
| **SRS Refs** | FR-DRAFT-002, FR-DRAFT-005, FR-ADAPT-002           |
| **NFR Refs** | NFR-PERF-002                                       |
| **Status**   | **SUPERSEDED** by CLI Adapter Layer                |

---

## Supersession Notice

> **This feature spec has been superseded** by the LLM Adapter Layer design. The `LLMProvider` interface, `GeminiProvider`, and `LLMFactory` described below are replaced by the following components:
>
> - [CLI Adapter Core](cli-adapter-core.md) -- Unified `CLIAdapter` interface, child process spawning, output parsing
> - [Session Manager](session-manager.md) -- Per-stage session storage, resume, cleanup
> - [Skill Resolver](skill-resolver.md) -- Three-layer skill cascade resolution and injection
> - [Refine Command](refine-command.md) -- Interactive multi-turn conversation command
>
> The full technical design is at [LLM Adapter Tech Design](../llm-adapter/tech-design.md).

## What Changed

| Aspect | Before (This Spec) | After (Adapter Layer) |
|--------|--------------------|-----------------------|
| Interface | `LLMProvider` with `generate()` and `adapt()` | `CLIAdapter` with `execute()` and `probe()` |
| Implementation | `GeminiProvider` using `@google/generative-ai` SDK | `ClaudeAdapter`, `GeminiAdapter`, `CodexAdapter` using child process spawning |
| Factory | `LLMFactory.create(config)` | `AdapterFactory.create(config, stage, platform?)` |
| Prompts | Hardcoded `PLATFORM_PROMPTS` and `DEFAULT_DRAFT_PROMPT` | Skill files resolved via three-layer cascade |
| Sessions | None | Per-stage session files supporting multi-turn conversations |
| Token Usage | Hardcoded to 0 | Parsed from CLI structured output |
| Dependencies | `@google/generative-ai` npm package | Local CLI tools (claude, gemini, codex) |

## Migration Path

1. The `LLMProvider` interface in `src/llm/types.ts` is replaced by `CLIAdapter`.
2. The `GeminiProvider` in `src/llm/gemini.ts` is removed.
3. The `LLMFactory` in `src/llm/factory.ts` is replaced by `AdapterFactory`.
4. The `@google/generative-ai` dependency is removed from `package.json`.
5. `draftCommand` and `adaptCommand` are updated to use `AdapterFactory` and `CLIAdapter.execute()`.
6. Hardcoded prompt strings are moved to skill markdown files in `skills/`.

---

## Original Spec (Preserved for Reference)

### 1. Purpose and Scope

The LLM module abstracts all AI content generation and adaptation behind a common `LLMProvider` interface. This decouples the pipeline from Google Gemini, enabling future support for Anthropic Claude, local models (Ollama, llama.cpp), and other providers without modifying core or command code.

The module provides:
- `LLMProvider` interface defining `generate()` and `adapt()` contracts
- `LLMFactory` for provider instantiation based on configuration
- `GeminiProvider` as the default implementation
- `ClaudeProvider` and `LocalProvider` as stubs for future implementation

### 2. Files

| File | Responsibility | Max Lines |
|------|---------------|-----------|
| `llm/types.ts` | LLMProvider interface, GenerateOptions, AdaptOptions, LLMResult | 80 |
| `llm/factory.ts` | Factory function to create provider by config name | 50 |
| `llm/gemini.ts` | Google Gemini implementation | 150 |
| `llm/claude.ts` | Anthropic Claude implementation (stub) | 60 |
| `llm/local.ts` | Local model implementation (stub) | 60 |

### 3. TypeScript Interfaces

```typescript
// llm/types.ts

export interface LLMProvider {
  readonly name: string;

  generate(content: string, options: GenerateOptions): Promise<LLMResult>;
  adapt(content: string, options: AdaptOptions): Promise<LLMResult>;
}

export interface GenerateOptions {
  temperature?: number;       // Range: 0.0-1.0, default: 0.7
  maxTokens?: number;         // Range: 1-8192, default: 4096
  template?: string;          // Template name for custom prompts (P2)
  templateVars?: Record<string, string>;
}

export interface AdaptOptions {
  platform: string;           // Required. Target platform ID (e.g., 'x', 'devto')
  temperature?: number;       // Range: 0.0-1.0, default: 0.7
  maxTokens?: number;         // Range: 1-8192, default: 4096
  template?: string;          // Template name (P2)
  templateVars?: Record<string, string>;
}

export interface LLMResult {
  content: string;            // Generated/adapted text (non-empty on success)
  model: string;              // Model identifier (e.g., 'gemini-pro')
  provider: string;           // Provider name (e.g., 'gemini')
  tokenUsage: {
    prompt: number;           // Input tokens consumed (0 if unavailable)
    completion: number;       // Output tokens generated (0 if unavailable)
  };
}
```

---

*This spec is preserved for reference. All new development should follow the Adapter Layer specs listed above.*
