import { Marked } from 'marked';

const marked = new Marked();

/**
 * Convert Markdown to HTML.
 * Strips YAML frontmatter (---...---) before conversion.
 */
export function markdownToHtml(md: string): string {
  let content = md;

  // Strip YAML frontmatter if present
  const fmMatch = content.match(/^---\n[\s\S]*?\n---\n?/);
  if (fmMatch) {
    content = content.slice(fmMatch[0].length);
  }

  return marked.parse(content, { async: false }) as string;
}

/**
 * Sanitize HTML for WeChat public account.
 * WeChat only allows a strict subset of tags.
 */
export function sanitizeForWechat(html: string): string {
  // WeChat whitelist: p, br, strong, em, h1-h6, blockquote, ul, ol, li, code, pre, img, a, section, span
  const WECHAT_BLOCKED_TAGS = ['script', 'style', 'iframe', 'form', 'input', 'button', 'video', 'audio', 'object', 'embed'];
  let sanitized = html;
  for (const tag of WECHAT_BLOCKED_TAGS) {
    sanitized = sanitized.replace(new RegExp(`</?${tag}[^>]*>`, 'gi'), '');
  }
  return sanitized;
}
