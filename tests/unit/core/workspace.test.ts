import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import fs from 'fs-extra';
import { WorkspaceResolver } from '../../../src/core/workspace.js';
import { writeProjectConfig, writeWorkspaceConfig } from '../../../src/core/project-config.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reach-ws-'));
  delete process.env.REACHFORGE_WORKSPACE;
});

afterEach(async () => {
  delete process.env.REACHFORGE_WORKSPACE;
  await fs.remove(tmpDir);
});

async function createWorkspace(root: string, projects: string[] = []) {
  await writeWorkspaceConfig(root, {});
  for (const name of projects) {
    await writeProjectConfig(path.join(root, name), { name, platforms: [], default_tags: [], history: [] });
  }
}

describe('WorkspaceResolver.resolve', () => {
  test('Step 5 fallback: cwd without workspace returns cwd as projectDir', async () => {
    const ctx = await WorkspaceResolver.resolve(tmpDir);
    expect(ctx.projectDir).toBe(tmpDir);
    expect(ctx.workspaceRoot).toBeUndefined();
    expect(ctx.isWorkspace).toBe(false);
    expect(ctx.projectName).toBeUndefined();
  });

  test('Step 1: REACHFORGE_WORKSPACE env var resolves workspace', async () => {
    await createWorkspace(tmpDir, ['blog']);
    process.env.REACHFORGE_WORKSPACE = tmpDir;

    const ctx = await WorkspaceResolver.resolve(path.join(tmpDir, 'blog'));
    expect(ctx.workspaceRoot).toBe(tmpDir);
    expect(ctx.projectName).toBe('blog');
    expect(ctx.isWorkspace).toBe(true);
  });

  test('Step 1: explicit workspace override with --project', async () => {
    await createWorkspace(tmpDir, ['blog', 'news']);

    const ctx = await WorkspaceResolver.resolve('/anywhere', { workspace: tmpDir, project: 'news' });
    expect(ctx.workspaceRoot).toBe(tmpDir);
    expect(ctx.projectDir).toBe(path.join(tmpDir, 'news'));
    expect(ctx.projectName).toBe('news');
  });

  test('Step 2: walks up from cwd to find .reach/', async () => {
    await createWorkspace(tmpDir, ['blog']);
    const deepDir = path.join(tmpDir, 'blog', '01_inbox');
    await fs.ensureDir(deepDir);

    const ctx = await WorkspaceResolver.resolve(deepDir);
    expect(ctx.workspaceRoot).toBe(tmpDir);
    expect(ctx.projectName).toBe('blog');
    expect(ctx.isWorkspace).toBe(true);
  });

  test('Step 3: cwd contains project.yaml, parent has .reach/', async () => {
    await createWorkspace(tmpDir, ['my-project']);

    const ctx = await WorkspaceResolver.resolve(path.join(tmpDir, 'my-project'));
    expect(ctx.workspaceRoot).toBe(tmpDir);
    expect(ctx.projectDir).toBe(path.join(tmpDir, 'my-project'));
    expect(ctx.projectName).toBe('my-project');
  });

  test('Step 3: standalone project.yaml without workspace parent', async () => {
    await writeProjectConfig(tmpDir, { name: 'standalone', platforms: [], default_tags: [], history: [] });

    const ctx = await WorkspaceResolver.resolve(tmpDir);
    expect(ctx.projectDir).toBe(tmpDir);
    expect(ctx.projectName).toBe(path.basename(tmpDir));
    expect(ctx.isWorkspace).toBe(false);
  });

  test('backward compat: no workspace, no project.yaml → single-project mode', async () => {
    const ctx = await WorkspaceResolver.resolve(tmpDir);
    expect(ctx.projectDir).toBe(tmpDir);
    expect(ctx.workspaceRoot).toBeUndefined();
    expect(ctx.projectName).toBeUndefined();
    expect(ctx.isWorkspace).toBe(false);
  });
});

describe('WorkspaceResolver.listProjects', () => {
  test('lists all projects in workspace', async () => {
    await createWorkspace(tmpDir, ['alpha', 'beta', 'gamma']);

    const projects = await WorkspaceResolver.listProjects(tmpDir);
    expect(projects.map(p => p.name)).toEqual(['alpha', 'beta', 'gamma']);
  });

  test('skips directories without project.yaml', async () => {
    await createWorkspace(tmpDir, ['real-project']);
    await fs.ensureDir(path.join(tmpDir, 'random-dir'));

    const projects = await WorkspaceResolver.listProjects(tmpDir);
    expect(projects.map(p => p.name)).toEqual(['real-project']);
  });

  test('skips hidden directories', async () => {
    await createWorkspace(tmpDir, ['visible']);
    await fs.ensureDir(path.join(tmpDir, '.hidden'));

    const projects = await WorkspaceResolver.listProjects(tmpDir);
    expect(projects.map(p => p.name)).toEqual(['visible']);
  });

  test('returns empty for non-existent workspace', async () => {
    const projects = await WorkspaceResolver.listProjects('/nonexistent/path');
    expect(projects).toEqual([]);
  });

  test('returns project config for each project', async () => {
    await createWorkspace(tmpDir, ['blog']);

    const projects = await WorkspaceResolver.listProjects(tmpDir);
    expect(projects[0].config).not.toBeNull();
    expect(projects[0].config!.name).toBe('blog');
  });
});

describe('WorkspaceResolver.isWorkspace / isProject', () => {
  test('isWorkspace returns true when .reach/config.yaml exists', async () => {
    await createWorkspace(tmpDir);
    expect(await WorkspaceResolver.isWorkspace(tmpDir)).toBe(true);
  });

  test('isWorkspace returns false for plain dir', async () => {
    expect(await WorkspaceResolver.isWorkspace(tmpDir)).toBe(false);
  });

  test('isProject returns true when project.yaml exists', async () => {
    await writeProjectConfig(tmpDir, { name: 'test', platforms: [], default_tags: [], history: [] });
    expect(await WorkspaceResolver.isProject(tmpDir)).toBe(true);
  });

  test('isProject returns false for plain dir', async () => {
    expect(await WorkspaceResolver.isProject(tmpDir)).toBe(false);
  });
});
