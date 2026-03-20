import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import fs from 'fs-extra';
import { assetAddCommand, assetListCommand } from '../../../src/commands/asset.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reach-asset-cmd-'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.remove(tmpDir);
});

describe('assetAddCommand', () => {
  test('registers a file and copies it into assets', async () => {
    const src = path.join(tmpDir, 'photo.jpg');
    await fs.writeFile(src, 'jpeg-data');

    await assetAddCommand(tmpDir, src);

    expect(await fs.pathExists(path.join(tmpDir, 'assets', 'images', 'photo.jpg'))).toBe(true);
  });

  test('respects explicit --subdir option', async () => {
    const src = path.join(tmpDir, 'data.bin');
    await fs.writeFile(src, 'binary-data');

    await assetAddCommand(tmpDir, src, { subdir: 'videos' });

    expect(await fs.pathExists(path.join(tmpDir, 'assets', 'videos', 'data.bin'))).toBe(true);
  });

  test('throws for non-existent file', async () => {
    await expect(assetAddCommand(tmpDir, '/no/such/file.png')).rejects.toThrow('File not found');
  });

  test('throws for invalid subdir', async () => {
    const src = path.join(tmpDir, 'test.png');
    await fs.writeFile(src, 'data');
    await expect(assetAddCommand(tmpDir, src, { subdir: 'invalid' })).rejects.toThrow('Invalid subdir');
  });
});

describe('assetListCommand', () => {
  test('lists registered assets', async () => {
    const src = path.join(tmpDir, 'logo.png');
    await fs.writeFile(src, 'png-data');
    await assetAddCommand(tmpDir, src);

    await assetListCommand(tmpDir);

    const logs = (console.log as any).mock.calls.flat().join('\n');
    expect(logs).toContain('logo.png');
  });

  test('shows empty message when no assets', async () => {
    await assetListCommand(tmpDir);

    const logs = (console.log as any).mock.calls.flat().join('\n');
    expect(logs).toContain('No assets');
  });

  test('filters by subdir', async () => {
    const img = path.join(tmpDir, 'a.png');
    const vid = path.join(tmpDir, 'b.mp4');
    await fs.writeFile(img, 'img');
    await fs.writeFile(vid, 'vid');
    await assetAddCommand(tmpDir, img);
    await assetAddCommand(tmpDir, vid);

    // Reset log mock to only capture list output
    (console.log as any).mockClear();
    await assetListCommand(tmpDir, { subdir: 'images' });

    const logs = (console.log as any).mock.calls.flat().join('\n');
    expect(logs).toContain('a.png');
    expect(logs).not.toContain('b.mp4');
  });
});
