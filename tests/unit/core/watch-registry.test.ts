import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import fs from 'fs-extra';
import { writeWorkspaceConfig } from '../../../src/core/project-config.js';
import type { WorkspaceContext } from '../../../src/core/workspace.js';
import {
  writePidFile,
  removePidFile,
  listDaemons,
  findDaemon,
  type WatchDaemonInfo,
} from '../../../src/core/watch-registry.js';

let tmpDir: string;
let context: WorkspaceContext;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reach-watch-reg-'));
  await writeWorkspaceConfig(tmpDir, {});
  context = {
    workspaceRoot: tmpDir,
    projectDir: path.join(tmpDir, 'my-project'),
    projectName: 'my-project',
    isWorkspace: true,
  };
});

afterEach(async () => {
  await fs.remove(tmpDir);
});

function makeInfo(overrides: Partial<WatchDaemonInfo> = {}): WatchDaemonInfo {
  return {
    pid: process.pid, // current process is always alive
    project: 'my-project',
    workspace: tmpDir,
    projectDir: path.join(tmpDir, 'my-project'),
    startedAt: new Date().toISOString(),
    interval: 60,
    mode: 'project',
    ...overrides,
  };
}

describe('writePidFile', () => {
  test('creates PID file in .reach/watch/', async () => {
    const filePath = await writePidFile(context, makeInfo());
    expect(await fs.pathExists(filePath)).toBe(true);
    const data = await fs.readJson(filePath);
    expect(data.pid).toBe(process.pid);
    expect(data.mode).toBe('project');
  });

  test('workspace mode uses __workspace__ filename', async () => {
    const info = makeInfo({ mode: 'workspace', project: null });
    const filePath = await writePidFile(context, info);
    expect(path.basename(filePath)).toBe('__workspace__.pid.json');
  });

  test('rejects duplicate alive daemon', async () => {
    await writePidFile(context, makeInfo());
    await expect(writePidFile(context, makeInfo())).rejects.toThrow('already running');
  });

  test('overwrites stale PID file for dead process', async () => {
    const staleInfo = makeInfo({ pid: 999999 }); // very unlikely to be alive
    await writePidFile(context, staleInfo);
    // Should not throw — stale process gets overwritten
    const filePath = await writePidFile(context, makeInfo());
    const data = await fs.readJson(filePath);
    expect(data.pid).toBe(process.pid);
  });
});

describe('removePidFile', () => {
  test('removes existing PID file', async () => {
    const filePath = await writePidFile(context, makeInfo());
    expect(await fs.pathExists(filePath)).toBe(true);
    await removePidFile(filePath);
    expect(await fs.pathExists(filePath)).toBe(false);
  });

  test('no-op for non-existent file', async () => {
    await expect(removePidFile('/tmp/nonexistent.pid.json')).resolves.not.toThrow();
  });
});

describe('listDaemons', () => {
  test('returns empty array when no watch dir exists', async () => {
    const result = await listDaemons(context);
    expect(result).toEqual([]);
  });

  test('returns alive daemons', async () => {
    await writePidFile(context, makeInfo());
    const result = await listDaemons(context);
    expect(result).toHaveLength(1);
    expect(result[0].alive).toBe(true);
    expect(result[0].project).toBe('my-project');
  });

  test('cleans up dead daemon PID files and does not return them', async () => {
    const deadInfo = makeInfo({ pid: 999999 });
    const watchDir = path.join(tmpDir, '.reach', 'watch');
    await fs.ensureDir(watchDir);
    await fs.writeJson(path.join(watchDir, 'my-project.pid.json'), deadInfo);

    const result = await listDaemons(context);
    expect(result).toHaveLength(0);
    // PID file should be cleaned up
    expect(await fs.pathExists(path.join(watchDir, 'my-project.pid.json'))).toBe(false);
  });

  test('cleans up corrupt PID files', async () => {
    const watchDir = path.join(tmpDir, '.reach', 'watch');
    await fs.ensureDir(watchDir);
    await fs.writeFile(path.join(watchDir, 'bad.pid.json'), 'not json');

    const result = await listDaemons(context);
    expect(result).toHaveLength(0);
    expect(await fs.pathExists(path.join(watchDir, 'bad.pid.json'))).toBe(false);
  });

  test('cleans up PID files with invalid structure', async () => {
    const watchDir = path.join(tmpDir, '.reach', 'watch');
    await fs.ensureDir(watchDir);
    await fs.writeJson(path.join(watchDir, 'invalid.pid.json'), { foo: 'bar' });

    const result = await listDaemons(context);
    expect(result).toHaveLength(0);
  });
});

describe('findDaemon', () => {
  test('finds daemon for current project when no target specified', async () => {
    await writePidFile(context, makeInfo());
    const result = await findDaemon(context);
    expect(result).not.toBeNull();
    expect(result!.project).toBe('my-project');
  });

  test('finds daemon by project name', async () => {
    await writePidFile(context, makeInfo());
    const result = await findDaemon(context, 'my-project');
    expect(result).not.toBeNull();
    expect(result!.project).toBe('my-project');
  });

  test('finds workspace daemon with __workspace__ target', async () => {
    const wsContext: WorkspaceContext = { ...context, projectName: undefined };
    await writePidFile(wsContext, makeInfo({ mode: 'workspace', project: null }));
    const result = await findDaemon(wsContext, '__workspace__');
    expect(result).not.toBeNull();
    expect(result!.mode).toBe('workspace');
  });

  test('returns null when no matching daemon found', async () => {
    const result = await findDaemon(context, 'nonexistent-project');
    expect(result).toBeNull();
  });
});
