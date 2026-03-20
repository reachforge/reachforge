import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import fs from 'fs-extra';
import { MetadataManager } from '../../../src/core/metadata.js';
import { MetadataParseError } from '../../../src/types/index.js';

let tmpDir: string;
let mm: MetadataManager;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reach-meta-'));
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
      status: 'completed' as const,
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
    expect(read!.status).toBe('completed');
    expect(read!.items).toHaveLength(2);
    expect(read!.items[0].platform).toBe('devto');
    expect(read!.items[1].status).toBe('failed');
  });

  test('supports publishing and partial status', async () => {
    await fs.ensureDir(path.join(tmpDir, '05_scheduled', 'progress-test'));

    const receipt = {
      status: 'publishing' as const,
      published_at: '2026-03-19T10:00:00Z',
      items: [
        { platform: 'x', status: 'pending' as const },
        { platform: 'devto', status: 'sending' as const },
      ],
    };

    await mm.writeReceipt('05_scheduled', 'progress-test', receipt);
    const read = await mm.readReceipt('05_scheduled', 'progress-test');

    expect(read!.status).toBe('publishing');
    expect(read!.items[0].status).toBe('pending');
    expect(read!.items[1].status).toBe('sending');
  });
});

describe('MetadataManager.lockProject / unlockProject / isLocked', () => {
  test('acquires and releases lock', async () => {
    await fs.ensureDir(path.join(tmpDir, '05_scheduled', 'lock-test'));

    const acquired = await mm.lockProject('05_scheduled', 'lock-test');
    expect(acquired).toBe(true);

    const locked = await mm.isLocked('05_scheduled', 'lock-test');
    expect(locked).toBe(true);

    await mm.unlockProject('05_scheduled', 'lock-test');

    const lockedAfter = await mm.isLocked('05_scheduled', 'lock-test');
    expect(lockedAfter).toBe(false);
  });

  test('rejects second lock from same process', async () => {
    await fs.ensureDir(path.join(tmpDir, '05_scheduled', 'double-lock'));

    const first = await mm.lockProject('05_scheduled', 'double-lock');
    expect(first).toBe(true);

    // Same PID — process.kill(pid, 0) returns true for own process
    const second = await mm.lockProject('05_scheduled', 'double-lock');
    expect(second).toBe(false);
  });

  test('reclaims stale lock from dead process', async () => {
    await fs.ensureDir(path.join(tmpDir, '05_scheduled', 'stale-lock'));

    // Write a lock with a PID that definitely doesn't exist
    const lockPath = path.join(tmpDir, '05_scheduled', 'stale-lock', '.publish.lock');
    const yaml = await import('js-yaml');
    await fs.writeFile(lockPath, yaml.dump({ pid: 999999, started_at: '2026-03-19T00:00:00Z', hostname: 'test' }));

    // Should reclaim the stale lock
    const acquired = await mm.lockProject('05_scheduled', 'stale-lock');
    expect(acquired).toBe(true);
  });

  test('readLock returns lock info', async () => {
    await fs.ensureDir(path.join(tmpDir, '05_scheduled', 'info-lock'));

    await mm.lockProject('05_scheduled', 'info-lock');
    const info = await mm.readLock('05_scheduled', 'info-lock');

    expect(info).not.toBeNull();
    expect(info!.pid).toBe(process.pid);
    expect(info!.started_at).toBeDefined();
    expect(info!.hostname).toBeDefined();
  });

  test('readLock returns null when no lock', async () => {
    await fs.ensureDir(path.join(tmpDir, '05_scheduled', 'no-lock'));
    const info = await mm.readLock('05_scheduled', 'no-lock');
    expect(info).toBeNull();
  });

  test('isLocked returns false for corrupted lock file', async () => {
    await fs.ensureDir(path.join(tmpDir, '05_scheduled', 'corrupt-lock'));
    const lockPath = path.join(tmpDir, '05_scheduled', 'corrupt-lock', '.publish.lock');
    await fs.writeFile(lockPath, 'not valid yaml: [[[');

    const locked = await mm.isLocked('05_scheduled', 'corrupt-lock');
    expect(locked).toBe(false);
  });
});

describe('MetadataManager.readUploadCache / writeUploadCache', () => {
  test('returns null when no cache file exists', async () => {
    await fs.ensureDir(path.join(tmpDir, '05_scheduled', 'no-cache'));
    const cache = await mm.readUploadCache('05_scheduled', 'no-cache');
    expect(cache).toBeNull();
  });

  test('writes and reads upload cache', async () => {
    const dir = path.join(tmpDir, '05_scheduled', 'cached');
    await fs.ensureDir(dir);

    const cache = {
      uploads: {
        './images/logo.png': {
          cdnUrl: 'https://cdn.example.com/logo.png',
          platform: 'devto',
          uploadedAt: '2026-03-20T10:00:00Z',
          sizeBytes: 1024,
        },
      },
    };

    await mm.writeUploadCache('05_scheduled', 'cached', cache);
    const read = await mm.readUploadCache('05_scheduled', 'cached');
    expect(read).not.toBeNull();
    expect(read!.uploads['./images/logo.png'].cdnUrl).toBe('https://cdn.example.com/logo.png');
  });

  test('returns null for corrupted cache file', async () => {
    const dir = path.join(tmpDir, '05_scheduled', 'bad-cache');
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, '.upload_cache.yaml'), 'not valid: [[[');

    const cache = await mm.readUploadCache('05_scheduled', 'bad-cache');
    expect(cache).toBeNull();
  });
});
