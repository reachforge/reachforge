import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import fs from 'fs-extra';
import {
  ProjectConfigSchema,
  WorkspaceConfigSchema,
  readProjectConfig,
  writeProjectConfig,
  readWorkspaceConfig,
  writeWorkspaceConfig,
} from '../../../src/core/project-config.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reach-pc-'));
});

afterEach(async () => {
  await fs.remove(tmpDir);
});

describe('ProjectConfigSchema', () => {
  test('validates full config', () => {
    const result = ProjectConfigSchema.safeParse({
      name: 'tech-blog',
      description: 'My tech blog',
      platforms: ['x', 'devto'],
      language: 'en',
      tone: 'technical',
      default_tags: ['bun', 'ai'],
      history: [{ phase: 'Cold Start', period: '2026-01 ~ 2026-02', note: 'Pilot Phase' }],
    });
    expect(result.success).toBe(true);
  });

  test('validates minimal config (only name required)', () => {
    const result = ProjectConfigSchema.safeParse({ name: 'minimal' });
    expect(result.success).toBe(true);
    expect(result.data!.platforms).toEqual([]);
    expect(result.data!.language).toBe('en');
    expect(result.data!.history).toEqual([]);
  });

  test('rejects empty name', () => {
    expect(ProjectConfigSchema.safeParse({ name: '' }).success).toBe(false);
  });

  test('rejects missing name', () => {
    expect(ProjectConfigSchema.safeParse({}).success).toBe(false);
  });

  test('accepts credentials override', () => {
    const result = ProjectConfigSchema.safeParse({
      name: 'test',
      credentials: { devto_api_key: 'project-key' },
    });
    expect(result.success).toBe(true);
  });
});

describe('WorkspaceConfigSchema', () => {
  test('validates empty config', () => {
    expect(WorkspaceConfigSchema.safeParse({}).success).toBe(true);
  });

  test('validates with default_workspace', () => {
    const result = WorkspaceConfigSchema.safeParse({ default_workspace: '~/my-workspace' });
    expect(result.success).toBe(true);
  });

  test('validates with credentials', () => {
    const result = WorkspaceConfigSchema.safeParse({
      credentials: { gemini_api_key: 'shared-key' },
    });
    expect(result.success).toBe(true);
  });
});

describe('readProjectConfig / writeProjectConfig', () => {
  test('round-trips a project config', async () => {
    const config = { name: 'blog', platforms: ['x', 'devto'], default_tags: ['ai'], history: [] };
    await writeProjectConfig(tmpDir, config);

    const read = await readProjectConfig(tmpDir);
    expect(read).not.toBeNull();
    expect(read!.name).toBe('blog');
    expect(read!.platforms).toEqual(['x', 'devto']);
  });

  test('returns null for missing project.yaml', async () => {
    expect(await readProjectConfig(tmpDir)).toBeNull();
  });

  test('returns null for invalid YAML', async () => {
    await fs.writeFile(path.join(tmpDir, 'project.yaml'), 'invalid: yaml: {{');
    expect(await readProjectConfig(tmpDir)).toBeNull();
  });

  test('creates directory if it does not exist', async () => {
    const nested = path.join(tmpDir, 'new-project');
    await writeProjectConfig(nested, { name: 'new', platforms: [], default_tags: [], history: [] });
    expect(await fs.pathExists(path.join(nested, 'project.yaml'))).toBe(true);
  });
});

describe('readWorkspaceConfig / writeWorkspaceConfig', () => {
  test('round-trips a workspace config', async () => {
    await writeWorkspaceConfig(tmpDir, { default_workspace: '/home/user/ws' });

    const read = await readWorkspaceConfig(tmpDir);
    expect(read).not.toBeNull();
    expect(read!.default_workspace).toBe('/home/user/ws');
  });

  test('returns null for missing .reach/config.yaml', async () => {
    expect(await readWorkspaceConfig(tmpDir)).toBeNull();
  });

  test('creates .reach directory', async () => {
    await writeWorkspaceConfig(tmpDir, {});
    expect(await fs.pathExists(path.join(tmpDir, '.reach', 'config.yaml'))).toBe(true);
  });
});
