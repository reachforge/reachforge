# Feature Spec: Content Validation

| Field        | Value                                      |
|--------------|--------------------------------------------|
| **Component**| Content Quality Validation                 |
| **Directory**| `src/validators/`                          |
| **Priority** | P1                                         |
| **SRS Refs** | FR-VALID-001 through FR-VALID-004          |

---

## 1. Purpose and Scope

The content validation module provides platform-specific pre-publish quality checks. Validation runs automatically before the `publish` operation and blocks publishing for any platform whose content fails validation. Failed validations produce actionable error messages specifying the platform, the constraint violated, and the actual value.

Validators are separate from providers to keep validation logic independently testable and to allow running validation without requiring provider credentials.

## 2. Files

| File | Responsibility | Max Lines |
|------|---------------|-----------|
| `validators/base.ts` | ValidationRunner: aggregates results across platforms | 80 |
| `validators/x.ts` | X/Twitter thread validation rules | 60 |
| `validators/devto.ts` | Dev.to article validation rules | 80 |
| `validators/hashnode.ts` | Hashnode article validation rules | 50 |
| `validators/github.ts` | GitHub discussion validation rules | 50 |

## 3. TypeScript Interfaces

```typescript
// validators/base.ts

export interface ContentValidator {
  readonly platform: string;
  validate(content: string): ValidationResult;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  platform: string;       // Platform ID (e.g., 'x', 'devto')
  constraint: string;     // What rule was violated (e.g., 'character_limit')
  message: string;        // Human-readable description
  actual?: string | number; // The actual value that violated the constraint
  expected?: string | number; // The expected/allowed value
}

export class ValidationRunner {
  private validators: Map<string, ContentValidator> = new Map();

  registerValidator(validator: ContentValidator): void;
  validateForPlatform(platform: string, content: string): ValidationResult;
  validateAll(contents: Map<string, string>): Map<string, ValidationResult>;
}
```

## 4. Method Signatures

```typescript
// validators/base.ts
class ValidationRunner {
  registerValidator(validator: ContentValidator): void;
  validateForPlatform(platform: string, content: string): ValidationResult;
  validateAll(contents: Map<string, string>): Map<string, ValidationResult>;
}

// validators/x.ts
class XValidator implements ContentValidator {
  readonly platform: string; // 'x'
  validate(content: string): ValidationResult;
  private parseThreadSegments(content: string): string[];
}

// validators/devto.ts
class DevtoValidator implements ContentValidator {
  readonly platform: string; // 'devto'
  validate(content: string): ValidationResult;
  private parseFrontmatter(content: string): Record<string, unknown> | null;
}

// validators/hashnode.ts
class HashnodeValidator implements ContentValidator {
  readonly platform: string; // 'hashnode'
  validate(content: string): ValidationResult;
}

// validators/github.ts
class GitHubValidator implements ContentValidator {
  readonly platform: string; // 'github'
  validate(content: string): ValidationResult;
}
```

## 5. Logic Steps

### XValidator.validate(content)

1. Split content into thread segments:
   a. Split by `\n---\n` delimiter
   b. If only one segment, try splitting by numbered markers (`\n1\/`, `\n2\/`, etc.)
   c. Trim each segment, filter empty strings
2. If no segments after filtering: return error "X content is empty -- no thread segments found."
3. For each segment at index `i`:
   a. Compute character count of trimmed segment
   b. If count > 280: add error:
      ```
      {
        platform: 'x',
        constraint: 'character_limit',
        message: 'X post segment {i+1} exceeds 280 character limit (found: {count}).',
        actual: count,
        expected: 280
      }
      ```
4. Return `{ valid: errors.length === 0, errors }`

### DevtoValidator.validate(content)

1. Check content is non-empty — error: "Dev.to article content is empty."
2. Attempt to extract YAML frontmatter between opening and closing `---`:
   a. Regex: `/^---\n([\s\S]*?)\n---/`
   b. If no match: error: "Dev.to article missing required frontmatter block (---...---)."
3. Parse frontmatter YAML:
   a. If YAML parse fails: error: "Dev.to article frontmatter is invalid YAML: {parse_error}."
4. Check `title` field:
   a. If missing or empty: error: "Dev.to article missing required frontmatter field: title."
   b. If length > 128: error with `actual: title.length, expected: 128`
5. If `tags` present:
   a. If not an array: error: "Dev.to frontmatter 'tags' must be an array."
   b. For each tag:
      - If length > 20: error: "Dev.to tag '{tag}' exceeds 20 character limit (found: {length})."
      - If contains non-alphanumeric/hyphen: error: "Dev.to tag '{tag}' contains invalid characters."
   c. If more than 4 tags: error: "Dev.to allows maximum 4 tags (found: {count})."
6. Return validation result

### HashnodeValidator.validate(content)

1. Check content is non-empty
2. Try extracting title:
   a. From first H1 heading: `/^#\s+(.+)$/m`
   b. From YAML frontmatter `title:` field
3. If no title found: error: "Hashnode article missing title (no H1 heading or frontmatter title found)."
4. If title length > 250: error with actual/expected counts
5. Return validation result

### GitHubValidator.validate(content)

1. Check content is non-empty
2. Extract title from first H1 heading: `/^#\s+(.+)$/m`
3. If no H1 found: error: "GitHub discussion missing title (no H1 heading found)."
4. If title length > 256: error with actual/expected counts
5. Return validation result

### ValidationRunner.validateAll(contents)

1. For each entry `[platform, content]` in the contents map:
   a. Look up validator by platform in `validators` map
   b. If no validator registered for platform: skip (allow publishing without validation)
   c. Call `validator.validate(content)`
   d. Store result in output map keyed by platform
2. Return map of platform to validation result

## 6. Error Message Format (FR-VALID-004)

Every validation error message contains three elements:
1. **Platform name**: Which platform's rules were violated
2. **Specific constraint**: What rule was broken
3. **Offending value**: The actual measurement or value

Examples:
- "X post segment 3 exceeds 280 character limit (found: 312)."
- "Dev.to article missing required frontmatter field: title."
- "Dev.to tag 'very-long-tag-name-here' exceeds 20 character limit (found: 24)."
- "Hashnode article missing title (no H1 heading or frontmatter title found)."

## 7. Error Handling

Validators are pure functions — they do not throw exceptions. All errors are returned in the `ValidationResult.errors` array. The calling code (`PipelineEngine.publishProject()`) decides whether to skip publishing for platforms with validation failures.

| Scenario | Behavior |
|----------|---------|
| Content passes all checks | `{ valid: true, errors: [] }` |
| Content fails one check | `{ valid: false, errors: [{ ... }] }` — publishing blocked for this platform |
| Content fails multiple checks | `{ valid: false, errors: [{ ... }, { ... }] }` — all errors reported |
| No validator registered for platform | Platform published without validation (warn in logs) |
| YAML frontmatter parse failure | Validation error returned (not thrown) |

## 8. Test Scenarios

### XValidator Tests

1. Passes with single segment under 280 characters
2. Passes with multi-segment thread, all under 280 chars
3. Fails with single segment of 285 characters — error reports actual count
4. Fails with thread where segment 3 of 5 exceeds limit — reports segment index
5. Fails with empty content — reports "no thread segments found"
6. Correctly splits by `---` delimiter
7. Correctly splits by numbered markers (`1/`, `2/`)
8. Handles content with no delimiters as a single segment

### DevtoValidator Tests

9. Passes with valid frontmatter containing title
10. Fails with missing frontmatter block entirely
11. Fails with frontmatter but no title field
12. Fails with title exceeding 128 characters
13. Passes with valid tags array (4 tags, each under 20 chars)
14. Fails with more than 4 tags
15. Fails with tag exceeding 20 characters
16. Fails with tag containing special characters
17. Fails with empty content
18. Handles malformed YAML in frontmatter gracefully (error, not throw)

### HashnodeValidator Tests

19. Passes with H1 title
20. Passes with title in YAML frontmatter
21. Fails with no title found
22. Fails with title over 250 characters

### GitHubValidator Tests

23. Passes with H1 title
24. Fails with no H1 heading
25. Fails with title over 256 characters
26. Passes with empty body but valid title

### ValidationRunner Tests

27. `validateAll()` returns results for all platforms in input map
28. `validateAll()` skips platforms with no registered validator
29. `validateForPlatform()` returns correct result for registered platform
30. `registerValidator()` adds validator to internal map

## 9. Dependencies

| Dependency | Direction | Purpose |
|-----------|-----------|---------|
| `js-yaml` | npm dependency | Frontmatter parsing |
| `providers/types.ts` | Imports from | `ValidationResult` type (shared) |
| `core/pipeline.ts` | Imported by | Pipeline runs validation before publish |
| `providers/*.ts` | Also provides validation | Providers can delegate to validators or implement inline |

---

*SRS Traceability: FR-VALID-001 (X 280-char validation), FR-VALID-002 (Dev.to frontmatter validation), FR-VALID-003 (validation blocks publishing per platform), FR-VALID-004 (actionable error messages with platform, constraint, value).*
