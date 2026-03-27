import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import fs from 'fs-extra';
import os from 'os';
import { PipelineEngine } from './pipeline.js';
import { STAGES } from './constants.js';

let tmpDir: string;
let engine: PipelineEngine;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reach-pipeline-test-'));
  engine = new PipelineEngine(tmpDir);
  await engine.initPipeline();
});

afterEach(async () => {
  await fs.remove(tmpDir);
});

// T01: listArticles
describe('listArticles', () => {
  it('returns empty for empty stage', async () => {
    expect(await engine.listArticles('01_drafts')).toEqual([]);
  });

  it('returns article name from single file', async () => {
    await fs.writeFile(path.join(tmpDir, '01_drafts', 'teaser.md'), 'content');
    expect(await engine.listArticles('01_drafts')).toEqual(['teaser']);
  });

  it('deduplicates platform files in adapted stage', async () => {
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'teaser.x.md'), 'x');
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'teaser.devto.md'), 'devto');
    const result = await engine.listArticles('02_adapted');
    expect(result).toEqual(['teaser']);
  });

  it('lists multiple articles sorted', async () => {
    await fs.writeFile(path.join(tmpDir, '01_drafts', 'zebra.md'), 'z');
    await fs.writeFile(path.join(tmpDir, '01_drafts', 'alpha.md'), 'a');
    expect(await engine.listArticles('01_drafts')).toEqual(['alpha', 'zebra']);
  });

  it('excludes dotfiles and yaml files', async () => {
    await fs.writeFile(path.join(tmpDir, '01_drafts', '.hidden.md'), '');
    await fs.writeFile(path.join(tmpDir, '01_drafts', 'meta.yaml'), '');
    await fs.writeFile(path.join(tmpDir, '01_drafts', 'teaser.md'), '');
    expect(await engine.listArticles('01_drafts')).toEqual(['teaser']);
  });

  it('handles articles with dots in name in adapted stage', async () => {
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'my.post.x.md'), 'x');
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'my.post.devto.md'), 'devto');
    expect(await engine.listArticles('02_adapted')).toEqual(['my.post']);
  });
});

// T02: getArticleFiles
describe('getArticleFiles', () => {
  it('returns single file in draft stage', async () => {
    await fs.writeFile(path.join(tmpDir, '01_drafts', 'teaser.md'), '');
    const files = await engine.getArticleFiles('teaser', '01_drafts');
    expect(files).toEqual(['teaser.md']);
  });

  it('returns all platform files in adapted stage', async () => {
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'teaser.x.md'), '');
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'teaser.devto.md'), '');
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'other.x.md'), '');
    const files = await engine.getArticleFiles('teaser', '02_adapted');
    expect(files.sort()).toEqual(['teaser.devto.md', 'teaser.x.md']);
  });

  it('returns empty for unknown article', async () => {
    const files = await engine.getArticleFiles('nonexistent', '01_drafts');
    expect(files).toEqual([]);
  });
});

// T03: moveArticle
describe('moveArticle', () => {
  it('moves single file between stages', async () => {
    await fs.writeFile(path.join(tmpDir, '01_drafts', 'teaser.md'), 'draft content');
    await engine.metadata.writeArticleMeta('teaser', { status: 'drafted' });

    const result = await engine.moveArticle('teaser', '01_drafts', '02_adapted');

    expect(result.from).toBe('01_drafts');
    expect(result.to).toBe('02_adapted');
    expect(result.article).toBe('teaser');
    expect(await fs.pathExists(path.join(tmpDir, '02_adapted', 'teaser.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '01_drafts', 'teaser.md'))).toBe(false);
  });

  it('moves multiple platform files', async () => {
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'teaser.x.md'), 'x');
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'teaser.devto.md'), 'devto');
    await engine.metadata.writeArticleMeta('teaser', { status: 'adapted' });

    await engine.moveArticle('teaser', '02_adapted', '03_published');

    expect(await fs.pathExists(path.join(tmpDir, '03_published', 'teaser.x.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '03_published', 'teaser.devto.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '02_adapted', 'teaser.x.md'))).toBe(false);
    expect(await fs.pathExists(path.join(tmpDir, '02_adapted', 'teaser.devto.md'))).toBe(false);
  });

  it('throws if article not found', async () => {
    await expect(engine.moveArticle('nonexistent', '01_drafts', '02_adapted'))
      .rejects.toThrow();
  });

  it('throws if target file exists', async () => {
    await fs.writeFile(path.join(tmpDir, '01_drafts', 'teaser.md'), 'draft');
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'teaser.md'), 'existing');
    await engine.metadata.writeArticleMeta('teaser', { status: 'drafted' });

    await expect(engine.moveArticle('teaser', '01_drafts', '02_adapted'))
      .rejects.toThrow(/already exists/);
  });

  it('does not move other articles files', async () => {
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'teaser.x.md'), 'x');
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'other.x.md'), 'other');
    await engine.metadata.writeArticleMeta('teaser', { status: 'adapted' });

    await engine.moveArticle('teaser', '02_adapted', '03_published');

    expect(await fs.pathExists(path.join(tmpDir, '02_adapted', 'other.x.md'))).toBe(true);
  });

  it('updates meta status after move', async () => {
    await fs.writeFile(path.join(tmpDir, '01_drafts', 'teaser.md'), 'draft');
    await engine.metadata.writeArticleMeta('teaser', { status: 'drafted' });

    await engine.moveArticle('teaser', '01_drafts', '02_adapted');

    const meta = await engine.metadata.readArticleMeta('teaser');
    expect(meta?.status).toBe('adapted');
  });
});

// T04: findDueArticles
describe('findDueArticles', () => {
  it('returns empty when no scheduled articles', async () => {
    expect(await engine.findDueArticles()).toEqual([]);
  });

  it('returns article with past schedule in 02_adapted', async () => {
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'teaser.x.md'), 'x');
    await engine.metadata.writeArticleMeta('teaser', {
      status: 'scheduled',
      schedule: '2020-01-01',
    });

    const due = await engine.findDueArticles();
    expect(due).toEqual(['teaser']);
  });

  it('does not return article with future schedule', async () => {
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'teaser.x.md'), 'x');
    await engine.metadata.writeArticleMeta('teaser', {
      status: 'scheduled',
      schedule: '2099-12-31T23:59',
    });

    const due = await engine.findDueArticles();
    expect(due).toEqual([]);
  });

  it('returns article with no schedule as immediately due', async () => {
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'teaser.x.md'), 'x');
    await engine.metadata.writeArticleMeta('teaser', { status: 'scheduled' });

    const due = await engine.findDueArticles();
    expect(due).toEqual(['teaser']);
  });

  it('does not return adapted article without scheduled status', async () => {
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'teaser.x.md'), 'x');
    await engine.metadata.writeArticleMeta('teaser', { status: 'adapted' });

    const due = await engine.findDueArticles();
    expect(due).toEqual([]);
  });
});

// T05: rollbackArticle
describe('rollbackArticle', () => {
  it('throws when article is already at first stage (01_drafts)', async () => {
    await fs.writeFile(path.join(tmpDir, '01_drafts', 'teaser.md'), 'draft');
    await engine.metadata.writeArticleMeta('teaser', { status: 'drafted' });

    await expect(engine.rollbackArticle('teaser')).rejects.toThrow(/first stage/i);
  });

  it('rolls back from adapted: moves base file, deletes platform files', async () => {
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'teaser.x.md'), 'x');
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'teaser.devto.md'), 'devto');
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'teaser.md'), 'base');
    await engine.metadata.writeArticleMeta('teaser', { status: 'adapted', adapted_platforms: ['x', 'devto'] });

    const result = await engine.rollbackArticle('teaser');

    expect(result.from).toBe('02_adapted');
    expect(result.to).toBe('01_drafts');
    expect(await fs.pathExists(path.join(tmpDir, '01_drafts', 'teaser.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '02_adapted', 'teaser.x.md'))).toBe(false);
    expect(await fs.pathExists(path.join(tmpDir, '01_drafts', 'teaser.x.md'))).toBe(false);
    const meta = await engine.metadata.readArticleMeta('teaser');
    expect(meta?.adapted_platforms).toBeUndefined();
  });

  it('rolls back from published to adapted', async () => {
    await fs.writeFile(path.join(tmpDir, '03_published', 'teaser.x.md'), 'x');
    await engine.metadata.writeArticleMeta('teaser', { status: 'published' });

    const result = await engine.rollbackArticle('teaser');

    expect(result.from).toBe('03_published');
    expect(result.to).toBe('02_adapted');
    expect(await fs.pathExists(path.join(tmpDir, '02_adapted', 'teaser.x.md'))).toBe(true);
  });

  it('throws when article not found', async () => {
    await expect(engine.rollbackArticle('nonexistent')).rejects.toThrow();
  });
});

// T06: readArticleContent, writeArticleFile, getArticlePath
describe('file I/O', () => {
  it('write then read returns same content', async () => {
    await engine.writeArticleFile('01_drafts', 'teaser', 'hello world');
    const content = await engine.readArticleContent('01_drafts', 'teaser');
    expect(content).toBe('hello world');
  });

  it('write with platform creates correct filename', async () => {
    await engine.writeArticleFile('02_adapted', 'teaser', 'x content', 'x');
    expect(await fs.pathExists(path.join(tmpDir, '02_adapted', 'teaser.x.md'))).toBe(true);
  });

  it('read missing file throws', async () => {
    await expect(engine.readArticleContent('01_drafts', 'nonexistent'))
      .rejects.toThrow();
  });

  it('getArticlePath returns correct path', () => {
    expect(engine.getArticlePath('01_drafts', 'teaser'))
      .toBe(path.join(tmpDir, '01_drafts', 'teaser.md'));
    expect(engine.getArticlePath('02_adapted', 'teaser', 'x'))
      .toBe(path.join(tmpDir, '02_adapted', 'teaser.x.md'));
  });
});

// T07: getStatus
describe('getStatus', () => {
  it('returns correct counts per stage', async () => {
    await fs.writeFile(path.join(tmpDir, '01_drafts', 'a.md'), '');
    await fs.writeFile(path.join(tmpDir, '01_drafts', 'b.md'), '');
    await fs.writeFile(path.join(tmpDir, '01_drafts', 'c.md'), '');
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'd.x.md'), '');
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'd.devto.md'), '');

    const status = await engine.getStatus();
    expect(status.stages['01_drafts'].count).toBe(3);
    expect(status.stages['01_drafts'].items).toEqual(['a', 'b', 'c']);
    expect(status.stages['02_adapted'].count).toBe(1); // deduplicated
    expect(status.stages['02_adapted'].items).toEqual(['d']);
    expect(status.totalProjects).toBe(4);
  });

  it('includes due articles in dueToday', async () => {
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'teaser.x.md'), '');
    await engine.metadata.writeArticleMeta('teaser', {
      status: 'scheduled',
      schedule: '2020-01-01',
    });

    const status = await engine.getStatus();
    expect(status.dueToday).toEqual(['teaser']);
  });
});
