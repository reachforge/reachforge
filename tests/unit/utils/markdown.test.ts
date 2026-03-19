import { describe, test, expect } from 'vitest';
import { markdownToHtml, sanitizeForWechat } from '../../../src/utils/markdown.js';

describe('markdownToHtml', () => {
  test('converts heading to HTML', () => {
    const result = markdownToHtml('# Hello World');
    expect(result).toContain('<h1>Hello World</h1>');
  });

  test('converts paragraph text', () => {
    const result = markdownToHtml('Simple paragraph text.');
    expect(result).toContain('<p>Simple paragraph text.</p>');
  });

  test('converts bold and italic', () => {
    const result = markdownToHtml('**bold** and *italic*');
    expect(result).toContain('<strong>bold</strong>');
    expect(result).toContain('<em>italic</em>');
  });

  test('converts code blocks', () => {
    const result = markdownToHtml('```js\nconst x = 1;\n```');
    expect(result).toContain('<pre><code');
    expect(result).toContain('const x = 1;');
  });

  test('converts unordered list', () => {
    const result = markdownToHtml('- item 1\n- item 2');
    expect(result).toContain('<li>item 1</li>');
    expect(result).toContain('<li>item 2</li>');
  });

  test('converts links', () => {
    const result = markdownToHtml('[click](https://example.com)');
    expect(result).toContain('<a href="https://example.com">click</a>');
  });

  test('converts images', () => {
    const result = markdownToHtml('![alt](https://example.com/img.png)');
    expect(result).toContain('<img src="https://example.com/img.png" alt="alt"');
  });

  test('strips YAML frontmatter before conversion', () => {
    const md = '---\ntitle: My Post\ntags: [a, b]\n---\n# Content\n\nBody text.';
    const result = markdownToHtml(md);
    expect(result).not.toContain('title: My Post');
    expect(result).not.toContain('---');
    expect(result).toContain('<h1>Content</h1>');
    expect(result).toContain('<p>Body text.</p>');
  });

  test('handles content without frontmatter', () => {
    const result = markdownToHtml('# No Frontmatter\n\nJust text.');
    expect(result).toContain('<h1>No Frontmatter</h1>');
    expect(result).toContain('<p>Just text.</p>');
  });

  test('converts blockquote', () => {
    const result = markdownToHtml('> This is a quote');
    expect(result).toContain('<blockquote>');
    expect(result).toContain('This is a quote');
  });
});

describe('sanitizeForWechat', () => {
  test('removes script tags', () => {
    const result = sanitizeForWechat('<p>Safe</p><script>alert("xss")</script>');
    expect(result).toContain('<p>Safe</p>');
    expect(result).not.toContain('script');
  });

  test('removes iframe tags', () => {
    const result = sanitizeForWechat('<iframe src="https://evil.com"></iframe><p>Content</p>');
    expect(result).not.toContain('iframe');
    expect(result).toContain('<p>Content</p>');
  });

  test('removes form and input tags', () => {
    const result = sanitizeForWechat('<form><input type="text"><button>Submit</button></form>');
    expect(result).not.toContain('form');
    expect(result).not.toContain('input');
    expect(result).not.toContain('button');
  });

  test('removes media embed tags', () => {
    const html = '<video src="x.mp4"></video><audio src="x.mp3"></audio><object></object><embed>';
    const result = sanitizeForWechat(html);
    expect(result).not.toContain('video');
    expect(result).not.toContain('audio');
    expect(result).not.toContain('object');
    expect(result).not.toContain('embed');
  });

  test('preserves safe tags', () => {
    const html = '<h1>Title</h1><p>Text <strong>bold</strong> <em>italic</em></p><ul><li>item</li></ul><blockquote>quote</blockquote>';
    const result = sanitizeForWechat(html);
    expect(result).toBe(html);
  });
});
