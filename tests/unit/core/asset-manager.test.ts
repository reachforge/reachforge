import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import fs from 'fs-extra';
import { AssetManager } from '../../../src/core/asset-manager.js';

let tmpDir: string;
let mgr: AssetManager;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reach-asset-'));
  mgr = new AssetManager(tmpDir);
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.remove(tmpDir);
});

describe('initAssets', () => {
  test('creates assets directory structure and empty registry', async () => {
    await mgr.initAssets();

    expect(await fs.pathExists(path.join(tmpDir, 'assets', 'images'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, 'assets', 'videos'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, 'assets', 'audio'))).toBe(true);

    const registry = await mgr.readRegistry();
    expect(registry.assets).toEqual([]);
  });

  test('does not overwrite existing registry', async () => {
    await mgr.initAssets();
    const entry = await mgr.register(await createTempFile(tmpDir, 'test.png'));
    await mgr.initAssets(); // call again

    const registry = await mgr.readRegistry();
    expect(registry.assets).toHaveLength(1);
    expect(registry.assets[0].filename).toBe('test.png');
  });
});

describe('register', () => {
  test('copies file into correct subdir and adds to registry', async () => {
    const src = await createTempFile(tmpDir, 'logo.png');

    const entry = await mgr.register(src);

    expect(entry.filename).toBe('logo.png');
    expect(entry.subdir).toBe('images');
    expect(entry.mime).toBe('image/png');
    expect(entry.source).toBe('manual');
    expect(entry.size_bytes).toBeGreaterThan(0);
    expect(await fs.pathExists(path.join(tmpDir, 'assets', 'images', 'logo.png'))).toBe(true);
  });

  test('auto-detects subdir for video files', async () => {
    const src = await createTempFile(tmpDir, 'demo.mp4');
    const entry = await mgr.register(src);
    expect(entry.subdir).toBe('videos');
  });

  test('auto-detects subdir for audio files', async () => {
    const src = await createTempFile(tmpDir, 'podcast.mp3');
    const entry = await mgr.register(src);
    expect(entry.subdir).toBe('audio');
  });

  test('uses explicit subdir override', async () => {
    const src = await createTempFile(tmpDir, 'data.bin');
    const entry = await mgr.register(src, 'images');
    expect(entry.subdir).toBe('images');
  });

  test('throws for unknown extension without explicit subdir', async () => {
    const src = await createTempFile(tmpDir, 'unknown.xyz');
    await expect(mgr.register(src)).rejects.toThrow('Cannot determine asset type');
  });

  test('throws for non-existent file', async () => {
    await expect(mgr.register('/no/such/file.png')).rejects.toThrow('File not found');
  });

  test('replaces existing entry with same filename and subdir', async () => {
    const src1 = await createTempFile(tmpDir, 'logo.png', 'v1');
    await mgr.register(src1);

    // Update source file content
    await fs.writeFile(src1, 'v2-larger-content');
    await mgr.register(src1);

    const registry = await mgr.readRegistry();
    expect(registry.assets).toHaveLength(1);
    expect(registry.assets[0].size_bytes).toBe('v2-larger-content'.length);
  });
});

describe('listAssets', () => {
  test('returns all assets', async () => {
    await mgr.register(await createTempFile(tmpDir, 'a.png'));
    await mgr.register(await createTempFile(tmpDir, 'b.mp4'));

    const all = await mgr.listAssets();
    expect(all).toHaveLength(2);
  });

  test('filters by subdir', async () => {
    await mgr.register(await createTempFile(tmpDir, 'a.png'));
    await mgr.register(await createTempFile(tmpDir, 'b.mp4'));

    expect(await mgr.listAssets('images')).toHaveLength(1);
    expect(await mgr.listAssets('videos')).toHaveLength(1);
    expect(await mgr.listAssets('audio')).toHaveLength(0);
  });

  test('returns empty array when no registry exists', async () => {
    const assets = await mgr.listAssets();
    expect(assets).toEqual([]);
  });
});

describe('resolveAssetReferences', () => {
  test('replaces @assets/ prefix with absolute path', () => {
    const content = '![logo](@assets/images/logo.png)';
    const resolved = mgr.resolveAssetReferences(content);
    expect(resolved).toBe(`![logo](${path.join(tmpDir, 'assets')}/images/logo.png)`);
  });

  test('handles multiple references', () => {
    const content = '![a](@assets/images/a.png)\n![b](@assets/videos/b.mp4)';
    const resolved = mgr.resolveAssetReferences(content);
    const assetsDir = path.join(tmpDir, 'assets');
    expect(resolved).toContain(`${assetsDir}/images/a.png`);
    expect(resolved).toContain(`${assetsDir}/videos/b.mp4`);
  });

  test('leaves non-asset paths untouched', () => {
    const content = '![img](./images/local.png)\n![ext](https://cdn.example.com/img.png)';
    const resolved = mgr.resolveAssetReferences(content);
    expect(resolved).toBe(content);
  });

  test('leaves content without asset references unchanged', () => {
    const content = '# Hello World\n\nNo images here.';
    expect(mgr.resolveAssetReferences(content)).toBe(content);
  });
});

describe('inferSubdir', () => {
  test('returns correct subdir for known extensions', () => {
    expect(mgr.inferSubdir('photo.jpg')).toBe('images');
    expect(mgr.inferSubdir('clip.mp4')).toBe('videos');
    expect(mgr.inferSubdir('song.mp3')).toBe('audio');
  });

  test('returns null for unknown extensions', () => {
    expect(mgr.inferSubdir('data.csv')).toBeNull();
  });
});

describe('getAssetRef', () => {
  test('returns correct reference string', () => {
    expect(mgr.getAssetRef('images', 'logo.png')).toBe('@assets/images/logo.png');
  });
});

// Helper: create a temp file and return its path
async function createTempFile(dir: string, name: string, content = 'test-content'): Promise<string> {
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, content);
  return filePath;
}
