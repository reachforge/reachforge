import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import fs from 'fs-extra';
import { MetadataManager } from '../../../src/core/metadata.js';
import { MetadataParseError } from '../../../src/types/index.js';

let tmpDir: string;
let mm: MetadataManager;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aphype-meta-'));
  mm = new MetadataManager(tmpDir);
});

afterEach(async () => {
  await fs.remove(tmpDir);
});

describe('MetadataManager.readMeta', () => {
  test('returns null for missing meta.yaml', async () => {
    await fs.ensureDir(path.join(tmpDir, '01_inbox', 'no-meta'));
    const result = await mm.readMeta('01_inbox', 'no-meta');
    expect(result).toBeNull();
  });

  test('reads and validates a valid meta.yaml', async () => {
    const dir = path.join(tmpDir, '02_drafts', 'my-post');
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, 'meta.yaml'), 'article: my-post\nstatus: drafted\n');

    const meta = await mm.readMeta('02_drafts', 'my-post');
    expect(meta).not.toBeNull();
    expect(meta!.article).toBe('my-post');
    expect(meta!.status).toBe('drafted');
  });

  test('throws MetadataParseError for invalid YAML schema', async () => {
    const dir = path.join(tmpDir, '01_inbox', 'bad-meta');
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, 'meta.yaml'), 'article: test\nstatus: bogus_status\n');

    await expect(mm.readMeta('01_inbox', 'bad-meta')).rejects.toThrow(MetadataParseError);
  });
});

describe('MetadataManager.writeMeta', () => {
  test('creates meta.yaml with content', async () => {
    await mm.writeMeta('02_drafts', 'new-post', { article: 'new-post', status: 'drafted' });

    const filePath = path.join(tmpDir, '02_drafts', 'new-post', 'meta.yaml');
    expect(await fs.pathExists(filePath)).toBe(true);
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('article: new-post');
    expect(content).toContain('status: drafted');
    expect(content).toContain('updated_at:');
  });

  test('merges with existing meta.yaml', async () => {
    const dir = path.join(tmpDir, '04_adapted', 'merge-test');
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, 'meta.yaml'), 'article: merge-test\nstatus: adapted\nnotes: keep me\n');

    await mm.writeMeta('04_adapted', 'merge-test', { status: 'scheduled' });

    const meta = await mm.readMeta('04_adapted', 'merge-test');
    expect(meta!.status).toBe('scheduled');
    expect(meta!.notes).toBe('keep me');
  });
});

describe('MetadataManager.readReceipt / writeReceipt', () => {
  test('round-trips a receipt', async () => {
    const receipt = {
      published_at: '2026-03-15T10:00:00Z',
      items: [
        { platform: 'devto', status: 'success' as const, url: 'https://dev.to/test' },
        { platform: 'x', status: 'failed' as const, error: 'Rate limit' },
      ],
    };

    await fs.ensureDir(path.join(tmpDir, '06_sent', 'receipt-test'));
    await mm.writeReceipt('06_sent', 'receipt-test', receipt);
    const read = await mm.readReceipt('06_sent', 'receipt-test');

    expect(read).not.toBeNull();
    expect(read!.items).toHaveLength(2);
    expect(read!.items[0].platform).toBe('devto');
    expect(read!.items[1].status).toBe('failed');
  });
});
