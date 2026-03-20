import * as path from 'path';
import * as os from 'os';
import { Command } from 'commander';
import * as readline from 'readline';
import chalk from 'chalk';
import { APCore } from 'apcore-js';
import { serve } from 'apcore-mcp';

import { PipelineEngine } from './core/pipeline.js';
import { ConfigManager } from './core/config.js';
import { WorkspaceResolver } from './core/workspace.js';
import type { WorkspaceContext } from './core/workspace.js';
import { DEFAULT_WORKSPACE_NAME } from './core/constants.js';

import { statusCommand } from './commands/status.js';
import { draftCommand } from './commands/draft.js';
import { adaptCommand } from './commands/adapt.js';
import { scheduleCommand } from './commands/schedule.js';
import { publishCommand } from './commands/publish.js';
import { rollbackCommand } from './commands/rollback.js';
import { watchCommand } from './commands/watch.js';
import { mcpCommand } from './commands/mcp.js';
import { initCommand } from './commands/init.js';
import { newProjectCommand } from './commands/new-project.js';
import { workspaceInfoCommand } from './commands/workspace-info.js';
import { refineCommand } from './commands/refine.js';
import { approveCommand } from './commands/approve.js';
import { assetAddCommand, assetListCommand } from './commands/asset.js';
import { analyticsCommand, collectAnalytics } from './commands/analytics.js';

const program = new Command();

// Error handler wrapper for CLI commands
function withErrorHandler(fn: (...args: any[]) => Promise<void>) {
  return async (...args: any[]) => {
    try {
      await fn(...args);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`❌ Error: ${message}`));
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
  return new PipelineEngine(ctx.projectDir);
}

async function getConfig() {
  const ctx = await getContext();
  return ConfigManager.load(ctx.projectDir, ctx.workspaceRoot);
}

// APCore registration for MCP/programmatic access
const apcore = new APCore();
apcore.register('reach.status', {
  execute: async () => {
    const engine = await getEngine();
    return engine.getStatus();
  },
});
apcore.register('reach.draft', {
  execute: async (inputs: { source: string }) => {
    const engine = await getEngine();
    await draftCommand(engine, inputs.source);
  },
});
apcore.register('reach.adapt', {
  execute: async (inputs: { article: string }) => {
    const engine = await getEngine();
    await adaptCommand(engine, inputs.article);
  },
});
apcore.register('reach.approve', {
  execute: async (inputs: { article: string }) => {
    const engine = await getEngine();
    await approveCommand(engine, inputs.article);
  },
});
apcore.register('reach.schedule', {
  execute: async (inputs: { article: string; date: string }) => {
    const engine = await getEngine();
    await scheduleCommand(engine, inputs.article, inputs.date);
  },
});
apcore.register('reach.publish', {
  execute: async () => {
    const [engine, config] = await Promise.all([getEngine(), getConfig()]);
    await publishCommand(engine, { config: config.getConfig() });
  },
});

apcore.register('reach.asset.list', {
  execute: async (inputs: { subdir?: string }) => {
    const ctx = await getContext();
    const { AssetManager } = await import('./core/asset-manager.js');
    const mgr = new AssetManager(ctx.projectDir);
    return mgr.listAssets(inputs.subdir as import('./types/assets.js').AssetSubdir | undefined);
  },
});

apcore.register('reach.analytics', {
  execute: async (inputs: { from?: string; to?: string }) => {
    const engine = await getEngine();
    return collectAnalytics(engine, inputs);
  },
});

// CLI Setup
program
  .name('reach')
  .description('ReachForge: The Social Influence Engine')
  .version('ReachForge 0.1.0')
  .option('-w, --workspace <path>', 'Workspace root directory')
  .option('-P, --project <name>', 'Project name within workspace');

program
  .command('status')
  .description('Check the dashboard status of the content pipeline')
  .option('-a, --all', 'Show status across all projects in workspace')
  .action(withErrorHandler(async (options: { all?: boolean }) => {
    const ctx = await getContext();
    const engine = new PipelineEngine(ctx.projectDir);
    await statusCommand(engine, options, ctx);
  }));

program
  .command('draft <source>')
  .description('Generate an AI draft from an inbox source')
  .action(withErrorHandler(async (source: string) => {
    const engine = await getEngine();
    await draftCommand(engine, source);
  }));

program
  .command('approve <article>')
  .description('Promote a draft to master stage (02_drafts → 03_master)')
  .action(withErrorHandler(async (article: string) => {
    const engine = await getEngine();
    await approveCommand(engine, article);
  }));

program
  .command('adapt <article>')
  .description('Generate multi-platform adapted versions from the master draft')
  .option('-p, --platforms <list>', 'Comma-separated platform list (e.g., x,devto,wechat)')
  .option('-f, --force', 'Overwrite existing platform versions')
  .action(withErrorHandler(async (article: string, options: { platforms?: string; force?: boolean }) => {
    const engine = await getEngine();
    await adaptCommand(engine, article, options);
  }));

program
  .command('schedule <article> <date>')
  .description('Schedule an article for publishing (date: YYYY-MM-DD)')
  .option('-n, --dry-run', 'Preview without moving files')
  .action(withErrorHandler(async (article: string, date: string, options: { dryRun?: boolean }) => {
    const engine = await getEngine();
    await scheduleCommand(engine, article, date, options);
  }));

program
  .command('publish')
  .description('Publish all scheduled content due for today')
  .option('-n, --dry-run', 'Preview what would be published')
  .option('-d, --draft', 'Publish as draft (overrides frontmatter published field)')
  .action(withErrorHandler(async (options: { dryRun?: boolean; draft?: boolean }) => {
    const [engine, config] = await Promise.all([getEngine(), getConfig()]);
    await publishCommand(engine, { ...options, config: config.getConfig() });
  }));

program
  .command('rollback <project>')
  .description('Move a project back one pipeline stage')
  .action(withErrorHandler(async (project: string) => {
    const engine = await getEngine();
    await rollbackCommand(engine, project);
  }));

program
  .command('watch')
  .description('Start the reach daemon to watch for due content')
  .option('-i, --interval <minutes>', 'Check interval in minutes (min: 1)', '60')
  .action(withErrorHandler(async (options: { interval?: string }) => {
    const engine = await getEngine();
    await watchCommand(engine, options);
  }));

program
  .command('mcp')
  .description('Launch reach as an MCP Server')
  .option('-p, --port <number>', 'Port for SSE transport', '8000')
  .option('-t, --transport <type>', 'Transport type (stdio, sse)', 'stdio')
  .action(withErrorHandler(async (options: { port?: string; transport?: string }) => {
    const engine = await getEngine();
    await mcpCommand(engine, apcore, serve, options);
  }));

// Workspace management commands
program
  .command('init [path]')
  .description('Initialize a new reach workspace (default: ~/reach-workspace)')
  .action(withErrorHandler(async (targetPath?: string) => {
    await initCommand(targetPath);
  }));

program
  .command('new <project-name>')
  .description('Create a new project in the current workspace')
  .action(withErrorHandler(async (projectName: string) => {
    const ctx = await getContext();
    await newProjectCommand(projectName, ctx);
  }));

program
  .command('workspace')
  .description('Show workspace info and project list')
  .action(withErrorHandler(async () => {
    const ctx = await getContext();
    await workspaceInfoCommand(ctx);
  }));

program
  .command('refine <article>')
  .description('Interactively refine a draft article with AI feedback')
  .action(withErrorHandler(async (article: string) => {
    const engine = await getEngine();
    await refineCommand(engine, article);
  }));

program
  .command('analytics')
  .description('Show publishing analytics and success metrics')
  .option('--from <date>', 'Filter from date (YYYY-MM-DD)')
  .option('--to <date>', 'Filter to date (YYYY-MM-DD)')
  .action(withErrorHandler(async (options: { from?: string; to?: string }) => {
    const engine = await getEngine();
    await analyticsCommand(engine, options);
  }));

const assetCmd = program
  .command('asset')
  .description('Manage project assets (images, videos, audio)');

assetCmd
  .command('add <file>')
  .description('Register an asset file into the project asset library')
  .option('-s, --subdir <type>', 'Asset subdirectory (images, videos, audio)')
  .action(withErrorHandler(async (file: string, options: { subdir?: string }) => {
    const ctx = await getContext();
    await assetAddCommand(ctx.projectDir, file, options);
  }));

assetCmd
  .command('list')
  .description('List registered assets')
  .option('-s, --subdir <type>', 'Filter by subdirectory (images, videos, audio)')
  .action(withErrorHandler(async (options: { subdir?: string }) => {
    const ctx = await getContext();
    await assetListCommand(ctx.projectDir, options);
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
