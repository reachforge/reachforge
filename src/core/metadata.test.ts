import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import fs from 'fs-extra';
import os from 'os';
import { MetadataManager } from './metadata.js';

let tmpDir: string;
let mm: MetadataManager;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reach-meta-test-'));
  mm = new MetadataManager(tmpDir);
});

afterEach(async () => {
  await fs.remove(tmpDir);
});

// T01: Schemas are tested implicitly through MetadataManager usage

// T02: readProjectMeta / readArticleMeta
describe('readProjectMeta', () => {
  it('returns empty articles for missing meta.yaml', async () => {
    const meta = await mm.readProjectMeta();
    expect(meta.articles).toEqual({});
  });

  it('reads valid meta.yaml', async () => {
    await fs.writeFile(path.join(tmpDir, 'meta.yaml'),
      'articles:\n  teaser:\n    status: drafted\n');
    const meta = await mm.readProjectMeta();
    expect(meta.articles.teaser.status).toBe('drafted');
  });

  it('throws on invalid YAML', async () => {
    await fs.writeFile(path.join(tmpDir, 'meta.yaml'), '{{invalid yaml');
    await expect(mm.readProjectMeta()).rejects.toThrow();
  });
});

describe('readArticleMeta', () => {
  it('returns null for missing article', async () => {
    const result = await mm.readArticleMeta('nonexistent');
    expect(result).toBeNull();
  });

  it('returns article meta when present', async () => {
    await mm.writeArticleMeta('teaser', { status: 'drafted' });
    const result = await mm.readArticleMeta('teaser');
    expect(result?.status).toBe('drafted');
  });
});

// T03: writeArticleMeta
describe('writeArticleMeta', () => {
  it('creates new article entry', async () => {
    await mm.writeArticleMeta('teaser', { status: 'drafted' });
    const meta = await mm.readProjectMeta();
    expect(meta.articles.teaser.status).toBe('drafted');
    expect(meta.articles.teaser.created_at).toBeDefined();
    expect(meta.articles.teaser.updated_at).toBeDefined();
  });

  it('preserves other articles when writing', async () => {
    await mm.writeArticleMeta('teaser', { status: 'drafted' });
    await mm.writeArticleMeta('deep-dive', { status: 'drafted' });
    const meta = await mm.readProjectMeta();
    expect(meta.articles.teaser.status).toBe('drafted');
    expect(meta.articles['deep-dive'].status).toBe('drafted');
  });

  it('merges partial updates', async () => {
    await mm.writeArticleMeta('teaser', { status: 'inbox' as any, notes: 'hello' });
    await mm.writeArticleMeta('teaser', { status: 'drafted' });
    const result = await mm.readArticleMeta('teaser');
    expect(result?.status).toBe('drafted');
    expect(result?.notes).toBe('hello');
  });

  it('auto-sets updated_at on every write', async () => {
    await mm.writeArticleMeta('teaser', { status: 'drafted' });
    const first = await mm.readArticleMeta('teaser');
    await new Promise(r => setTimeout(r, 10));
    await mm.writeArticleMeta('teaser', { status: 'drafted' });
    const second = await mm.readArticleMeta('teaser');
    expect(second!.updated_at).not.toBe(first!.updated_at);
  });

  it('sets created_at only on first write', async () => {
    await mm.writeArticleMeta('teaser', { status: 'drafted' });
    const first = await mm.readArticleMeta('teaser');
    await mm.writeArticleMeta('teaser', { status: 'drafted' });
    const second = await mm.readArticleMeta('teaser');
    expect(second!.created_at).toBe(first!.created_at);
  });
});

// T04: listArticles / deleteArticleMeta
describe('listArticles', () => {
  it('returns empty array when no articles', async () => {
    const list = await mm.listArticles();
    expect(list).toEqual([]);
  });

  it('returns all articles with meta', async () => {
    await mm.writeArticleMeta('teaser', { status: 'drafted' });
    await mm.writeArticleMeta('deep-dive', { status: 'drafted' });
    const list = await mm.listArticles();
    expect(list).toHaveLength(2);
    expect(list.map(a => a.name).sort()).toEqual(['deep-dive', 'teaser']);
  });
});

describe('deleteArticleMeta', () => {
  it('removes only the target article', async () => {
    await mm.writeArticleMeta('teaser', { status: 'drafted' });
    await mm.writeArticleMeta('deep-dive', { status: 'drafted' });
    await mm.deleteArticleMeta('teaser');
    const list = await mm.listArticles();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('deep-dive');
  });
});

// T05: updatePlatformStatus
describe('updatePlatformStatus', () => {
  it('adds platform publish status', async () => {
    await mm.writeArticleMeta('teaser', { status: 'scheduled' });
    await mm.updatePlatformStatus('teaser', 'x', { status: 'success', url: 'https://x.com/123' });
    const meta = await mm.readArticleMeta('teaser');
    expect(meta?.platforms?.x.status).toBe('success');
    expect(meta?.platforms?.x.url).toBe('https://x.com/123');
  });

  it('merges with existing platform status', async () => {
    await mm.writeArticleMeta('teaser', { status: 'scheduled' });
    await mm.updatePlatformStatus('teaser', 'x', { status: 'pending' });
    await mm.updatePlatformStatus('teaser', 'x', { status: 'success', url: 'https://x.com/123' });
    const meta = await mm.readArticleMeta('teaser');
    expect(meta?.platforms?.x.status).toBe('success');
    expect(meta?.platforms?.x.url).toBe('https://x.com/123');
  });

  it('throws for missing article', async () => {
    await expect(
      mm.updatePlatformStatus('nonexistent', 'x', { status: 'pending' })
    ).rejects.toThrow();
  });
});

// T06: locking
describe('lockArticle / unlockArticle / isArticleLocked', () => {
  it('acquires lock successfully', async () => {
    await mm.writeArticleMeta('teaser', { status: 'scheduled' });
    const result = await mm.lockArticle('teaser');
    expect(result).toBe(true);
  });

  it('fails to lock when already locked by live process', async () => {
    await mm.writeArticleMeta('teaser', { status: 'scheduled' });
    await mm.lockArticle('teaser');
    // Same process PID is alive, so second lock should fail
    const result = await mm.lockArticle('teaser');
    expect(result).toBe(false);
  });

  it('unlock allows re-locking', async () => {
    await mm.writeArticleMeta('teaser', { status: 'scheduled' });
    await mm.lockArticle('teaser');
    await mm.unlockArticle('teaser');
    const result = await mm.lockArticle('teaser');
    expect(result).toBe(true);
  });

  it('isArticleLocked returns correct state', async () => {
    await mm.writeArticleMeta('teaser', { status: 'scheduled' });
    expect(await mm.isArticleLocked('teaser')).toBe(false);
    await mm.lockArticle('teaser');
    expect(await mm.isArticleLocked('teaser')).toBe(true);
    await mm.unlockArticle('teaser');
    expect(await mm.isArticleLocked('teaser')).toBe(false);
  });

  it('cleans up stale lock (dead PID)', async () => {
    await mm.writeArticleMeta('teaser', { status: 'scheduled' });
    // Write a lock with a definitely-dead PID
    const meta = await mm.readProjectMeta();
    meta._locks = { teaser: { pid: 999999999, started_at: new Date().toISOString(), hostname: 'test' } };
    await fs.writeFile(path.join(tmpDir, 'meta.yaml'),
      (await import('js-yaml')).dump(meta, { lineWidth: -1 }));

    // Should detect stale lock and allow re-locking
    const result = await mm.lockArticle('teaser');
    expect(result).toBe(true);
  });
});
