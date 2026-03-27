import { describe, it, expect } from 'vitest';
import {
  PLATFORM_IDS,
  PLATFORM_ID_REGEX,
  ADAPTED_STAGES,
  isAdaptedStage,
  parseArticleFilename,
  buildArticleFilename,
  validateArticleName,
} from './filename-parser.js';
import type { ParsedFilename } from './filename-parser.js';
import type { PipelineStage } from '../types/index.js';

// T01: Constants and types
describe('filename-parser constants', () => {
  it('PLATFORM_IDS contains all expected platforms', () => {
    expect(PLATFORM_IDS).toContain('x');
    expect(PLATFORM_IDS).toContain('devto');
    expect(PLATFORM_IDS).toContain('hashnode');
    expect(PLATFORM_IDS).toContain('wechat');
    expect(PLATFORM_IDS).toContain('zhihu');
    expect(PLATFORM_IDS).toContain('github');
    expect(PLATFORM_IDS).toContain('linkedin');
    expect(PLATFORM_IDS).toContain('medium');
    expect(PLATFORM_IDS).toContain('reddit');
  });

  it('all PLATFORM_IDS match [a-z0-9]+ regex', () => {
    for (const id of PLATFORM_IDS) {
      expect(id).toMatch(PLATFORM_ID_REGEX);
    }
  });

  it('ADAPTED_STAGES contains exactly the post-adaptation stages', () => {
    expect(ADAPTED_STAGES).toEqual(['02_adapted', '03_published']);
  });
});

// T02: isAdaptedStage
describe('isAdaptedStage', () => {
  it('returns true for adapted stages', () => {
    expect(isAdaptedStage('02_adapted')).toBe(true);
    expect(isAdaptedStage('03_published')).toBe(true);
  });

  it('returns false for pre-adaptation stages', () => {
    expect(isAdaptedStage('01_drafts')).toBe(false);
  });
});

// T03: parseArticleFilename
describe('parseArticleFilename', () => {
  it('parses simple filename in adapted stage', () => {
    const result = parseArticleFilename('teaser.x.md', '02_adapted');
    expect(result).toEqual({ article: 'teaser', platform: 'x' });
  });

  it('parses filename with dots in article name', () => {
    const result = parseArticleFilename('my.first.post.devto.md', '02_adapted');
    expect(result).toEqual({ article: 'my.first.post', platform: 'devto' });
  });

  it('ignores platform suffix in non-adapted stage', () => {
    const result = parseArticleFilename('teaser.x.md', '01_drafts');
    expect(result).toEqual({ article: 'teaser.x', platform: null });
  });

  it('returns null platform for unknown platform ID', () => {
    const result = parseArticleFilename('teaser.UNKNOWN.md', '02_adapted');
    expect(result).toEqual({ article: 'teaser.UNKNOWN', platform: null });
  });

  it('returns null platform for no-dot filename in adapted stage', () => {
    const result = parseArticleFilename('teaser.md', '02_adapted');
    expect(result).toEqual({ article: 'teaser', platform: null });
  });

  it('parses simple filename in non-adapted stage', () => {
    const result = parseArticleFilename('teaser.md', '01_drafts');
    expect(result).toEqual({ article: 'teaser', platform: null });
  });

  it('throws for non-.md filename', () => {
    expect(() => parseArticleFilename('teaser.txt', '01_drafts')).toThrow();
  });

  it('parses all platform IDs correctly in adapted stage', () => {
    for (const id of PLATFORM_IDS) {
      const result = parseArticleFilename(`article.${id}.md`, '02_adapted');
      expect(result).toEqual({ article: 'article', platform: id });
    }
  });

  it('works in 03_published', () => {
    expect(parseArticleFilename('teaser.devto.md', '03_published'))
      .toEqual({ article: 'teaser', platform: 'devto' });
    expect(parseArticleFilename('teaser.hashnode.md', '03_published'))
      .toEqual({ article: 'teaser', platform: 'hashnode' });
  });
});

// T04: buildArticleFilename
describe('buildArticleFilename', () => {
  it('builds filename without platform', () => {
    expect(buildArticleFilename('teaser', null)).toBe('teaser.md');
  });

  it('builds filename with platform', () => {
    expect(buildArticleFilename('teaser', 'x')).toBe('teaser.x.md');
  });

  it('builds filename with dots in article name', () => {
    expect(buildArticleFilename('my.first.post', 'devto')).toBe('my.first.post.devto.md');
  });

  it('throws for invalid platform ID', () => {
    expect(() => buildArticleFilename('teaser', 'INVALID')).toThrow();
    expect(() => buildArticleFilename('teaser', 'dev.to')).toThrow();
    expect(() => buildArticleFilename('teaser', 'dev-to')).toThrow();
  });

  it('treats empty string platform same as null', () => {
    expect(buildArticleFilename('teaser', '')).toBe('teaser.md');
  });
});

// T05: validateArticleName
describe('validateArticleName', () => {
  it('accepts valid article names', () => {
    expect(() => validateArticleName('teaser')).not.toThrow();
    expect(() => validateArticleName('my.first.post')).not.toThrow();
    expect(() => validateArticleName('deep-dive')).not.toThrow();
    expect(() => validateArticleName('article_1')).not.toThrow();
    expect(() => validateArticleName('A1')).not.toThrow();
  });

  it('throws for empty name', () => {
    expect(() => validateArticleName('')).toThrow(/empty/i);
  });

  it('throws for name over 200 chars', () => {
    expect(() => validateArticleName('a'.repeat(201))).toThrow(/too long/i);
  });

  it('throws for name starting with non-alphanumeric', () => {
    expect(() => validateArticleName('.hidden')).toThrow();
    expect(() => validateArticleName('-dash')).toThrow();
    expect(() => validateArticleName('_under')).toThrow();
  });

  it('throws for name containing invalid characters', () => {
    expect(() => validateArticleName('has space')).toThrow();
    expect(() => validateArticleName('has/slash')).toThrow();
    expect(() => validateArticleName('has@sign')).toThrow();
  });

  it('throws when name conflicts with platform ID', () => {
    expect(() => validateArticleName('x')).toThrow(/conflict/i);
    expect(() => validateArticleName('devto')).toThrow(/conflict/i);
    expect(() => validateArticleName('hashnode')).toThrow(/conflict/i);
  });

  it('allows names that look like platform IDs but with different case', () => {
    // 'X' lowercase = 'x' which is a platform ID -> should throw
    expect(() => validateArticleName('X')).toThrow(/conflict/i);
  });
});
