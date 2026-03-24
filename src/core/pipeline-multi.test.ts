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
    expect(await engine.listArticles('01_inbox')).toEqual([]);
  });

  it('returns article name from single file', async () => {
    await fs.writeFile(path.join(tmpDir, '02_drafts', 'teaser.md'), 'content');
    expect(await engine.listArticles('02_drafts')).toEqual(['teaser']);
  });

  it('deduplicates platform files in adapted stage', async () => {
    await fs.writeFile(path.join(tmpDir, '04_adapted', 'teaser.x.md'), 'x');
    await fs.writeFile(path.join(tmpDir, '04_adapted', 'teaser.devto.md'), 'devto');
    const result = await engine.listArticles('04_adapted');
    expect(result).toEqual(['teaser']);
  });

  it('lists multiple articles sorted', async () => {
    await fs.writeFile(path.join(tmpDir, '02_drafts', 'zebra.md'), 'z');
    await fs.writeFile(path.join(tmpDir, '02_drafts', 'alpha.md'), 'a');
    expect(await engine.listArticles('02_drafts')).toEqual(['alpha', 'zebra']);
  });

  it('excludes dotfiles and yaml files', async () => {
    await fs.writeFile(path.join(tmpDir, '02_drafts', '.hidden.md'), '');
    await fs.writeFile(path.join(tmpDir, '02_drafts', 'meta.yaml'), '');
    await fs.writeFile(path.join(tmpDir, '02_drafts', 'teaser.md'), '');
    expect(await engine.listArticles('02_drafts')).toEqual(['teaser']);
  });

  it('handles articles with dots in name in adapted stage', async () => {
    await fs.writeFile(path.join(tmpDir, '04_adapted', 'my.post.x.md'), 'x');
    await fs.writeFile(path.join(tmpDir, '04_adapted', 'my.post.devto.md'), 'devto');
    expect(await engine.listArticles('04_adapted')).toEqual(['my.post']);
  });
});

// T02: getArticleFiles
describe('getArticleFiles', () => {
  it('returns single file in draft stage', async () => {
    await fs.writeFile(path.join(tmpDir, '02_drafts', 'teaser.md'), '');
    const files = await engine.getArticleFiles('teaser', '02_drafts');
    expect(files).toEqual(['teaser.md']);
  });

  it('returns all platform files in adapted stage', async () => {
    await fs.writeFile(path.join(tmpDir, '04_adapted', 'teaser.x.md'), '');
    await fs.writeFile(path.join(tmpDir, '04_adapted', 'teaser.devto.md'), '');
    await fs.writeFile(path.join(tmpDir, '04_adapted', 'other.x.md'), '');
    const files = await engine.getArticleFiles('teaser', '04_adapted');
    expect(files.sort()).toEqual(['teaser.devto.md', 'teaser.x.md']);
  });

  it('returns empty for unknown article', async () => {
    const files = await engine.getArticleFiles('nonexistent', '02_drafts');
    expect(files).toEqual([]);
  });
});

// T03: moveArticle
describe('moveArticle', () => {
  it('moves single file between stages', async () => {
    await fs.writeFile(path.join(tmpDir, '02_drafts', 'teaser.md'), 'draft content');
    await engine.metadata.writeArticleMeta('teaser', { status: 'drafted' });

    const result = await engine.moveArticle('teaser', '02_drafts', '03_master');

    expect(result.from).toBe('02_drafts');
    expect(result.to).toBe('03_master');
    expect(result.article).toBe('teaser');
    expect(await fs.pathExists(path.join(tmpDir, '03_master', 'teaser.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '02_drafts', 'teaser.md'))).toBe(false);
  });

  it('moves multiple platform files', async () => {
    await fs.writeFile(path.join(tmpDir, '04_adapted', 'teaser.x.md'), 'x');
    await fs.writeFile(path.join(tmpDir, '04_adapted', 'teaser.devto.md'), 'devto');
    await engine.metadata.writeArticleMeta('teaser', { status: 'adapted' });

    await engine.moveArticle('teaser', '04_adapted', '05_scheduled');

    expect(await fs.pathExists(path.join(tmpDir, '05_scheduled', 'teaser.x.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '05_scheduled', 'teaser.devto.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '04_adapted', 'teaser.x.md'))).toBe(false);
    expect(await fs.pathExists(path.join(tmpDir, '04_adapted', 'teaser.devto.md'))).toBe(false);
  });

  it('throws if article not found', async () => {
    await expect(engine.moveArticle('nonexistent', '02_drafts', '03_master'))
      .rejects.toThrow();
  });

  it('throws if target file exists', async () => {
    await fs.writeFile(path.join(tmpDir, '02_drafts', 'teaser.md'), 'draft');
    await fs.writeFile(path.join(tmpDir, '03_master', 'teaser.md'), 'existing');
    await engine.metadata.writeArticleMeta('teaser', { status: 'drafted' });

    await expect(engine.moveArticle('teaser', '02_drafts', '03_master'))
      .rejects.toThrow(/already exists/);
  });

  it('does not move other articles files', async () => {
    await fs.writeFile(path.join(tmpDir, '04_adapted', 'teaser.x.md'), 'x');
    await fs.writeFile(path.join(tmpDir, '04_adapted', 'other.x.md'), 'other');
    await engine.metadata.writeArticleMeta('teaser', { status: 'adapted' });

    await engine.moveArticle('teaser', '04_adapted', '05_scheduled');

    expect(await fs.pathExists(path.join(tmpDir, '04_adapted', 'other.x.md'))).toBe(true);
  });

  it('updates meta status after move', async () => {
    await fs.writeFile(path.join(tmpDir, '02_drafts', 'teaser.md'), 'draft');
    await engine.metadata.writeArticleMeta('teaser', { status: 'drafted' });

    await engine.moveArticle('teaser', '02_drafts', '03_master');

    const meta = await engine.metadata.readArticleMeta('teaser');
    expect(meta?.status).toBe('master');
  });
});

// T04: findDueArticles
describe('findDueArticles', () => {
  it('returns empty when no scheduled articles', async () => {
    expect(await engine.findDueArticles()).toEqual([]);
  });

  it('returns article with past schedule', async () => {
    await fs.writeFile(path.join(tmpDir, '05_scheduled', 'teaser.x.md'), 'x');
    await engine.metadata.writeArticleMeta('teaser', {
      status: 'scheduled',
      schedule: '2020-01-01',
    });

    const due = await engine.findDueArticles();
    expect(due).toEqual(['teaser']);
  });

  it('does not return article with future schedule', async () => {
    await fs.writeFile(path.join(tmpDir, '05_scheduled', 'teaser.x.md'), 'x');
    await engine.metadata.writeArticleMeta('teaser', {
      status: 'scheduled',
      schedule: '2099-12-31T23:59',
    });

    const due = await engine.findDueArticles();
    expect(due).toEqual([]);
  });

  it('returns article with no schedule as immediately due', async () => {
    await fs.writeFile(path.join(tmpDir, '05_scheduled', 'teaser.x.md'), 'x');
    await engine.metadata.writeArticleMeta('teaser', { status: 'scheduled' });

    const due = await engine.findDueArticles();
    expect(due).toEqual(['teaser']);
  });
});

// T05: rollbackArticle
describe('rollbackArticle', () => {
  it('rolls back from drafts to inbox', async () => {
    await fs.writeFile(path.join(tmpDir, '02_drafts', 'teaser.md'), 'draft');
    await engine.metadata.writeArticleMeta('teaser', { status: 'drafted' });

    const result = await engine.rollbackArticle('teaser');

    expect(result.from).toBe('02_drafts');
    expect(result.to).toBe('01_inbox');
    expect(await fs.pathExists(path.join(tmpDir, '01_inbox', 'teaser.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '02_drafts', 'teaser.md'))).toBe(false);
  });

  it('rolls back platform files from scheduled to adapted', async () => {
    await fs.writeFile(path.join(tmpDir, '05_scheduled', 'teaser.x.md'), 'x');
    await fs.writeFile(path.join(tmpDir, '05_scheduled', 'teaser.devto.md'), 'devto');
    await engine.metadata.writeArticleMeta('teaser', { status: 'scheduled' });

    await engine.rollbackArticle('teaser');

    expect(await fs.pathExists(path.join(tmpDir, '04_adapted', 'teaser.x.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '04_adapted', 'teaser.devto.md'))).toBe(true);
  });

  it('throws when article is already at first stage', async () => {
    await fs.writeFile(path.join(tmpDir, '01_inbox', 'teaser.md'), 'raw');
    await engine.metadata.writeArticleMeta('teaser', { status: 'inbox' });

    await expect(engine.rollbackArticle('teaser')).rejects.toThrow(/first stage/i);
  });

  it('throws when article not found', async () => {
    await expect(engine.rollbackArticle('nonexistent')).rejects.toThrow();
  });
});

// T06: readArticleContent, writeArticleFile, getArticlePath
describe('file I/O', () => {
  it('write then read returns same content', async () => {
    await engine.writeArticleFile('02_drafts', 'teaser', 'hello world');
    const content = await engine.readArticleContent('02_drafts', 'teaser');
    expect(content).toBe('hello world');
  });

  it('write with platform creates correct filename', async () => {
    await engine.writeArticleFile('04_adapted', 'teaser', 'x content', 'x');
    expect(await fs.pathExists(path.join(tmpDir, '04_adapted', 'teaser.x.md'))).toBe(true);
  });

  it('read missing file throws', async () => {
    await expect(engine.readArticleContent('02_drafts', 'nonexistent'))
      .rejects.toThrow();
  });

  it('getArticlePath returns correct path', () => {
    expect(engine.getArticlePath('02_drafts', 'teaser'))
      .toBe(path.join(tmpDir, '02_drafts', 'teaser.md'));
    expect(engine.getArticlePath('04_adapted', 'teaser', 'x'))
      .toBe(path.join(tmpDir, '04_adapted', 'teaser.x.md'));
  });
});

// T07: getStatus
describe('getStatus', () => {
  it('returns correct counts per stage', async () => {
    await fs.writeFile(path.join(tmpDir, '01_inbox', 'a.md'), '');
    await fs.writeFile(path.join(tmpDir, '01_inbox', 'b.md'), '');
    await fs.writeFile(path.join(tmpDir, '02_drafts', 'c.md'), '');
    await fs.writeFile(path.join(tmpDir, '04_adapted', 'd.x.md'), '');
    await fs.writeFile(path.join(tmpDir, '04_adapted', 'd.devto.md'), '');

    const status = await engine.getStatus();
    expect(status.stages['01_inbox'].count).toBe(2);
    expect(status.stages['01_inbox'].items).toEqual(['a', 'b']);
    expect(status.stages['02_drafts'].count).toBe(1);
    expect(status.stages['04_adapted'].count).toBe(1); // deduplicated
    expect(status.stages['04_adapted'].items).toEqual(['d']);
    expect(status.totalProjects).toBe(4);
  });

  it('includes due articles in dueToday', async () => {
    await fs.writeFile(path.join(tmpDir, '05_scheduled', 'teaser.x.md'), '');
    await engine.metadata.writeArticleMeta('teaser', {
      status: 'scheduled',
      schedule: '2020-01-01',
    });

    const status = await engine.getStatus();
    expect(status.dueToday).toEqual(['teaser']);
  });
});
