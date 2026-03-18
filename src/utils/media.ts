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
const UPLOAD_ENDPOINTS: Record<string, string> = {
  devto: 'https://dev.to/api/images',
};

export class MediaManager {
  constructor(
    private readonly workingDir: string,
  ) {}

  detectLocalImages(content: string, projectDir: string): MediaReference[] {
    const results: MediaReference[] = [];
    const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
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
    const endpoint = UPLOAD_ENDPOINTS[platform];

    if (!endpoint) {
      console.warn(`No upload endpoint configured for platform '${platform}'; skipping media upload.`);
      return null;
    }

    try {
      const filename = path.basename(ref.absolutePath);
      const mimeType = guessMimeType(filename);

      // Build multipart/form-data manually using Blob/FormData (Node 18+ native)
      const formData = new FormData();
      formData.append('image', new Blob([fileBuffer], { type: mimeType }), filename);

      const authHeader = credentials['api_key']
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

  replaceUrls(content: string, uploads: MediaUploadResult[]): string {
    let result = content;
    for (const upload of uploads) {
      // Escape special regex chars in localPath for safe replacement
      const escapedPath = upload.localPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(escapedPath, 'g'), upload.cdnUrl);
    }
    return result;
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

function guessMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
  };
  return map[ext] ?? 'application/octet-stream';
}
