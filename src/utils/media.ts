import * as path from 'path';
import fs from 'fs-extra';

export interface MediaReference {
  alt: string;
  localPath: string;
  absolutePath: string;
  lineNumber: number;
}

export interface MediaUploadResult {
  localPath: string;
  cdnUrl: string;
  platform: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface UploadRecord {
  cdnUrl: string;
  platform: string;
  uploadedAt: string;
  sizeBytes: number;
}

export interface UploadCache {
  uploads: Record<string, UploadRecord>;
}

// Platforms that don't need media upload (handled externally or not applicable)
const NO_UPLOAD_PLATFORMS = new Set(['x', 'wechat', 'zhihu']);

// Upload endpoints per platform
// Note: Dev.to has no public image upload API — images must be hosted externally.
const UPLOAD_ENDPOINTS: Record<string, string> = {
  hashnode: 'https://api.hashnode.com/upload',
};

export class MediaManager {
  constructor(
    private readonly workingDir: string,
  ) {}

  detectLocalImages(content: string, projectDir: string): MediaReference[] {
    const results: MediaReference[] = [];

    for (const match of content.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)) {
      const alt = match[1];
      const rawPath = match[2];

      // Skip already-hosted URLs
      if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) continue;

      const absolutePath = path.resolve(projectDir, rawPath);
      const lineNumber = content.slice(0, match.index).split('\n').length;

      results.push({ alt, localPath: rawPath, absolutePath, lineNumber });
    }

    return results;
  }

  async uploadImage(
    ref: MediaReference,
    platform: string,
    credentials: Record<string, string>,
  ): Promise<MediaUploadResult | null> {
    const exists = await fs.pathExists(ref.absolutePath);
    if (!exists) {
      console.warn(`Image file not found: ${ref.absolutePath}; skipping.`);
      return null;
    }

    const fileBuffer = await fs.readFile(ref.absolutePath);
    const sizeBytes = fileBuffer.length;

    // GitHub uses REST content API (base64), not multipart upload
    if (platform === 'github') {
      return this.uploadImageToGitHub(ref, fileBuffer, sizeBytes, credentials);
    }

    const endpoint = UPLOAD_ENDPOINTS[platform];

    if (!endpoint) {
      console.warn(`${platform} does not support image upload — use an already-hosted URL instead.`);
      return null;
    }

    try {
      const filename = path.basename(ref.absolutePath);
      const mimeType = guessMimeType(filename);

      const formData = new FormData();
      // Hashnode uses 'file' field, Dev.to uses 'image' field
      const fieldName = platform === 'hashnode' ? 'file' : 'image';
      formData.append(fieldName, new Blob([fileBuffer], { type: mimeType }), filename);

      const authHeader: Record<string, string> = credentials['api_key']
        ? { 'api-key': credentials['api_key'] }
        : credentials['token']
          ? { 'Authorization': `Bearer ${credentials['token']}` }
          : {};

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: authHeader,
        body: formData,
      });

      if (!response.ok) {
        const body = await response.text();
        console.warn(`Upload failed for ${ref.localPath} on ${platform}: ${response.status} ${body}`);
        return null;
      }

      const data = await response.json() as { url?: string; cdn_url?: string };
      const cdnUrl = data.url ?? data.cdn_url ?? '';

      if (!cdnUrl) {
        console.warn(`Upload response for ${ref.localPath} did not include a URL.`);
        return null;
      }

      return {
        localPath: ref.localPath,
        cdnUrl,
        platform,
        sizeBytes,
        uploadedAt: new Date().toISOString(),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`Upload error for ${ref.localPath}: ${msg}`);
      return null;
    }
  }

  private async uploadImageToGitHub(
    ref: MediaReference,
    fileBuffer: Buffer,
    sizeBytes: number,
    credentials: Record<string, string>,
  ): Promise<MediaUploadResult | null> {
    const token = credentials['token'];
    const owner = credentials['github_owner'];
    const repo = credentials['github_repo'];

    if (!token || !owner || !repo) {
      console.warn(`GitHub image upload requires token, github_owner, and github_repo; skipping.`);
      return null;
    }

    // Validate owner and repo to prevent SSRF via path traversal or special characters
    if (!/^[a-zA-Z0-9_.-]+$/.test(owner) || !/^[a-zA-Z0-9_.-]+$/.test(repo)) {
      console.warn(`GitHub image upload skipped: invalid owner "${owner}" or repo "${repo}" (must be alphanumeric, dots, hyphens, underscores).`);
      return null;
    }

    try {
      const filename = path.basename(ref.absolutePath);
      const timestamp = Date.now();
      const uploadPath = `assets/reach-uploads/${timestamp}-${filename}`;
      const base64Content = fileBuffer.toString('base64');

      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${uploadPath}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28',
          },
          body: JSON.stringify({
            message: `Upload image: ${filename}`,
            content: base64Content,
          }),
        },
      );

      if (!response.ok) {
        const body = await response.text();
        console.warn(`GitHub upload failed for ${ref.localPath}: ${response.status} ${body}`);
        return null;
      }

      const data = await response.json() as { content?: { download_url?: string } };
      const cdnUrl = data.content?.download_url ?? '';

      if (!cdnUrl) {
        console.warn(`GitHub upload response for ${ref.localPath} did not include a download URL.`);
        return null;
      }

      return {
        localPath: ref.localPath,
        cdnUrl,
        platform: 'github',
        sizeBytes,
        uploadedAt: new Date().toISOString(),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`GitHub upload error for ${ref.localPath}: ${msg}`);
      return null;
    }
  }

  replaceUrls(content: string, uploads: MediaUploadResult[]): string {
    let result = content;
    for (const upload of uploads) {
      // Escape special regex chars in localPath for safe replacement
      const escapedPath = upload.localPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(escapedPath, 'g'), upload.cdnUrl);
    }
    return result;
  }

  async uploadCoverImage(
    coverPath: string,
    platform: string,
    credentials: Record<string, string>,
    cache: UploadCache | null,
  ): Promise<{ cdnUrl: string; updatedCache: UploadCache } | null> {
    // Already a remote URL — use directly
    if (coverPath.startsWith('http://') || coverPath.startsWith('https://')) {
      return { cdnUrl: coverPath, updatedCache: cache ?? { uploads: {} } };
    }

    const absolutePath = path.resolve(this.workingDir, coverPath);
    const cacheKey = `cover:${coverPath}`;
    const updatedCache: UploadCache = { uploads: { ...(cache?.uploads ?? {}) } };

    // Check cache
    const cached = updatedCache.uploads[cacheKey];
    if (cached && cached.platform === platform) {
      try {
        const stat = await fs.stat(absolutePath);
        if (stat.size === cached.sizeBytes) {
          return { cdnUrl: cached.cdnUrl, updatedCache };
        }
      } catch {
        // file changed or missing — re-upload
      }
    }

    const ref: MediaReference = {
      alt: 'cover',
      localPath: coverPath,
      absolutePath,
      lineNumber: 0,
    };

    const result = await this.uploadImage(ref, platform, credentials);
    if (!result) return null;

    updatedCache.uploads[cacheKey] = {
      cdnUrl: result.cdnUrl,
      platform: result.platform,
      uploadedAt: result.uploadedAt,
      sizeBytes: result.sizeBytes,
    };

    return { cdnUrl: result.cdnUrl, updatedCache };
  }

  async processMedia(
    content: string,
    projectDir: string,
    platform: string,
    credentials: Record<string, string>,
    cache: UploadCache | null,
  ): Promise<{ processedContent: string; updatedCache: UploadCache; uploads: MediaUploadResult[] }> {
    if (NO_UPLOAD_PLATFORMS.has(platform)) {
      return { processedContent: content, updatedCache: cache ?? { uploads: {} }, uploads: [] };
    }

    const refs = this.detectLocalImages(content, projectDir);
    if (refs.length === 0) {
      return { processedContent: content, updatedCache: cache ?? { uploads: {} }, uploads: [] };
    }

    const updatedCache: UploadCache = { uploads: { ...(cache?.uploads ?? {}) } };
    const uploads: MediaUploadResult[] = [];

    for (const ref of refs) {
      const cached = updatedCache.uploads[ref.localPath];

      if (cached && cached.platform === platform) {
        // Check if file size changed
        let currentSize = -1;
        try {
          const stat = await fs.stat(ref.absolutePath);
          currentSize = stat.size;
        } catch {
          // file missing — will re-upload attempt (which will warn + skip)
        }

        if (currentSize === cached.sizeBytes) {
          // Use cached CDN URL
          uploads.push({
            localPath: ref.localPath,
            cdnUrl: cached.cdnUrl,
            platform,
            sizeBytes: cached.sizeBytes,
            uploadedAt: cached.uploadedAt,
          });
          continue;
        }
      }

      const result = await this.uploadImage(ref, platform, credentials);
      if (!result) continue;

      uploads.push(result);
      updatedCache.uploads[ref.localPath] = {
        cdnUrl: result.cdnUrl,
        platform: result.platform,
        uploadedAt: result.uploadedAt,
        sizeBytes: result.sizeBytes,
      };
    }

    const processedContent = this.replaceUrls(content, uploads);
    return { processedContent, updatedCache, uploads };
  }
}

export function guessMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
  };
  return map[ext] ?? 'application/octet-stream';
}
