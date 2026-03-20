import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import { TemplateResolver } from '../../../src/core/templates.js';
import { DEFAULT_DRAFT_PROMPT, PLATFORM_PROMPTS } from '../../../src/llm/types.js';

let tmpDir: string;
let projectDir: string;
let workspaceDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reach-tmpl-'));
  projectDir = path.join(tmpDir, 'project');
  workspaceDir = path.join(tmpDir, 'workspace');
  await fs.ensureDir(projectDir);
  await fs.ensureDir(workspaceDir);
});

afterEach(async () => {
  await fs.remove(tmpDir);
});

async function writeTemplate(dir: string, name: string, template: object): Promise<void> {
  const templatesDir = path.join(dir, 'templates');
  await fs.ensureDir(templatesDir);
  await fs.writeFile(path.join(templatesDir, `${name}.yaml`), yaml.dump(template, { lineWidth: -1 }));
}

describe('TemplateResolver.resolve', () => {
  test('returns null when no templates directory exists', async () => {
    const resolver = new TemplateResolver(projectDir);
    const result = await resolver.resolve('nonexistent');
    expect(result).toBeNull();
  });

  test('loads a valid template YAML', async () => {
    await writeTemplate(projectDir, 'tech-blog', {
      name: 'tech-blog',
      type: 'draft',
      prompt: 'Write a technical blog post about {topic}.',
      vars: { topic: 'AI' },
    });

    const resolver = new TemplateResolver(projectDir);
    const result = await resolver.resolve('tech-blog');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('tech-blog');
    expect(result!.type).toBe('draft');
    expect(result!.prompt).toContain('{topic}');
    expect(result!.vars).toEqual({ topic: 'AI' });
  });

  test('returns null for invalid template schema', async () => {
    await writeTemplate(projectDir, 'bad', { name: 'bad' }); // missing required 'type' and 'prompt'
    const resolver = new TemplateResolver(projectDir);
    expect(await resolver.resolve('bad')).toBeNull();
  });

  test('project templates override workspace templates', async () => {
    await writeTemplate(workspaceDir, 'shared', {
      name: 'shared', type: 'draft', prompt: 'workspace prompt',
    });
    await writeTemplate(projectDir, 'shared', {
      name: 'shared', type: 'draft', prompt: 'project prompt',
    });

    const resolver = new TemplateResolver(projectDir, workspaceDir);
    const result = await resolver.resolve('shared');
    expect(result!.prompt).toBe('project prompt');
  });

  test('falls back to workspace when not in project', async () => {
    await writeTemplate(workspaceDir, 'ws-only', {
      name: 'ws-only', type: 'draft', prompt: 'workspace only',
    });

    const resolver = new TemplateResolver(projectDir, workspaceDir);
    const result = await resolver.resolve('ws-only');
    expect(result!.prompt).toBe('workspace only');
  });
});

describe('TemplateResolver.interpolate', () => {
  test('replaces variables', () => {
    const result = TemplateResolver.interpolate('Write in a {tone} tone about {topic}', { tone: 'casual', topic: 'AI' });
    expect(result).toBe('Write in a casual tone about AI');
  });

  test('leaves unmatched variables as-is', () => {
    const result = TemplateResolver.interpolate('{known} and {unknown}', { known: 'yes' });
    expect(result).toBe('yes and {unknown}');
  });

  test('handles empty vars', () => {
    const result = TemplateResolver.interpolate('no vars here', {});
    expect(result).toBe('no vars here');
  });
});

describe('TemplateResolver.resolveDraftPrompt', () => {
  test('returns built-in default when no template specified', async () => {
    const resolver = new TemplateResolver(projectDir);
    const result = await resolver.resolveDraftPrompt();
    expect(result.prompt).toBe(DEFAULT_DRAFT_PROMPT);
    expect(result.source).toBe('built-in');
  });

  test('uses template when specified', async () => {
    await writeTemplate(projectDir, 'my-draft', {
      name: 'my-draft', type: 'draft', prompt: 'Custom draft prompt for {topic}', vars: { topic: 'testing' },
    });

    const resolver = new TemplateResolver(projectDir);
    const result = await resolver.resolveDraftPrompt('my-draft');
    expect(result.prompt).toBe('Custom draft prompt for testing');
    expect(result.source).toBe('template');
    expect(result.templateName).toBe('my-draft');
  });

  test('falls back to built-in when template not found', async () => {
    const resolver = new TemplateResolver(projectDir);
    const result = await resolver.resolveDraftPrompt('nonexistent');
    expect(result.prompt).toBe(DEFAULT_DRAFT_PROMPT);
    expect(result.source).toBe('built-in');
  });

  test('falls back to built-in when template type is not draft', async () => {
    await writeTemplate(projectDir, 'adapt-only', {
      name: 'adapt-only', type: 'adapt', prompt: 'adapt prompt',
    });

    const resolver = new TemplateResolver(projectDir);
    const result = await resolver.resolveDraftPrompt('adapt-only');
    expect(result.source).toBe('built-in');
  });
});

describe('TemplateResolver.resolveAdaptPrompt', () => {
  test('falls back to PLATFORM_PROMPTS when no template', async () => {
    const resolver = new TemplateResolver(projectDir);
    const result = await resolver.resolveAdaptPrompt('x');
    expect(result.prompt).toBe(PLATFORM_PROMPTS['x']);
    expect(result.source).toBe('built-in');
  });

  test('uses explicit template from meta', async () => {
    await writeTemplate(projectDir, 'custom-adapt', {
      name: 'custom-adapt', type: 'adapt', prompt: 'Custom adapt for {platform}', vars: { platform: 'test' },
    });

    const resolver = new TemplateResolver(projectDir);
    const result = await resolver.resolveAdaptPrompt('devto', 'custom-adapt');
    expect(result.prompt).toBe('Custom adapt for test');
    expect(result.source).toBe('template');
  });

  test('uses convention-based platform template file', async () => {
    await writeTemplate(projectDir, 'devto', {
      name: 'devto-custom', type: 'adapt', platform: 'devto', prompt: 'Custom devto prompt',
    });

    const resolver = new TemplateResolver(projectDir);
    const result = await resolver.resolveAdaptPrompt('devto');
    expect(result.prompt).toBe('Custom devto prompt');
    expect(result.source).toBe('template');
  });

  test('respects platform field filter', async () => {
    await writeTemplate(projectDir, 'devto-only', {
      name: 'devto-only', type: 'adapt', platform: 'devto', prompt: 'devto specific',
    });

    const resolver = new TemplateResolver(projectDir);
    // Request for 'x' should not match 'devto-only' template
    const result = await resolver.resolveAdaptPrompt('x', 'devto-only');
    expect(result.source).toBe('built-in');
  });

  test('provides fallback for unknown platform', async () => {
    const resolver = new TemplateResolver(projectDir);
    const result = await resolver.resolveAdaptPrompt('tiktok');
    expect(result.prompt).toContain('tiktok');
    expect(result.source).toBe('built-in');
  });
});

describe('TemplateResolver.listTemplates', () => {
  test('returns empty array when no templates', async () => {
    const resolver = new TemplateResolver(projectDir);
    const templates = await resolver.listTemplates();
    expect(templates).toEqual([]);
  });

  test('lists all templates from project and workspace', async () => {
    await writeTemplate(projectDir, 'proj-tmpl', { name: 'proj-tmpl', type: 'draft', prompt: 'p' });
    await writeTemplate(workspaceDir, 'ws-tmpl', { name: 'ws-tmpl', type: 'adapt', prompt: 'w' });

    const resolver = new TemplateResolver(projectDir, workspaceDir);
    const templates = await resolver.listTemplates();
    expect(templates).toHaveLength(2);
    const names = templates.map(t => t.name);
    expect(names).toContain('proj-tmpl');
    expect(names).toContain('ws-tmpl');
  });

  test('project templates shadow workspace templates with same name', async () => {
    await writeTemplate(projectDir, 'shared', { name: 'project-version', type: 'draft', prompt: 'proj' });
    await writeTemplate(workspaceDir, 'shared', { name: 'workspace-version', type: 'draft', prompt: 'ws' });

    const resolver = new TemplateResolver(projectDir, workspaceDir);
    const templates = await resolver.listTemplates();
    expect(templates).toHaveLength(1);
    expect(templates[0].name).toBe('project-version');
  });
});
