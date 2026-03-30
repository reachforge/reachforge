import type { PlatformProvider, PublishMeta, PublishResult, ValidationResult, ContentFormat } from './types.js';
import { httpRequest } from '../utils/http.js';
import { markdownToHtml } from '../utils/markdown.js';
import { ProviderError } from '../types/index.js';

const TELEGRAPH_API = 'https://api.telegra.ph';

type TelegraphNode = string | { tag: string; attrs?: Record<string, string>; children?: TelegraphNode[] };

export class TelegraphProvider implements PlatformProvider {
  readonly id = 'telegraph';
  readonly name = 'Telegraph';
  readonly platforms = ['telegraph'];
  readonly contentFormat: ContentFormat = 'html';
  readonly language = 'en';

  constructor(private readonly accessToken: string) {}

  validate(content: string): ValidationResult {
    const errors: string[] = [];

    if (!content || content.trim().length === 0) {
      return { valid: false, errors: ['Telegraph article content is empty.'] };
    }

    let title: string | undefined;
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (fmMatch) {
      const titleMatch = fmMatch[1].match(/title:\s*(.+)/);
      title = titleMatch?.[1]?.trim();
    }
    if (!title) {
      const h1Match = content.match(/^#\s+(.+)$/m);
      title = h1Match?.[1]?.trim();
    }

    if (!title) {
      errors.push('Telegraph article missing title (no frontmatter title or H1 heading found).');
    } else if (title.length > 256) {
      errors.push(`Telegraph title exceeds 256 character limit (found: ${title.length}).`);
    }

    return { valid: errors.length === 0, errors };
  }

  async publish(content: string, meta: PublishMeta = {}): Promise<PublishResult> {
    const html = this.formatContent(content);
    const nodes = htmlToTelegraphNodes(html);
    const title = meta.title ?? this.extractTitleFromHtml(html) ?? 'Untitled';

    const body = JSON.stringify({
      access_token: this.accessToken,
      title,
      content: nodes,
      return_content: false,
    });

    try {
      const response = await httpRequest(`${TELEGRAPH_API}/createPage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      if (!response.ok) {
        throw new ProviderError('telegraph', `API returned ${response.status}: ${response.body}`);
      }

      const data = response.json<{ ok: boolean; result?: { path: string; url: string }; error?: string }>();
      if (!data.ok || !data.result) {
        throw new ProviderError('telegraph', `API error: ${data.error ?? 'Unknown error'}`);
      }

      return { platform: 'telegraph', status: 'success', url: data.result.url, articleId: data.result.path };
    } catch (err: unknown) {
      if (err instanceof ProviderError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      return { platform: 'telegraph', status: 'failed', error: message };
    }
  }

  async update(articleId: string, content: string, meta: PublishMeta = {}): Promise<PublishResult> {
    const html = this.formatContent(content);
    const nodes = htmlToTelegraphNodes(html);
    const title = meta.title ?? this.extractTitleFromHtml(html) ?? 'Untitled';

    const body = JSON.stringify({
      access_token: this.accessToken,
      title,
      content: nodes,
    });

    try {
      const response = await httpRequest(`${TELEGRAPH_API}/editPage/${articleId}`, {
        method: 'POST',        // Telegraph uses POST for edits too
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      if (!response.ok) {
        throw new ProviderError('telegraph', `API returned ${response.status}: ${response.body}`);
      }

      const data = response.json<{ ok: boolean; result?: { path: string; url: string }; error?: string }>();
      if (!data.ok || !data.result) {
        throw new ProviderError('telegraph', `API error: ${data.error ?? 'Unknown error'}`);
      }

      return { platform: 'telegraph', status: 'success', url: data.result.url, articleId: data.result.path };
    } catch (err: unknown) {
      if (err instanceof ProviderError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      return { platform: 'telegraph', status: 'failed', error: message };
    }
  }

  formatContent(content: string): string {
    return markdownToHtml(content);
  }

  private extractTitleFromHtml(html: string): string | undefined {
    const match = html.match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/i);
    return match?.[1]?.replace(/<[^>]+>/g, '').trim();
  }
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

export function htmlToTelegraphNodes(html: string): TelegraphNode[] {
  const nodes: TelegraphNode[] = [];
  // Mapping: h1/h2 -> h3, h5/h6 -> h4 (Telegraph only has h3/h4)
  const TAG_MAP: Record<string, string> = { h1: 'h3', h2: 'h3', h5: 'h4', h6: 'h4' };
  const ALLOWED_TAGS = new Set([
    'a', 'aside', 'b', 'blockquote', 'br', 'code', 'em', 'figcaption',
    'figure', 'h3', 'h4', 'hr', 'i', 'img', 'li', 'ol', 'p', 'pre',
    's', 'strong', 'u', 'ul',
  ]);

  // Regex-based parser: split HTML into tags and text segments
  const TOKEN_RE = /<(\/?)(\w+)([^>]*)>/g;
  let lastIndex = 0;
  const stack: { tag: string; attrs?: Record<string, string>; children: TelegraphNode[] }[] = [];

  function addToParent(node: TelegraphNode): void {
    if (stack.length > 0) {
      stack[stack.length - 1].children.push(node);
    } else {
      nodes.push(node);
    }
  }

  function parseAttrs(attrStr: string): Record<string, string> | undefined {
    const attrs: Record<string, string> = {};
    for (const m of attrStr.matchAll(/(\w+)="([^"]*)"/g)) {
      attrs[m[1]] = m[2];
    }
    return Object.keys(attrs).length > 0 ? attrs : undefined;
  }

  for (const match of html.matchAll(TOKEN_RE)) {
    // Add text before this tag
    const text = html.slice(lastIndex, match.index).trim();
    if (text) addToParent(decodeHtmlEntities(text));
    lastIndex = match.index! + match[0].length;

    const isClose = match[1] === '/';
    let tag = match[2].toLowerCase();
    const attrStr = match[3];

    // Map unsupported heading tags
    if (TAG_MAP[tag]) tag = TAG_MAP[tag];

    // Skip unsupported tags (unwrap their children)
    if (!ALLOWED_TAGS.has(tag)) continue;

    if (isClose) {
      // Pop from stack, add completed node to parent
      if (stack.length > 0 && stack[stack.length - 1].tag === tag) {
        const completed = stack.pop()!;
        const node: TelegraphNode = { tag: completed.tag };
        if (completed.attrs) node.attrs = completed.attrs;
        if (completed.children.length > 0) node.children = completed.children;
        addToParent(node);
      }
    } else if (tag === 'br' || tag === 'hr' || tag === 'img') {
      // Self-closing tags
      const attrs = parseAttrs(attrStr);
      const node: TelegraphNode = { tag };
      if (attrs) node.attrs = attrs;
      addToParent(node);
    } else {
      // Opening tag
      stack.push({ tag, attrs: parseAttrs(attrStr), children: [] });
    }
  }

  // Remaining text
  const remaining = html.slice(lastIndex).trim();
  if (remaining) addToParent(decodeHtmlEntities(remaining));

  return nodes;
}
