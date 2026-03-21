import * as path from 'path';
import chalk from 'chalk';
import { PipelineEngine } from '../core/pipeline.js';
import { ConfigManager } from '../core/config.js';
import { publishCommand } from './publish.js';
import { logger } from '../utils/logger.js';
import { MIN_WATCH_INTERVAL_MINUTES } from '../core/constants.js';
import { WorkspaceResolver } from '../core/workspace.js';
import type { WorkspaceContext } from '../core/workspace.js';
import {
  writePidFile,
  removePidFile,
  listDaemons,
  findDaemon,
  type WatchDaemonInfo,
} from '../core/watch-registry.js';

export interface WatchOptions {
  interval?: string;
  all?: boolean;
  list?: boolean;
  stop?: string | true;
}

export async function watchCommand(
  engine: PipelineEngine,
  options: WatchOptions = {},
  context?: WorkspaceContext,
): Promise<void> {
  // --list: show running daemons
  if (options.list) {
    if (!context) throw new Error('Cannot list daemons: no workspace context');
    await listWatchDaemons(context);
    return;
  }

  // --stop: stop a running daemon
  if (options.stop !== undefined) {
    if (!context) throw new Error('Cannot stop daemon: no workspace context');
    const target = typeof options.stop === 'string' ? options.stop : undefined;
    await stopWatchDaemon(context, target);
    return;
  }

  // Validate interval
  const minutes = parseInt(options.interval || '60', 10);
  if (isNaN(minutes) || minutes < MIN_WATCH_INTERVAL_MINUTES) {
    throw new Error(
      `Invalid interval: ${options.interval}. Minimum is ${MIN_WATCH_INTERVAL_MINUTES} minute(s).`
    );
  }

  // --all: workspace-level watch
  if (options.all) {
    if (!context?.workspaceRoot) {
      throw new Error('No workspace found. Use "reach init" to create one, or run without --all for single-project mode.');
    }
    await startWorkspaceWatch(minutes, context);
    return;
  }

  // Default: single-project watch
  await startProjectWatch(engine, minutes, context);
}

// Shared daemon loop to avoid duplication between project and workspace modes (#9)
async function runDaemonLoop(
  tick: () => Promise<void>,
  pidFilePath: string | null,
  banner: string[],
  intervalMs: number,
): Promise<void> {
  for (const line of banner) console.log(line);
  console.log('');

  let intervalHandle: ReturnType<typeof setInterval> | null = null;

  const shutdown = (signal: string) => {
    console.log(chalk.yellow(`\n🛑 Received ${signal}. Shutting down gracefully...`));
    if (intervalHandle) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
    if (pidFilePath) {
      removePidFile(pidFilePath).finally(() => process.exit(0));
    } else {
      process.exit(0);
    }
  };

  process.once('SIGINT', () => shutdown('SIGINT'));   // #6: use once() to prevent stacking
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  await tick();
  intervalHandle = setInterval(tick, intervalMs);
}

async function startProjectWatch(
  engine: PipelineEngine,
  minutes: number,
  context?: WorkspaceContext,
): Promise<void> {
  const intervalMs = minutes * 60 * 1000;
  const projectName = context?.projectName || path.basename(context?.projectDir || '') || 'unknown';
  const workspaceRoot = context?.workspaceRoot;

  // Load config for publish (#3)
  const config = context
    ? (await ConfigManager.load(context.projectDir, context.workspaceRoot)).getConfig()
    : undefined;

  // Register PID file
  let pidFilePath: string | null = null;
  if (context) {
    const info: WatchDaemonInfo = {
      pid: process.pid,
      project: projectName,
      workspace: workspaceRoot || null,
      projectDir: context.projectDir,
      startedAt: new Date().toISOString(),
      interval: minutes,
      mode: 'project',
    };
    pidFilePath = await writePidFile(context, info);
  }

  const banner = [
    chalk.blue.bold(`\n🕵️  reach Daemon is now watching (interval: ${minutes}m)`),
    chalk.dim(`   Mode:      project`),
    ...(workspaceRoot ? [chalk.dim(`   Workspace: ${workspaceRoot}`)] : []),
    chalk.dim(`   Project:   ${projectName}`),
    chalk.dim(`   PID:       ${process.pid}`),
  ];

  const tick = async () => {
    const timestamp = new Date().toLocaleTimeString();
    logger.info(`[${projectName}] Checking for due content`, { timestamp });
    try {
      await publishCommand(engine, { config });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Publish tick failed: ${message}`);
      console.error(chalk.red(`❌ Watch tick error: ${message}`));
    }
  };

  await runDaemonLoop(tick, pidFilePath, banner, intervalMs);
}

async function startWorkspaceWatch(
  minutes: number,
  context: WorkspaceContext,
): Promise<void> {
  const intervalMs = minutes * 60 * 1000;
  const workspaceRoot = context.workspaceRoot!;

  // Register PID file
  const info: WatchDaemonInfo = {
    pid: process.pid,
    project: null,
    workspace: workspaceRoot,
    projectDir: workspaceRoot,
    startedAt: new Date().toISOString(),
    interval: minutes,
    mode: 'workspace',
  };
  const pidFilePath = await writePidFile(context, info);

  const projects = await WorkspaceResolver.listProjects(workspaceRoot);

  const banner = [
    chalk.blue.bold(`\n🕵️  reach Daemon is now watching (interval: ${minutes}m)`),
    chalk.dim(`   Mode:      workspace`),
    chalk.dim(`   Workspace: ${workspaceRoot}`),
    chalk.dim(`   Projects:  ${projects.map(p => p.name).join(', ') || '(none)'}`),
    chalk.dim(`   PID:       ${process.pid}`),
  ];

  const tick = async () => {
    const timestamp = new Date().toLocaleTimeString();
    // Re-scan projects each tick in case new ones were added
    const currentProjects = await WorkspaceResolver.listProjects(workspaceRoot);

    for (const proj of currentProjects) {
      logger.info(`[${proj.name}] Checking for due content`, { timestamp });
      try {
        const projDir = path.join(workspaceRoot, proj.name);
        const projEngine = new PipelineEngine(projDir);
        // Load config per-project so each project gets its own credentials (#3)
        const projConfig = (await ConfigManager.load(projDir, workspaceRoot)).getConfig();
        await publishCommand(projEngine, { config: projConfig });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`[${proj.name}] Publish tick failed: ${message}`);
        console.error(chalk.red(`❌ [${proj.name}] Watch tick error: ${message}`));
      }
    }
  };

  await runDaemonLoop(tick, pidFilePath, banner, intervalMs);
}

async function listWatchDaemons(context: WorkspaceContext): Promise<void> {
  const daemons = await listDaemons(context);

  if (daemons.length === 0) {
    console.log(chalk.yellow('No running watch daemons found.'));
    return;
  }

  console.log(chalk.blue.bold('\n🕵️  Running Watch Daemons\n'));

  for (const d of daemons) {
    const target = d.mode === 'workspace'
      ? `workspace (${d.workspace})`
      : `project "${d.project}"`;
    console.log(`  ${chalk.green('● alive')}  PID ${chalk.bold(String(d.pid))}  ${target}`);
    console.log(chalk.dim(`         Interval: ${d.interval}m  Started: ${d.startedAt}`));
  }

  console.log('');
}

async function stopWatchDaemon(context: WorkspaceContext, target?: string): Promise<void> {
  const daemon = await findDaemon(context, target);

  if (!daemon) {
    const desc = target || context.projectName || 'current context';
    console.log(chalk.yellow(`No running watch daemon found for ${desc}.`));
    return;
  }

  try {
    process.kill(daemon.pid, 'SIGTERM');
    // Don't remove PID file here — the daemon's own shutdown handler will clean it up (#7)
    const desc = daemon.mode === 'workspace'
      ? `workspace (${daemon.workspace})`
      : `project "${daemon.project}"`;
    console.log(chalk.green(`Stopped watch daemon for ${desc} (PID ${daemon.pid}).`));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`Failed to stop daemon (PID ${daemon.pid}): ${message}`));
  }
}
