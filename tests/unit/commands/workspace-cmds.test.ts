import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import { STAGES, DEFAULT_WORKSPACE_NAME } from '../../../src/core/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Isolate tests from real ~/reach-workspace by pointing homedir to a temp dir.
// fakeHome must be initialized before workspace.ts module loads (module-level constants).
let fakeHome: string = fs.mkdtempSync(path.join(os.tmpdir(), 'reach-home-'));

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return { ...actual, homedir: () => fakeHome };
});

// Must import AFTER mock so module-level constants use fakeHome
const { initCommand } = await import('../../../src/commands/init.js');
const { newProjectCommand } = await import('../../../src/commands/new-project.js');
const { workspaceInfoCommand } = await import('../../../src/commands/workspace-info.js');
const { WorkspaceResolver } = await import('../../../src/core/workspace.js');
const { writeWorkspaceConfig, writeProjectConfig } = await import('../../../src/core/project-config.js');

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reach-wscmd-'));
  fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'reach-home-'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.remove(tmpDir);
  await fs.remove(fakeHome);
});

describe('initCommand', () => {
  test('creates workspace .reach/config.yaml when path given', async () => {
    await initCommand(tmpDir);

    expect(await fs.pathExists(path.join(tmpDir, '.reach', 'config.yaml'))).toBe(true);
    expect(await WorkspaceResolver.isWorkspace(tmpDir)).toBe(true);
  });

  test('workspace init is idempotent', async () => {
    await initCommand(tmpDir);
    await initCommand(tmpDir); // second call

    expect(await fs.pathExists(path.join(tmpDir, '.reach', 'config.yaml'))).toBe(true);
  });

  test('global config.yaml contains all config sections', async () => {
    const globalConfigPath = path.join(fakeHome, '.reach', 'config.yaml');

    await initCommand(tmpDir);

    const content = await fs.readFile(globalConfigPath, 'utf-8');
    expect(content).toContain('devto_api_key');
    expect(content).toContain('llm_adapter');
    expect(content).toContain('default_workspace');
  });

  test('creates target directory if it does not exist', async () => {
    const newDir = path.join(tmpDir, 'new-workspace');
    await initCommand(newDir);

    expect(await fs.pathExists(path.join(newDir, '.reach', 'config.yaml'))).toBe(true);
  });

  test('no args creates default workspace and global config', async () => {
    const globalConfigPath = path.join(fakeHome, '.reach', 'config.yaml');
    const defaultWsPath = path.join(fakeHome, DEFAULT_WORKSPACE_NAME);

    await initCommand(); // no args → default workspace

    // Global config created
    expect(await fs.pathExists(globalConfigPath)).toBe(true);
    // Default workspace created
    expect(await fs.pathExists(path.join(defaultWsPath, '.reach', 'config.yaml'))).toBe(true);
    expect(await WorkspaceResolver.isWorkspace(defaultWsPath)).toBe(true);
  });

  test('workspace init auto-creates global config if missing', async () => {
    const globalConfigPath = path.join(fakeHome, '.reach', 'config.yaml');

    await initCommand(tmpDir);

    // Global config should exist now
    expect(await fs.pathExists(globalConfigPath)).toBe(true);
    // Workspace config should also exist
    expect(await fs.pathExists(path.join(tmpDir, '.reach', 'config.yaml'))).toBe(true);
  });
});

describe('newProjectCommand', () => {
  test('creates project with pipeline dirs and project.yaml', async () => {
    await writeWorkspaceConfig(tmpDir, {});
    const ctx = await WorkspaceResolver.resolve(tmpDir);

    await newProjectCommand('tech-blog', ctx);

    const projectDir = path.join(tmpDir, 'tech-blog');
    expect(await fs.pathExists(path.join(projectDir, 'project.yaml'))).toBe(true);

    for (const stage of STAGES) {
      expect(await fs.pathExists(path.join(projectDir, stage))).toBe(true);
    }
  });

  test('creates assets directory with subdirs and registry', async () => {
    await writeWorkspaceConfig(tmpDir, {});
    const ctx = await WorkspaceResolver.resolve(tmpDir);

    await newProjectCommand('asset-proj', ctx);

    const projectDir = path.join(tmpDir, 'asset-proj');
    expect(await fs.pathExists(path.join(projectDir, 'assets', 'images'))).toBe(true);
    expect(await fs.pathExists(path.join(projectDir, 'assets', 'videos'))).toBe(true);
    expect(await fs.pathExists(path.join(projectDir, 'assets', 'audio'))).toBe(true);
    expect(await fs.pathExists(path.join(projectDir, 'assets', '.asset-registry.yaml'))).toBe(true);
  });

  test('rejects duplicate project name', async () => {
    await writeWorkspaceConfig(tmpDir, {});
    const ctx = await WorkspaceResolver.resolve(tmpDir);

    await newProjectCommand('my-project', ctx);
    await expect(newProjectCommand('my-project', ctx)).rejects.toThrow('already exists');
  });

  test('rejects path traversal in project name', async () => {
    await writeWorkspaceConfig(tmpDir, {});
    const ctx = await WorkspaceResolver.resolve(tmpDir);

    await expect(newProjectCommand('../escape', ctx)).rejects.toThrow('Unsafe path');
  });

  test('throws when not in a workspace', async () => {
    const ctx = await WorkspaceResolver.resolve(tmpDir); // no workspace
    await expect(newProjectCommand('test', ctx)).rejects.toThrow('Not in a workspace');
  });
});

describe('workspaceInfoCommand', () => {
  test('shows workspace info with projects', async () => {
    await writeWorkspaceConfig(tmpDir, {});
    await writeProjectConfig(path.join(tmpDir, 'blog'), { name: 'blog', platforms: ['x', 'devto'], default_tags: [], history: [] });
    await writeProjectConfig(path.join(tmpDir, 'news'), { name: 'news', platforms: ['wechat'], default_tags: [], history: [] });
    // Create pipeline dirs so getStatus works
    for (const stage of STAGES) {
      await fs.ensureDir(path.join(tmpDir, 'blog', stage));
      await fs.ensureDir(path.join(tmpDir, 'news', stage));
    }

    const ctx = await WorkspaceResolver.resolve(path.join(tmpDir, 'blog'));
    await workspaceInfoCommand(ctx);

    const output = (console.log as any).mock.calls.map((c: any[]) => c.map(String).join(' ')).join('\n');
    expect(output).toContain(tmpDir);
    expect(output).toContain('blog');
    expect(output).toContain('news');
  });

  test('handles no workspace gracefully', async () => {
    const ctx = await WorkspaceResolver.resolve(tmpDir);
    await workspaceInfoCommand(ctx);

    const output = (console.log as any).mock.calls.map((c: any[]) => c.map(String).join(' ')).join('\n');
    expect(output).toContain('Not in a workspace');
  });

  test('handles empty workspace', async () => {
    await writeWorkspaceConfig(tmpDir, {});
    const ctx = await WorkspaceResolver.resolve(tmpDir);
    await workspaceInfoCommand(ctx);

    const output = (console.log as any).mock.calls.map((c: any[]) => c.map(String).join(' ')).join('\n');
    expect(output).toContain('No projects yet');
  });
});
