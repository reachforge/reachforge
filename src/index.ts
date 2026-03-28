import * as path from 'path';
import * as os from 'os';
import fs from 'fs-extra';
import { Command, Option } from 'commander';
import * as readline from 'readline';
import chalk from 'chalk';
import { APCore } from 'apcore-js';
import { serve } from 'apcore-mcp';

import { PipelineEngine } from './core/pipeline.js';
import { ConfigManager } from './core/config.js';
import { WorkspaceResolver } from './core/workspace.js';
import type { WorkspaceContext } from './core/workspace.js';
import { DEFAULT_WORKSPACE_NAME } from './core/constants.js';
import { jsonError, errorToCode, errorToHint } from './core/json-output.js';
import { configureGroupedHelp, buildFullReference } from './help.js';

import { statusCommand } from './commands/status.js';
import { draftCommand } from './commands/draft.js';
import { adaptCommand } from './commands/adapt.js';
import { scheduleCommand } from './commands/schedule.js';
import { publishCommand } from './commands/publish.js';
import { rollbackCommand } from './commands/rollback.js';
import { refreshCommand } from './commands/refresh.js';
import { updateCommand } from './commands/update.js';
import { watchCommand } from './commands/watch.js';
import { mcpCommand } from './commands/mcp.js';
import { initCommand } from './commands/init.js';
import { newProjectCommand } from './commands/new-project.js';
import { workspaceInfoCommand } from './commands/workspace-info.js';
import { refineCommand } from './commands/refine.js';

import { assetAddCommand, assetListCommand } from './commands/asset.js';
import { analyticsCommand, collectAnalytics } from './commands/analytics.js';
import { goCommand } from './commands/go.js';

const program = new Command();

// Error handler wrapper for CLI commands
function withErrorHandler(fn: (...args: any[]) => Promise<void>, commandName?: string) {
  return async (...args: any[]) => {
    try {
      await fn(...args);
    } catch (err: unknown) {
      const isJson = program.opts().json;
      const message = err instanceof Error ? err.message : String(err);
      if (isJson && commandName) {
        const code = err instanceof Error ? errorToCode(err) : 'UNKNOWN_ERROR';
        const hint = err instanceof Error ? errorToHint(err) : undefined;
        process.stdout.write(jsonError(commandName, { message, code, hint }));
      } else {
        console.error(chalk.red(`❌ Error: ${message}`));
      }
      process.exitCode = 1;
    }
  };
}

// Resolve workspace context lazily
let _context: WorkspaceContext | undefined;
async function getContext(): Promise<WorkspaceContext> {
  if (!_context) {
    const opts = program.opts();
    _context = await WorkspaceResolver.resolve(process.cwd(), {
      workspace: opts.workspace,
      project: opts.project,
    });
  }
  return _context;
}

async function getEngine(): Promise<PipelineEngine> {
  const ctx = await getContext();

  // Guard: if we resolved to a workspace root without a specific project,
  // the user needs to cd into a project or use --project
  if (ctx.isWorkspace && !ctx.projectName) {
    const projects = await WorkspaceResolver.listProjects(ctx.workspaceRoot!);
    const names = projects.map(p => p.name).join(', ');
    throw new Error(
      names
        ? `You are in a workspace root, not a project. Use: cd <project> or reach --project <name>\nAvailable projects: ${names}`
        : `You are in a workspace root with no projects. Create one first: reach new <name>`,
    );
  }

  // Guard: if not in a workspace and not in a project (fallback cwd),
  // prevent accidental pipeline creation in arbitrary directories
  if (!ctx.isWorkspace && !ctx.projectName) {
    const hasProjectConfig = await fs.pathExists(path.join(ctx.projectDir, 'project.yaml'));
    const hasPipelineDirs = await fs.pathExists(path.join(ctx.projectDir, '01_drafts'))
      || await fs.pathExists(path.join(ctx.projectDir, '01_inbox')); // legacy
    if (!hasProjectConfig && !hasPipelineDirs) {
      throw new Error(
        'No workspace or project found in the current directory.\n'
        + 'Get started:\n'
        + '  reach init           Create a new workspace\n'
        + '  reach new <name>     Create a project (inside a workspace)\n'
        + '  reach go <prompt>    Then run from inside a project',
      );
    }
  }

  return new PipelineEngine(ctx.projectDir);
}

async function getConfig() {
  const ctx = await getContext();
  return ConfigManager.load(ctx.workspaceRoot);
}

/** Load config from env vars + global ~/.reach/ only (no project context needed). */
async function getGlobalConfig() {
  return ConfigManager.load();
}

// APCore registration for MCP/programmatic access
// TOOL_METADATA provides description + inputSchema so apcore-mcp exposes them to LLMs.
import { TOOL_METADATA } from './mcp/tools.js';

const apcore = new APCore();

function meta(moduleId: string) {
  return TOOL_METADATA[moduleId] ?? { description: '', inputSchema: {} };
}

apcore.register('reach.status', {
  ...meta('reach.status'),
  execute: async (inputs?: { article?: string }) => {
    const engine = await getEngine();
    const status = await engine.getStatus();
    if (inputs?.article) {
      // Filter to single article: only show stages where this article appears
      for (const stage of Object.keys(status.stages) as Array<keyof typeof status.stages>) {
        const info = status.stages[stage];
        const filtered = info.items.filter(item => item === inputs.article);
        status.stages[stage] = { count: filtered.length, items: filtered };
      }
      status.dueToday = status.dueToday.filter(a => a === inputs.article);
      status.totalProjects = Object.values(status.stages).reduce((sum, s) => sum + s.count, 0);
    }
    return status;
  },
});
apcore.register('reach.draft', {
  ...meta('reach.draft'),
  execute: async (inputs: { source: string; name?: string; cover?: string }) => {
    const engine = await getEngine();
    await draftCommand(engine, inputs.source, { name: inputs.name, cover: inputs.cover });
  },
});

apcore.register('reach.adapt', {
  ...meta('reach.adapt'),
  execute: async (inputs: { article: string; platforms?: string; lang?: string; force?: boolean }) => {
    const [engine, config] = await Promise.all([getEngine(), getConfig().catch(() => getGlobalConfig())]);
    await adaptCommand(engine, inputs.article, { platforms: inputs.platforms, lang: inputs.lang, force: inputs.force, config: config.getConfig() });
  },
});
apcore.register('reach.schedule', {
  ...meta('reach.schedule'),
  execute: async (inputs: { article: string; date?: string; clear?: boolean }) => {
    const engine = await getEngine();
    const resolvedDate = inputs.date || new Date().toISOString().split('T')[0];
    await scheduleCommand(engine, inputs.article, resolvedDate, { clear: inputs.clear });
  },
});
apcore.register('reach.publish', {
  ...meta('reach.publish'),
  execute: async (inputs?: { article?: string; platforms?: string; track?: boolean; dryRun?: boolean; cover?: string }) => {
    const { isExternalFile } = await import('./commands/publish.js');
    const isExternal = inputs?.article && isExternalFile(inputs.article);
    let engine: PipelineEngine | null = null;
    if (!isExternal || inputs?.track) {
      engine = await getEngine();
    }
    const config = await getConfig().catch(() => getGlobalConfig());
    await publishCommand(engine, { ...inputs, config: config.getConfig() });
  },
});
apcore.register('reach.go', {
  ...meta('reach.go'),
  execute: async (inputs: { prompt: string; name?: string; schedule?: string; dryRun?: boolean; draft?: boolean; cover?: string }) => {
    const [engine, config] = await Promise.all([getEngine(), getConfig()]);
    await goCommand(engine, inputs.prompt, { ...inputs, config: config.getConfig() });
  },
});
apcore.register('reach.refine', {
  ...meta('reach.refine'),
  execute: async (inputs: { article: string; feedback: string }) => {
    const engine = await getEngine();
    await refineCommand(engine, inputs.article, { feedback: inputs.feedback });
  },
});
apcore.register('reach.rollback', {
  ...meta('reach.rollback'),
  execute: async (inputs: { article: string }) => {
    const engine = await getEngine();
    await rollbackCommand(engine, inputs.article);
  },
});
apcore.register('reach.refresh', {
  ...meta('reach.refresh'),
  execute: async (inputs: { article: string }) => {
    const engine = await getEngine();
    await refreshCommand(engine, inputs.article);
  },
});
apcore.register('reach.update', {
  ...meta('reach.update'),
  execute: async (inputs: { article: string; platforms?: string; dryRun?: boolean; force?: boolean; cover?: string }) => {
    const [engine, config] = await Promise.all([getEngine(), getConfig().catch(() => getGlobalConfig())]);
    await updateCommand(engine, { ...inputs, config: config.getConfig() });
  },
});
apcore.register('reach.asset.add', {
  ...meta('reach.asset.add'),
  execute: async (inputs: { file: string; subdir?: string }) => {
    const ctx = await getContext();
    await assetAddCommand(ctx.projectDir, inputs.file, { subdir: inputs.subdir });
  },
});
apcore.register('reach.asset.list', {
  ...meta('reach.asset.list'),
  execute: async (inputs: { subdir?: string }) => {
    const ctx = await getContext();
    const { AssetManager } = await import('./core/asset-manager.js');
    const mgr = new AssetManager(ctx.projectDir);
    return mgr.listAssets(inputs.subdir as import('./types/assets.js').AssetSubdir | undefined);
  },
});
apcore.register('reach.analytics', {
  ...meta('reach.analytics'),
  execute: async (inputs: { from?: string; to?: string }) => {
    const engine = await getEngine();
    return collectAnalytics(engine, inputs);
  },
});

apcore.register('reach.platforms', {
  ...meta('reach.platforms'),
  execute: async () => {
    const { ProviderLoader } = await import('./providers/loader.js');
    const configManager = await getGlobalConfig();
    const loader = new ProviderLoader(configManager.getConfig());
    return { platforms: loader.listPlatforms() };
  },
});

// CLI Setup
program
  .name('reach')
  .description('ReachForge: The Social Influence Engine')
  .version('ReachForge 0.2.0')
  .option('-w, --workspace <path>', 'Workspace root directory')
  .option('-P, --project <name>', 'Project name within workspace')
  .option('--json', 'Output in JSON format')
  .addOption(new Option('--all', 'Show full command reference (use with --help)').hideHelp());

configureGroupedHelp(program);

// Intercept --help --all to show full reference
program.on('option:all', () => {
  // Deferred: will be checked after parse in the help hook
});
program.addHelpText('beforeAll', () => {
  if (program.opts().all) {
    console.log(buildFullReference(program));
    process.exit(0);
  }
  return '';
});

// ── Quick Start ──────────────────────────────────────────

program
  .command('go <prompt>')
  .description('One-shot: create, adapt, and publish content from a prompt (requires LLM config)')
  .option('--name <name>', 'Explicit article name (default: auto-generated from prompt)')
  .option('-s, --schedule <date>', 'Schedule for a future date (YYYY-MM-DD) instead of publishing immediately')
  .option('-n, --dry-run', 'Run full pipeline but skip actual publishing')
  .option('-d, --draft', 'Publish as draft on supported platforms')
  .option('-c, --cover <path>', 'Cover image path or URL')
  .action(withErrorHandler(async (prompt: string, options: { name?: string; schedule?: string; dryRun?: boolean; draft?: boolean; cover?: string }) => {
    const [engine, config] = await Promise.all([getEngine(), getConfig()]);
    await goCommand(engine, prompt, { ...options, json: program.opts().json, config: config.getConfig() });
  }, 'go'));

program
  .command('new <project-name>')
  .description('Create a new project in the current workspace')
  .action(withErrorHandler(async (projectName: string) => {
    const ctx = await getContext();
    await newProjectCommand(projectName, ctx, { json: program.opts().json });
  }, 'new'));

program
  .command('status [article]')
  .description('Show pipeline dashboard or article detail')
  .option('-a, --all', 'Show status across all projects in workspace')
  .action(withErrorHandler(async (article: string | undefined, options: { all?: boolean }) => {
    const ctx = await getContext();
    if (options.all) {
      const engine = new PipelineEngine(ctx.projectDir);
      await statusCommand(engine, { ...options, json: program.opts().json }, ctx);
    } else {
      const engine = await getEngine();
      await statusCommand(engine, { article, json: program.opts().json }, ctx);
    }
  }, 'status'));

program
  .command('publish [article]')
  .description('Publish to platforms (all due, specific article, or external file)')
  .option('-p, --platforms <list>', 'Comma-separated platform filter (e.g., devto,hashnode)')
  .option('--track', 'Track external file in pipeline (import to 02_adapted, then publish)')
  .option('--force', 'Publish even if article is scheduled for a future date')
  .option('-n, --dry-run', 'Preview what would be published')
  .option('-d, --draft', 'Publish as draft (overrides frontmatter published field)')
  .option('-c, --cover <path>', 'Cover image path or URL')
  .action(withErrorHandler(async (article: string | undefined, options: { platforms?: string; track?: boolean; force?: boolean; dryRun?: boolean; draft?: boolean; cover?: string }) => {
    const { isExternalFile } = await import('./commands/publish.js');
    const isExternal = article && isExternalFile(article);

    // External file without --track: no engine needed, just config
    let engine: PipelineEngine | null = null;
    if (!isExternal || options.track) {
      try {
        engine = await getEngine();
      } catch (err) {
        // No project context: if it looks like the user forgot .md, give a helpful hint
        if (article && !isExternal) {
          throw new Error(
            `"${article}" is not a recognized file. Did you mean: reach publish ${article}.md?\n` +
            `  For external files, include the extension: reach publish ./file.md --platforms devto`,
          );
        }
        throw err;
      }
    }
    const config = await getConfig().catch(() => getGlobalConfig());
    await publishCommand(engine, { article, ...options, json: program.opts().json, config: config.getConfig() });
  }, 'publish'));

// ── Pipeline Steps ───────────────────────────────────────

program
  .command('draft <input>')
  .description('Generate an AI draft from a prompt, file, or directory')
  .option('--name <slug>', 'Explicit article name (default: auto-generated from input)')
  .option('-c, --cover <path>', 'Cover image to store in meta.yaml for publish')
  .action(withErrorHandler(async (input: string, options: { name?: string; cover?: string }) => {
    const engine = await getEngine();
    await draftCommand(engine, input, { ...options, json: program.opts().json });
  }, 'draft'));

program
  .command('refine <article>')
  .description('Refine a draft or adapted article with AI feedback')
  .option('-f, --feedback <text>', 'Non-interactive single refinement turn with the given feedback')
  .action(withErrorHandler(async (article: string, options: { feedback?: string }) => {
    const engine = await getEngine();
    await refineCommand(engine, article, {
      feedback: options.feedback,
      json: program.opts().json,
    });
  }));

program
  .command('adapt <article>')
  .description('Generate platform-specific versions from a draft')
  .option('-p, --platforms <list>', 'Comma-separated platform list (e.g., x,devto,wechat)')
  .option('-l, --lang <code>', 'Override target language for all platforms (e.g., en, zh-CN, ja)')
  .option('-f, --force', 'Overwrite existing platform versions')
  .action(withErrorHandler(async (article: string, options: { platforms?: string; lang?: string; force?: boolean }) => {
    const [engine, config] = await Promise.all([getEngine(), getConfig().catch(() => getGlobalConfig())]);
    await adaptCommand(engine, article, { ...options, json: program.opts().json, config: config.getConfig() });
  }, 'adapt'));

program
  .command('schedule <article> [date]')
  .description('Schedule an article for publishing (defaults to now)')
  .option('-n, --dry-run', 'Preview without scheduling')
  .option('--clear', 'Unschedule: revert status to adapted and remove schedule date')
  .action(withErrorHandler(async (article: string, date: string | undefined, options: { dryRun?: boolean; clear?: boolean }) => {
    const engine = await getEngine();
    const resolvedDate = date || new Date().toISOString().split('T')[0];
    await scheduleCommand(engine, article, resolvedDate, { ...options, json: program.opts().json });
  }, 'schedule'));

program
  .command('rollback <article>')
  .description('Move an article back one pipeline stage')
  .action(withErrorHandler(async (article: string) => {
    const engine = await getEngine();
    await rollbackCommand(engine, article, { json: program.opts().json });
  }, 'rollback'));

program
  .command('refresh <article>')
  .description('Copy a published/adapted article back to drafts for re-editing')
  .action(withErrorHandler(async (article: string) => {
    const engine = await getEngine();
    await refreshCommand(engine, article, { json: program.opts().json });
  }, 'refresh'));

program
  .command('update <article>')
  .description('Update a published article on its platforms')
  .option('-p, --platforms <list>', 'Comma-separated platform filter')
  .option('-n, --dry-run', 'Preview without executing')
  .option('--force', 'Skip platforms without article_id')
  .option('-c, --cover <path>', 'Cover image path or URL')
  .action(withErrorHandler(async (article: string, options: { platforms?: string; dryRun?: boolean; force?: boolean; cover?: string }) => {
    const [engine, config] = await Promise.all([getEngine(), getConfig().catch(() => getGlobalConfig())]);
    await updateCommand(engine, { article, ...options, json: program.opts().json, config: config.getConfig() });
  }, 'update'));

// ── System ───────────────────────────────────────────────

program
  .command('init [path]')
  .description('Initialize global config (~/.reach), or a workspace at <path>')
  .action(withErrorHandler(async (targetPath?: string) => {
    await initCommand(targetPath);
  }));

program
  .command('workspace')
  .description('Show workspace info and project list')
  .action(withErrorHandler(async () => {
    const ctx = await getContext();
    await workspaceInfoCommand(ctx);
  }));

program
  .command('watch')
  .description('Start daemon to auto-publish due content')
  .option('-i, --interval <minutes>', 'Check interval in minutes (min: 1)', '60')
  .option('-a, --all', 'Watch all projects in workspace')
  .option('-l, --list', 'List running watch daemons')
  .option('--stop [project]', 'Stop a running watch daemon')
  .action(withErrorHandler(async (options: { interval?: string; all?: boolean; list?: boolean; stop?: string | true }) => {
    const ctx = await getContext();
    // Only create engine when needed (not for --list/--stop)
    const engine = (options.list || options.stop !== undefined) ? null! : new PipelineEngine(ctx.projectDir);
    await watchCommand(engine, options, ctx);
  }));

program
  .command('analytics')
  .description('Show publishing analytics and success metrics')
  .option('--from <date>', 'Filter from date (YYYY-MM-DD)')
  .option('--to <date>', 'Filter to date (YYYY-MM-DD)')
  .action(withErrorHandler(async (options: { from?: string; to?: string }) => {
    const engine = await getEngine();
    await analyticsCommand(engine, { ...options, json: program.opts().json });
  }, 'analytics'));

const assetCmd = program
  .command('asset')
  .description('Manage project assets (images, videos, audio)');

assetCmd
  .command('add <file>')
  .description('Register an asset file into the project asset library')
  .option('-s, --subdir <type>', 'Asset subdirectory (images, videos, audio)')
  .action(withErrorHandler(async (file: string, options: { subdir?: string }) => {
    const ctx = await getContext();
    await assetAddCommand(ctx.projectDir, file, { ...options, json: program.opts().json });
  }, 'asset.add'));

assetCmd
  .command('list')
  .description('List registered assets')
  .option('-s, --subdir <type>', 'Filter by subdirectory (images, videos, audio)')
  .action(withErrorHandler(async (options: { subdir?: string }) => {
    const ctx = await getContext();
    await assetListCommand(ctx.projectDir, { ...options, json: program.opts().json });
  }, 'asset.list'));

program
  .command('platforms')
  .description('List available publishing platforms and their config status')
  .action(withErrorHandler(async () => {
    const configManager = await getGlobalConfig();
    const { ProviderLoader } = await import('./providers/loader.js');
    const loader = new ProviderLoader(configManager.getConfig());
    const platforms = loader.listPlatforms();
    const isJson = program.opts().json;

    if (isJson) {
      const { jsonSuccess } = await import('./core/json-output.js');
      process.stdout.write(jsonSuccess('platforms', { platforms }));
      return;
    }

    console.log(chalk.bold('\nPublishing Platforms\n'));
    for (const p of platforms) {
      const status = p.configured
        ? chalk.green('✓ configured')
        : chalk.gray('✗ not configured');
      console.log(`  ${chalk.cyan(p.platform.padEnd(12))} ${p.provider.padEnd(24)} ${status}`);
    }
    console.log();
  }, 'platforms'));

program
  .command('mcp')
  .description('Launch reach as an MCP Server (AI agent integration)')
  .option('-p, --port <number>', 'Port for SSE transport', '8000')
  .option('-t, --transport <type>', 'Transport type (stdio, sse)', 'stdio')
  .action(withErrorHandler(async (options: { port?: string; transport?: string }) => {
    const engine = await getEngine();
    await mcpCommand(engine, apcore, serve, options);
  }));

// Default action: when no command is given, check for workspace or show help
program.action(withErrorHandler(async () => {
  const ctx = await getContext();
  if (ctx.isWorkspace) {
    program.outputHelp();
    return;
  }

  // No workspace found
  const defaultPath = path.join(os.homedir(), DEFAULT_WORKSPACE_NAME);

  if (!process.stdin.isTTY) {
    // Non-interactive: show instructions without prompting
    console.log(`No workspace found. Initialize one with:`);
    console.log(chalk.dim(`  reach init [path]`));
    console.log(chalk.dim(`\nRun ${chalk.white('reach --help')} for all available commands.`));
    return;
  }

  // Interactive: prompt user to create workspace
  const answer = await confirm(
    `No workspace found. Create one at ${chalk.cyan(defaultPath)}? [Y/n] `,
  );

  if (answer) {
    await initCommand(defaultPath);
  } else {
    console.log(chalk.dim('\nYou can initialize a workspace manually:'));
    console.log(chalk.dim('  reach init [path]'));
  }

  console.log(chalk.dim(`\nRun ${chalk.white('reach --help')} for all available commands.`));
}));

function confirm(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() !== 'n');
    });
  });
}

program.parse();
