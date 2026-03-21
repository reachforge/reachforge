import * as path from 'path';
import fs from 'fs-extra';
import { WORKSPACE_CONFIG_DIR, WATCH_DIR, WATCH_PID_EXTENSION } from './constants.js';
import type { WorkspaceContext } from './workspace.js';

export interface WatchDaemonInfo {
  pid: number;
  project: string | null;
  workspace: string | null;
  projectDir: string;
  startedAt: string;
  interval: number;
  mode: 'project' | 'workspace';
}

export interface WatchDaemonEntry extends WatchDaemonInfo {
  alive: boolean;
  pidFile: string;
}

function getWatchDir(context: WorkspaceContext): string {
  const base = context.workspaceRoot || context.projectDir;
  return path.join(base, WORKSPACE_CONFIG_DIR, WATCH_DIR);
}

function getPidFilename(info: Pick<WatchDaemonInfo, 'mode' | 'project'>): string {
  const name = info.mode === 'workspace' ? '__workspace__' : (info.project || '__standalone__');
  return `${name}${WATCH_PID_EXTENSION}`;
}

function isProcessAlive(pid: number): boolean {
  if (typeof pid !== 'number' || isNaN(pid)) return false; // #5: guard against corrupt PID files
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isValidDaemonInfo(data: unknown): data is WatchDaemonInfo {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return typeof d.pid === 'number' && typeof d.mode === 'string' && typeof d.startedAt === 'string';
}

export async function writePidFile(context: WorkspaceContext, info: WatchDaemonInfo): Promise<string> {
  const dir = getWatchDir(context);
  await fs.ensureDir(dir);

  const filename = getPidFilename(info);
  const filePath = path.join(dir, filename);

  // Check for existing alive daemon
  if (await fs.pathExists(filePath)) {
    try {
      const raw = await fs.readJson(filePath);
      if (!isValidDaemonInfo(raw)) throw new Error('corrupt');
      const existing = raw;
      if (isProcessAlive(existing.pid)) {
        const target = info.mode === 'workspace' ? 'workspace' : `project "${info.project}"`;
        throw new Error(
          `A watch daemon is already running for ${target} (PID: ${existing.pid}). ` +
          `Use "reach watch --stop" to stop it first.`
        );
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('already running')) throw err;
      // Stale or corrupt file, overwrite
    }
  }

  await fs.writeJson(filePath, info, { spaces: 2 });
  return filePath;
}

export async function removePidFile(pidFilePath: string): Promise<void> {
  await fs.remove(pidFilePath);
}

export async function listDaemons(context: WorkspaceContext): Promise<WatchDaemonEntry[]> {
  const dir = getWatchDir(context);
  if (!await fs.pathExists(dir)) return [];

  const files = await fs.readdir(dir);
  const entries: WatchDaemonEntry[] = [];

  for (const file of files) {
    if (!file.endsWith(WATCH_PID_EXTENSION)) continue;
    const filePath = path.join(dir, file);
    try {
      const raw = await fs.readJson(filePath);
      if (!isValidDaemonInfo(raw)) {  // #5: validate PID file structure
        await fs.remove(filePath);
        continue;
      }
      const info = raw;
      const alive = isProcessAlive(info.pid);
      if (!alive) {
        await fs.remove(filePath);  // #4: clean up dead entries, don't return them
        continue;
      }
      entries.push({ ...info, alive, pidFile: filePath });
    } catch {
      await fs.remove(filePath);
    }
  }

  return entries;
}

export async function findDaemon(
  context: WorkspaceContext,
  target?: string,
): Promise<WatchDaemonEntry | null> {
  const daemons = await listDaemons(context);

  if (!target) {
    // Find daemon for current project or workspace
    const match = daemons.find(d =>
      (d.mode === 'project' && d.project === context.projectName) ||
      (d.mode === 'workspace' && d.workspace === context.workspaceRoot)
    );
    return match || null;
  }

  if (target === '__workspace__') {
    return daemons.find(d => d.mode === 'workspace') || null;
  }

  return daemons.find(d => d.project === target) || null;
}
