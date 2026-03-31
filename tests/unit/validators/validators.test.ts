import { describe, test, expect } from 'vitest';
import { validateXContent } from '../../../src/validators/x.js';
import { validateDevtoContent } from '../../../src/validators/devto.js';
import { validateHashnodeContent } from '../../../src/validators/hashnode.js';
import { validateGitHubContent } from '../../../src/validators/github.js';
import { validateContent } from '../../../src/validators/runner.js';

describe('validateXContent', () => {
  test('passes for single tweet under 280 chars', () => {
    expect(validateXContent('Short tweet about Bun.').valid).toBe(true);
  });

  test('passes for thread with all segments under 280', () => {
    const thread = 'First tweet.\n<!-- thread-break -->\nSecond tweet.\n<!-- thread-break -->\nThird tweet.';
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
    const thread = `Short first\n<!-- thread-break -->\n${'a'.repeat(300)}`;
    const result = validateXContent(thread);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('segment 2');
  });

  test('ignores empty segments', () => {
    expect(validateXContent('Tweet\n<!-- thread-break -->\n<!-- thread-break -->\nAnother').valid).toBe(true);
  });

  test('fails for empty content', () => {
    const result = validateXContent('');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('no thread segments found');
  });

  test('splits by numbered markers (1/, 2/)', () => {
    const thread = 'First point\n1/ Second point\n2/ Third point';
    expect(validateXContent(thread).valid).toBe(true);
  });

  test('treats content with no delimiter as single segment', () => {
    expect(validateXContent('Just a single tweet').valid).toBe(true);
  });
});

describe('validateDevtoContent', () => {
  test('passes with valid frontmatter containing title', () => {
    expect(validateDevtoContent('---\ntitle: My Post\n---\nContent').valid).toBe(true);
  });

  test('fails without frontmatter block', () => {
    const result = validateDevtoContent('# My Article\n\nContent');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('frontmatter block');
  });

  test('fails without title field in frontmatter', () => {
    const result = validateDevtoContent('---\ntags: [foo]\n---\nContent');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('title');
  });

  test('fails with title exceeding 128 characters', () => {
    const title = 'a'.repeat(129);
    const result = validateDevtoContent(`---\ntitle: "${title}"\n---\nContent`);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('128');
  });

  test('passes with valid tags array under 4 tags', () => {
    const content = '---\ntitle: My Post\ntags: [javascript, typescript, node]\n---\nContent';
    expect(validateDevtoContent(content).valid).toBe(true);
  });

  test('fails with more than 4 tags', () => {
    const content = '---\ntitle: My Post\ntags: [a, b, c, d, e]\n---\nContent';
    const result = validateDevtoContent(content);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('maximum 4 tags');
  });

  test('fails with tag exceeding 20 characters', () => {
    const longTag = 'a'.repeat(21);
    const content = `---\ntitle: My Post\ntags: [${longTag}]\n---\nContent`;
    const result = validateDevtoContent(content);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('20 character limit');
  });

  test('fails with tag containing special characters', () => {
    const content = '---\ntitle: My Post\ntags: [my tag!]\n---\nContent';
    const result = validateDevtoContent(content);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('invalid characters');
  });

  test('fails for empty content', () => {
    expect(validateDevtoContent('').valid).toBe(false);
  });

  test('handles malformed YAML gracefully (returns error, no throw)', () => {
    const result = validateDevtoContent('---\ntitle: [unclosed\n---\nContent');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('YAML');
  });
});

describe('validateHashnodeContent', () => {
  test('passes with H1 title', () => {
    expect(validateHashnodeContent('# My Article\n\nContent').valid).toBe(true);
  });

  test('passes with title in YAML frontmatter', () => {
    expect(validateHashnodeContent('---\ntitle: My Post\n---\nContent').valid).toBe(true);
  });

  test('fails with no title found', () => {
    const result = validateHashnodeContent('Just body content without a heading');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('missing title');
  });

  test('fails with title over 250 characters', () => {
    const title = 'a'.repeat(251);
    const result = validateHashnodeContent(`# ${title}\n\nContent`);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('250');
  });
});

describe('validateGitHubContent', () => {
  test('passes with H1 title', () => {
    expect(validateGitHubContent('# My Discussion\n\nBody content').valid).toBe(true);
  });

  test('fails with no H1 heading', () => {
    const result = validateGitHubContent('Just body content without a heading');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('missing title');
  });

  test('fails with title over 256 characters', () => {
    const title = 'a'.repeat(257);
    const result = validateGitHubContent(`# ${title}\n\nContent`);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('256');
  });

  test('passes with valid title and empty body', () => {
    expect(validateGitHubContent('# My Discussion').valid).toBe(true);
  });
});

describe('validateContent (aggregate runner)', () => {
  test('validates multiple platforms at once', () => {
    const result = validateContent({
      x: 'Short tweet',
      devto: '---\ntitle: Article\n---\nBody',
      hashnode: '# My Article\n\nBody',
      github: '# Discussion\n\nBody',
    });
    expect(result.allValid).toBe(true);
  });

  test('reports failures per platform', () => {
    const result = validateContent({
      x: 'a'.repeat(300),
      devto: '---\ntitle: Valid Article\n---\nBody',
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

  test('includes hashnode and github in validators', () => {
    const result = validateContent({
      hashnode: 'no heading here',
      github: 'no heading here',
    });
    expect(result.results.hashnode.valid).toBe(false);
    expect(result.results.github.valid).toBe(false);
  });
});
