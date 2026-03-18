import type { ValidationResult } from '../providers/types.js';
import yaml from 'js-yaml';

export function validateDevtoContent(content: string): ValidationResult {
  const errors: string[] = [];

  if (!content || content.trim().length === 0) {
    return { valid: false, errors: ['Dev.to article content is empty.'] };
  }

  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) {
    return { valid: false, errors: ['Dev.to article missing required frontmatter block (---...---).' ] };
  }

  let frontmatter: Record<string, unknown>;
  try {
    frontmatter = (yaml.load(fmMatch[1]) as Record<string, unknown>) ?? {};
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { valid: false, errors: [`Dev.to article frontmatter is invalid YAML: ${msg}.`] };
  }

  const title = frontmatter['title'];
  if (!title || (typeof title === 'string' && title.trim() === '')) {
    errors.push('Dev.to article missing required frontmatter field: title.');
  } else if (typeof title === 'string' && title.length > 128) {
    errors.push(`Dev.to article title exceeds 128 character limit (found: ${title.length}).`);
  }

  if ('tags' in frontmatter && frontmatter['tags'] !== undefined) {
    const tags = frontmatter['tags'];
    if (!Array.isArray(tags)) {
      errors.push("Dev.to frontmatter 'tags' must be an array.");
    } else {
      if (tags.length > 4) {
        errors.push(`Dev.to allows maximum 4 tags (found: ${tags.length}).`);
      }
      for (const tag of tags) {
        const tagStr = String(tag);
        if (tagStr.length > 20) {
          errors.push(`Dev.to tag '${tagStr}' exceeds 20 character limit (found: ${tagStr.length}).`);
        }
        if (!/^[a-zA-Z0-9-]+$/.test(tagStr)) {
          errors.push(`Dev.to tag '${tagStr}' contains invalid characters.`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
