import { describe, test, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';
import { MediaManager } from '../../../src/utils/media.js';
import type { UploadCache } from '../../../src/utils/media.js';

vi.mock('fs-extra', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs-extra')>();
  return {
    ...actual,
    default: {
      ...actual.default,
      pathExists: vi.fn(),
      readFile: vi.fn(),
      stat: vi.fn(),
    },
  };
});

import fs from 'fs-extra';

const WORKING_DIR = '/tmp/project';
const PROJECT_DIR = '/tmp/project';

describe('MediaManager.detectLocalImages', () => {
  const manager = new MediaManager(WORKING_DIR);

  test('detects single image reference', () => {
    const content = '![arch](./images/arch.png)';
    const refs = manager.detectLocalImages(content, PROJECT_DIR);
    expect(refs).toHaveLength(1);
    expect(refs[0].alt).toBe('arch');
    expect(refs[0].localPath).toBe('./images/arch.png');
    expect(refs[0].absolutePath).toBe(path.resolve(PROJECT_DIR, './images/arch.png'));
    expect(refs[0].lineNumber).toBe(1);
  });

  test('detects multiple image references', () => {
    const content = '![one](a.png)\n\nSome text\n\n![two](b.png)';
    const refs = manager.detectLocalImages(content, PROJECT_DIR);
    expect(refs).toHaveLength(2);
    expect(refs[0].localPath).toBe('a.png');
    expect(refs[1].localPath).toBe('b.png');
  });

  test('ignores https URLs', () => {
    const content = '![cdn](https://cdn.example.com/img.png)';
    expect(manager.detectLocalImages(content, PROJECT_DIR)).toHaveLength(0);
  });

  test('ignores http URLs', () => {
    const content = '![cdn](http://example.com/img.png)';
    expect(manager.detectLocalImages(content, PROJECT_DIR)).toHaveLength(0);
  });

  test('handles empty alt text', () => {
    const refs = manager.detectLocalImages('![](images/pic.jpg)', PROJECT_DIR);
    expect(refs).toHaveLength(1);
    expect(refs[0].alt).toBe('');
    expect(refs[0].localPath).toBe('images/pic.jpg');
  });

  test('handles absolute paths', () => {
    const refs = manager.detectLocalImages('![logo](/Users/me/logo.svg)', PROJECT_DIR);
    expect(refs).toHaveLength(1);
    expect(refs[0].absolutePath).toBe('/Users/me/logo.svg');
  });

  test('returns empty array for content with no images', () => {
    expect(manager.detectLocalImages('No images here.', PROJECT_DIR)).toHaveLength(0);
  });

  test('does not detect non-image links', () => {
    const content = '[link text](./file.pdf)';
    expect(manager.detectLocalImages(content, PROJECT_DIR)).toHaveLength(0);
  });
});

describe('MediaManager.replaceUrls', () => {
  const manager = new MediaManager(WORKING_DIR);

  test('replaces single local path with CDN URL', () => {
    const content = '![img](./images/arch.png)';
    const uploads = [{
      localPath: './images/arch.png',
      cdnUrl: 'https://cdn.example.com/arch.png',
      platform: 'devto',
      sizeBytes: 1000,
      uploadedAt: '2026-01-01T00:00:00Z',
    }];
    const result = manager.replaceUrls(content, uploads);
    expect(result).toBe('![img](https://cdn.example.com/arch.png)');
  });

  test('replaces multiple local paths', () => {
    const content = '![a](a.png)\n\n![b](b.png)';
    const uploads = [
      { localPath: 'a.png', cdnUrl: 'https://cdn.example.com/a.png', platform: 'devto', sizeBytes: 100, uploadedAt: '' },
      { localPath: 'b.png', cdnUrl: 'https://cdn.example.com/b.png', platform: 'devto', sizeBytes: 200, uploadedAt: '' },
    ];
    const result = manager.replaceUrls(content, uploads);
    expect(result).toContain('https://cdn.example.com/a.png');
    expect(result).toContain('https://cdn.example.com/b.png');
  });

  test('does not modify content when uploads array is empty', () => {
    const content = '![img](./a.png)';
    expect(manager.replaceUrls(content, [])).toBe(content);
  });

  test('handles paths with special regex characters (dots)', () => {
    const content = '![img](./images/my.arch.png)';
    const uploads = [{
      localPath: './images/my.arch.png',
      cdnUrl: 'https://cdn.example.com/my.arch.png',
      platform: 'devto',
      sizeBytes: 100,
      uploadedAt: '',
    }];
    const result = manager.replaceUrls(content, uploads);
    expect(result).toBe('![img](https://cdn.example.com/my.arch.png)');
  });
});

describe('MediaManager.uploadImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const manager = new MediaManager(WORKING_DIR);
  const ref = {
    alt: 'arch',
    localPath: './images/arch.png',
    absolutePath: '/tmp/project/images/arch.png',
    lineNumber: 1,
  };

  test('returns null and logs warning when file does not exist', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(false as never);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await manager.uploadImage(ref, 'devto', {});
    expect(result).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('not found'));

    vi.restoreAllMocks();
  });

  test('returns null for platform with no upload endpoint (wechat)', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('fake image data') as never);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await manager.uploadImage(ref, 'wechat', {});
    expect(result).toBeNull();

    vi.restoreAllMocks();
  });

  test('uploads to Hashnode with file field name', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('hashnode image') as never);
    let capturedBody: FormData | null = null;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, opts: any) => {
      capturedBody = opts.body;
      return {
        ok: true,
        status: 200,
        json: async () => ({ url: 'https://cdn.hashnode.com/img123.png' }),
      };
    }));

    const result = await manager.uploadImage(ref, 'hashnode', { api_key: 'hn-key' });
    expect(result).not.toBeNull();
    expect(result?.cdnUrl).toBe('https://cdn.hashnode.com/img123.png');
    expect(capturedBody).toBeDefined();

    vi.unstubAllGlobals();
  });

  test('uploads to GitHub via REST content API with base64', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('github image') as never);
    let capturedUrl = '';
    let capturedPayload: any = null;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, opts: any) => {
      capturedUrl = url;
      capturedPayload = JSON.parse(opts.body);
      return {
        ok: true,
        status: 201,
        json: async () => ({ content: { download_url: 'https://raw.githubusercontent.com/user/repo/main/assets/reach-uploads/img.png' } }),
      };
    }));

    const result = await manager.uploadImage(ref, 'github', {
      token: 'gh-token',
      github_owner: 'testuser',
      github_repo: 'testrepo',
    });
    expect(result).not.toBeNull();
    expect(result?.cdnUrl).toContain('raw.githubusercontent.com');
    expect(capturedUrl).toContain('api.github.com/repos/testuser/testrepo/contents/assets/reach-uploads/');
    expect(capturedPayload.content).toBeDefined(); // base64 content
    expect(capturedPayload.message).toContain('Upload image');

    vi.unstubAllGlobals();
  });

  test('GitHub upload returns null when credentials are missing', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('data') as never);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await manager.uploadImage(ref, 'github', { token: 'gh-token' });
    expect(result).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('github_owner'));

    vi.restoreAllMocks();
  });

  test('returns CDN URL on successful upload', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('fake image data') as never);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ url: 'https://dev-to-uploads.s3.amazonaws.com/abc.png' }),
    }));

    const result = await manager.uploadImage(ref, 'devto', { api_key: 'test-key' });
    expect(result).not.toBeNull();
    expect(result?.cdnUrl).toBe('https://dev-to-uploads.s3.amazonaws.com/abc.png');
    expect(result?.sizeBytes).toBe(15); // length of 'fake image data'

    vi.unstubAllGlobals();
  });

  test('returns null and warns on upload API error', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('data') as never);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => 'Unprocessable Entity',
    }));

    const result = await manager.uploadImage(ref, 'devto', { api_key: 'key' });
    expect(result).toBeNull();

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});

describe('MediaManager.processMedia', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const manager = new MediaManager(WORKING_DIR);

  test('returns original content when no local images detected', async () => {
    const content = 'No images here.';
    const result = await manager.processMedia(content, PROJECT_DIR, 'devto', {}, null);
    expect(result.processedContent).toBe(content);
    expect(result.uploads).toHaveLength(0);
  });

  test('skips upload for cached images with matching file size', async () => {
    const content = '![img](./a.png)';
    const cache: UploadCache = {
      uploads: {
        './a.png': {
          cdnUrl: 'https://cdn.example.com/a.png',
          platform: 'devto',
          uploadedAt: '2026-01-01T00:00:00Z',
          sizeBytes: 100,
        },
      },
    };
    vi.mocked(fs.stat).mockResolvedValue({ size: 100 } as never);

    const result = await manager.processMedia(content, PROJECT_DIR, 'devto', {}, cache);
    expect(result.uploads).toHaveLength(1);
    expect(result.uploads[0].cdnUrl).toBe('https://cdn.example.com/a.png');
    expect(result.processedContent).toBe('![img](https://cdn.example.com/a.png)');
  });

  test('re-uploads when file size has changed since cache entry', async () => {
    const content = '![img](./a.png)';
    const cache: UploadCache = {
      uploads: {
        './a.png': {
          cdnUrl: 'https://cdn.example.com/old.png',
          platform: 'devto',
          uploadedAt: '2026-01-01T00:00:00Z',
          sizeBytes: 50, // different from current
        },
      },
    };
    vi.mocked(fs.stat).mockResolvedValue({ size: 100 } as never);
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.alloc(100) as never);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ url: 'https://cdn.example.com/new.png' }),
    }));

    const result = await manager.processMedia(content, PROJECT_DIR, 'devto', { api_key: 'key' }, cache);
    expect(result.uploads[0].cdnUrl).toBe('https://cdn.example.com/new.png');

    vi.unstubAllGlobals();
  });

  test('returns original content for no-upload platforms', async () => {
    const content = '![img](./a.png)';
    const result = await manager.processMedia(content, PROJECT_DIR, 'x', {}, null);
    expect(result.processedContent).toBe(content);
    expect(result.uploads).toHaveLength(0);
  });

  test('continues processing when one image upload fails', async () => {
    const content = '![a](./a.png)\n\n![b](./b.png)';
    vi.mocked(fs.pathExists).mockResolvedValue(false as never); // all files missing
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await manager.processMedia(content, PROJECT_DIR, 'devto', {}, null);
    expect(result.uploads).toHaveLength(0);
    expect(result.processedContent).toBe(content); // unchanged

    vi.restoreAllMocks();
  });

  test('updates cache with new upload entries', async () => {
    const content = '![img](./a.png)';
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('data') as never);
    vi.mocked(fs.stat).mockResolvedValue({ size: 4 } as never);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ url: 'https://cdn.example.com/a.png' }),
    }));

    const result = await manager.processMedia(content, PROJECT_DIR, 'devto', { api_key: 'key' }, null);
    expect(result.updatedCache.uploads['./a.png']).toBeDefined();
    expect(result.updatedCache.uploads['./a.png'].cdnUrl).toBe('https://cdn.example.com/a.png');

    vi.unstubAllGlobals();
  });
});
