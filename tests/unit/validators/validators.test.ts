import { describe, test, expect } from 'vitest';
import { validateXContent } from '../../../src/validators/x.js';
import { validateDevtoContent } from '../../../src/validators/devto.js';
import { validateContent } from '../../../src/validators/runner.js';

describe('validateXContent', () => {
  test('passes for single tweet under 280 chars', () => {
    expect(validateXContent('Short tweet about Bun.').valid).toBe(true);
  });

  test('passes for thread with all segments under 280', () => {
    const thread = 'First tweet.\n---\nSecond tweet.\n---\nThird tweet.';
    expect(validateXContent(thread).valid).toBe(true);
  });

  test('passes at exactly 280 chars', () => {
    expect(validateXContent('a'.repeat(280)).valid).toBe(true);
  });

  test('fails at 281 chars', () => {
    const result = validateXContent('a'.repeat(281));
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('exceeds 280');
    expect(result.errors[0]).toContain('found: 281');
  });

  test('fails when second segment too long', () => {
    const thread = `Short first\n---\n${'a'.repeat(300)}`;
    const result = validateXContent(thread);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('segment 2');
  });

  test('ignores empty segments', () => {
    expect(validateXContent('Tweet\n---\n---\nAnother').valid).toBe(true);
  });

  test('fails for empty content', () => {
    expect(validateXContent('').valid).toBe(false);
  });
});

describe('validateDevtoContent', () => {
  test('passes with markdown heading', () => {
    expect(validateDevtoContent('# My Article\n\nContent').valid).toBe(true);
  });

  test('passes with frontmatter title', () => {
    expect(validateDevtoContent('---\ntitle: My Post\n---\nContent').valid).toBe(true);
  });

  test('fails without title', () => {
    const result = validateDevtoContent('Just body content no heading');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('title');
  });

  test('fails for empty content', () => {
    expect(validateDevtoContent('').valid).toBe(false);
  });
});

describe('validateContent (aggregate runner)', () => {
  test('validates multiple platforms at once', () => {
    const result = validateContent({
      x: 'Short tweet',
      devto: '# Article\n\nBody',
    });
    expect(result.allValid).toBe(true);
  });

  test('reports failures per platform', () => {
    const result = validateContent({
      x: 'a'.repeat(300),
      devto: '# Valid Article\n\nBody',
    });
    expect(result.allValid).toBe(false);
    expect(result.results.x.valid).toBe(false);
    expect(result.results.devto.valid).toBe(true);
  });

  test('passes unknown platforms by default', () => {
    const result = validateContent({
      wechat: 'Any content',
      zhihu: 'Any content',
    });
    expect(result.allValid).toBe(true);
  });
});
