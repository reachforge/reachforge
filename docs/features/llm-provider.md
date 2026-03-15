# Feature Spec: LLM Provider Abstraction

| Field        | Value                                      |
|--------------|--------------------------------------------|
| **Component**| LLM Abstraction Layer                      |
| **Directory**| `src/llm/`                                 |
| **Priority** | P0                                         |
| **SRS Refs** | FR-DRAFT-002, FR-DRAFT-005, FR-ADAPT-002   |
| **NFR Refs** | NFR-PERF-002                               |

---

## 1. Purpose and Scope

The LLM module abstracts all AI content generation and adaptation behind a common `LLMProvider` interface. This decouples the pipeline from Google Gemini, enabling future support for Anthropic Claude, local models (Ollama, llama.cpp), and other providers without modifying core or command code.

The module provides:
- `LLMProvider` interface defining `generate()` and `adapt()` contracts
- `LLMFactory` for provider instantiation based on configuration
- `GeminiProvider` as the default implementation
- `ClaudeProvider` and `LocalProvider` as stubs for future implementation

## 2. Files

| File | Responsibility | Max Lines |
|------|---------------|-----------|
| `llm/types.ts` | LLMProvider interface, GenerateOptions, AdaptOptions, LLMResult | 80 |
| `llm/factory.ts` | Factory function to create provider by config name | 50 |
| `llm/gemini.ts` | Google Gemini implementation | 150 |
| `llm/claude.ts` | Anthropic Claude implementation (stub) | 60 |
| `llm/local.ts` | Local model implementation (stub) | 60 |

## 3. TypeScript Interfaces

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

## 4. Method Signatures

### LLMFactory

```typescript
// llm/factory.ts

export class LLMFactory {
  /**
   * Creates an LLM provider based on config.
   * @param config - ConfigManager with loaded credentials
   * @returns LLMProvider instance
   * @throws ConfigError if provider name is unknown
   * @throws LLMApiKeyError if required API key is missing
   */
  static create(config: ConfigManager): LLMProvider;
}
```

### GeminiProvider

```typescript
// llm/gemini.ts

export class GeminiProvider implements LLMProvider {
  constructor(apiKey: string, modelName?: string);

  readonly name: string; // 'gemini'

  async generate(content: string, options: GenerateOptions): Promise<LLMResult>;
  async adapt(content: string, options: AdaptOptions): Promise<LLMResult>;
}
```

## 5. Logic Steps

### LLMFactory.create(config)

1. Read provider name from `config.getLLMProvider()` (defaults to `'gemini'`)
2. Switch on provider name:
   - `'gemini'`:
     a. Get API key via `config.getApiKey('gemini')`
     b. If no key: throw `LLMApiKeyError('Gemini')`
     c. Return `new GeminiProvider(apiKey)`
   - `'claude'`:
     a. Get API key via `config.getApiKey('anthropic')`
     b. If no key: throw `LLMApiKeyError('Claude')`
     c. Return `new ClaudeProvider(apiKey)`
   - `'local'`:
     a. Get URL from `APHYPE_LOCAL_LLM_URL` env var
     b. If no URL: throw `ConfigError('APHYPE_LOCAL_LLM_URL is required for local LLM provider')`
     c. Return `new LocalProvider(url)`
   - default: throw `ConfigError('Unknown LLM provider: {name}. Supported: gemini, claude, local')`

### GeminiProvider.generate(content, options)

1. Get generative model instance: `client.getGenerativeModel({ model: modelName })`
2. Build prompt:
   ```
   You are an expert content strategist. Expand the following idea into a
   comprehensive, high-quality long-form article. Output in Markdown format.

   IDEA: {content}
   ```
3. If `options.template` is set: load template and substitute variables (P2, fall back to default prompt)
4. Call `model.generateContent(prompt)`
5. Await `result.response`
6. Extract text via `response.text()`
7. If text is empty: throw `LLMApiError('gemini', 'Empty response received')`
8. Extract token usage from `response.usageMetadata` (default to 0 if unavailable)
9. Return `LLMResult { content: text, model: modelName, provider: 'gemini', tokenUsage }`

**Error handling:**
- Catch `GoogleGenerativeAIError` with status 401: throw `LLMApiKeyError('Gemini')`
- Catch timeout errors: throw `LLMApiError('gemini', 'Request timed out')`
- Catch all other API errors: throw `LLMApiError('gemini', error.message, error)`

### GeminiProvider.adapt(content, options)

1. Get generative model instance
2. Build platform-specific prompt using internal prompt map:
   | Platform | Prompt |
   |----------|--------|
   | `x` | "Rewrite this into a high-engagement Twitter/X thread. Each tweet must be under 280 characters. Separate tweets with '---' on its own line." |
   | `devto` | "Rewrite this as a Dev.to article with YAML frontmatter (title, tags, series). Use Markdown formatting optimized for Dev.to rendering." |
   | `wechat` | "Rewrite this into a formal, structured WeChat Official Account article." |
   | `zhihu` | "Rewrite this into a deep-dive, professional Zhihu answer." |
   | `hashnode` | "Rewrite this as a Hashnode blog post. Start with an H1 title." |
   | `github` | "Rewrite this as a GitHub Discussion post. Start with an H1 title. Use GitHub-flavored Markdown." |
   | (unknown) | "Rewrite this content for the {platform} platform." |
3. Combine platform prompt with content: `{platformPrompt}\n\nCONTENT:\n{content}`
4. Call `model.generateContent(fullPrompt)`
5. Process response same as `generate()` step 5-9
6. Return `LLMResult`

## 6. Field Mappings

### Provider Name to Implementation

| Config Value | Class | Required Credential | Default Model |
|-------------|-------|-------------------|---------------|
| `gemini` | `GeminiProvider` | `GEMINI_API_KEY` | `gemini-pro` |
| `claude` | `ClaudeProvider` | `ANTHROPIC_API_KEY` | `claude-sonnet-4-20250514` |
| `local` | `LocalProvider` | `APHYPE_LOCAL_LLM_URL` | (depends on server) |

### Platform to Adaptation Prompt

See the prompt table in Section 5 (GeminiProvider.adapt). Each platform has a specific system-level instruction. The `CONTENT:` section always contains the full master article.

## 7. Error Handling

| Error Condition | Error Type | Message | Recovery |
|----------------|-----------|---------|----------|
| API key not set | `LLMApiKeyError` | "{Provider} API key is not configured. Set it in your .env file." | User sets API key |
| Unknown provider name | `ConfigError` | "Unknown LLM provider: {name}. Supported: gemini, claude, local" | User fixes config |
| API returns 401 | `LLMApiKeyError` | "{Provider} API key is invalid. Verify your API key." | User fixes API key |
| API timeout | `LLMApiError` | "{provider} API error: Request timed out" | User retries |
| API rate limit (429) | `LLMApiError` | "{provider} API error: Rate limit exceeded. Try again later." | User waits and retries |
| Empty response | `LLMApiError` | "{provider} API error: Empty response received" | User retries or changes prompt |
| Network error | `LLMApiError` | "{provider} API error: Network request failed: {details}" | User checks connectivity |

## 8. Test Scenarios

### Unit Tests (`llm/__tests__/factory.test.ts`)

1. `create()` returns `GeminiProvider` when config is `'gemini'` and API key exists
2. `create()` throws `LLMApiKeyError` when Gemini API key is missing
3. `create()` returns `ClaudeProvider` when config is `'claude'` and API key exists
4. `create()` throws `ConfigError` for unknown provider name `'gpt4'`
5. `create()` defaults to `'gemini'` when no provider configured

### Unit Tests (`llm/__tests__/gemini.test.ts`)

6. `generate()` sends correct prompt containing source content
7. `generate()` returns `LLMResult` with non-empty content on success
8. `generate()` includes token usage from response metadata
9. `generate()` throws `LLMApiKeyError` on 401 response
10. `generate()` throws `LLMApiError` with timeout message on timeout
11. `generate()` throws `LLMApiError` with rate limit message on 429
12. `generate()` throws `LLMApiError` on empty response text
13. `adapt()` uses X-specific prompt for platform `'x'`
14. `adapt()` uses Dev.to-specific prompt for platform `'devto'`
15. `adapt()` uses generic prompt for unknown platform `'linkedin'`
16. `adapt()` includes full content in prompt after platform instruction
17. `adapt()` returns correct provider and model in result

### Mock Strategy

- Mock `@google/generative-ai` `GoogleGenerativeAI` class
- Mock `getGenerativeModel()` to return a mock model object
- Mock `generateContent()` to return controlled responses
- Test error paths by making mock throw specific error types

## 9. Dependencies

| Dependency | Direction | Purpose |
|-----------|-----------|---------|
| `@google/generative-ai` | npm dependency | Gemini SDK |
| `core/config.ts` | Imports from | API key retrieval |
| `types/errors.ts` | Imports from | Error classes |
| `commands/draft.ts` | Imported by | Draft generation |
| `commands/adapt.ts` | Imported by | Platform adaptation |

---

*SRS Traceability: FR-DRAFT-002 (Gemini content generation), FR-DRAFT-005 (API key error), FR-ADAPT-002 (platform-specific adaptation prompts), NFR-PERF-002 (progress indication handled by calling command, not LLM layer).*
