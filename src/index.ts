import * as path from 'path';
import * as os from 'os';
import fs from 'fs-extra';
import { Command, Option } from 'commander';
import * as readline from 'readline';
import chalk from 'chalk';
import { APCore } from 'apcore-js';
import { serve } from 'apcore-mcp';
import { GroupedModuleGroup, setVerboseHelp, setDocsUrl, configureManHelp } from 'apcore-cli';

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
import { seriesInitCommand, seriesOutlineCommand, seriesApproveCommand, seriesDetailCommand, seriesDraftCommand, seriesAdaptCommand, seriesScheduleCommand, seriesStatusCommand } from './commands/series.js';
import { watchCommand } from './commands/watch.js';
import { mcpCommand } from './commands/mcp.js';
import { initCommand } from './commands/init.js';
import { newProjectCommand } from './commands/new-project.js';
import { workspaceInfoCommand } from './commands/workspace-info.js';
import { refineCommand } from './commands/refine.js';

import { assetAddCommand, assetListCommand } from './commands/asset.js';
import { analyticsCommand } from './commands/analytics.js';
import { goCommand } from './commands/go.js';

import { TOOL_METADATA } from './mcp/tools.js';

// ── Program Setup ────────────────────────────────────────

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

// ── Context Resolvers ────────────────────────────────────

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

  if (ctx.isWorkspace && !ctx.projectName) {
    const projects = await WorkspaceResolver.listProjects(ctx.workspaceRoot!);
    const names = projects.map(p => p.name).join(', ');
    throw new Error(
      names
        ? `You are in a workspace root, not a project. Use: cd <project> or reach --project <name>\nAvailable projects: ${names}`
        : `You are in a workspace root with no projects. Create one first: reach new <name>`,
    );
  }

  if (!ctx.isWorkspace && !ctx.projectName) {
    const hasProjectConfig = await fs.pathExists(path.join(ctx.projectDir, 'project.yaml'));
    const hasPipelineDirs = await fs.pathExists(path.join(ctx.projectDir, '01_drafts'))
      || await fs.pathExists(path.join(ctx.projectDir, '01_inbox'));
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

async function getGlobalConfig() {
  return ConfigManager.load();
}

// ── APCore Module Registration ───────────────────────────
// Single source of truth: each module is registered once with apcore.
// CLI commands are auto-generated from the registry via GroupedModuleGroup.
// MCP tools are exposed via serve(apcore).

const apcore = new APCore();

function meta(moduleId: string) {
  const toolMeta = TOOL_METADATA[moduleId] ?? { description: '', inputSchema: {} };
  // Strip "reach." prefix for CLI command names.
  // "reach.status" → alias "status" (top-level)
  // "reach.series.init" → alias "series.init" (auto-groups to "series" / "init")
  // "reach.asset.add" → alias "asset.add" (auto-groups to "asset" / "add")
  const alias = moduleId.replace(/^reach\./, '');
  return {
    ...toolMeta,
    metadata: { display: { cli: { alias } } },
  };
}

apcore.register('reach.status', {
  ...meta('reach.status'),
  execute: async (inputs?: { article?: string }) => {
    const engine = await getEngine();
    await statusCommand(engine, { article: inputs?.article });
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
    await assetListCommand(ctx.projectDir, { subdir: inputs.subdir });
  },
});

apcore.register('reach.analytics', {
  ...meta('reach.analytics'),
  execute: async (inputs: { from?: string; to?: string }) => {
    const engine = await getEngine();
    await analyticsCommand(engine, inputs);
  },
});

apcore.register('reach.platforms', {
  ...meta('reach.platforms'),
  execute: async () => {
    const { ProviderLoader } = await import('./providers/loader.js');
    const configManager = await getGlobalConfig();
    const loader = new ProviderLoader(configManager.getConfig());
    const platforms = loader.listPlatforms();
    console.log(chalk.bold('\nPublishing Platforms\n'));
    for (const p of platforms) {
      const status = p.configured
        ? chalk.green('✓ configured')
        : chalk.gray('✗ not configured');
      console.log(`  ${chalk.cyan(p.platform.padEnd(12))} ${p.provider.padEnd(24)} ${status}`);
    }
    console.log();
  },
});

// Series modules
apcore.register('reach.series.init', {
  ...meta('reach.series.init'),
  execute: async (inputs: { topic: string }) => {
    const ctx = await getContext();
    await seriesInitCommand(ctx.projectDir, inputs.topic);
  },
});

apcore.register('reach.series.outline', {
  ...meta('reach.series.outline'),
  execute: async (inputs: { name: string }) => {
    const engine = await getEngine();
    await seriesOutlineCommand(engine, inputs.name);
  },
});

apcore.register('reach.series.approve', {
  ...meta('reach.series.approve'),
  execute: async (inputs: { name: string; outline?: boolean; detail?: boolean }) => {
    const engine = await getEngine();
    await seriesApproveCommand(engine, inputs.name, { outline: inputs.outline, detail: inputs.detail });
  },
});

apcore.register('reach.series.detail', {
  ...meta('reach.series.detail'),
  execute: async (inputs: { name: string }) => {
    const engine = await getEngine();
    await seriesDetailCommand(engine, inputs.name);
  },
});

apcore.register('reach.series.draft', {
  ...meta('reach.series.draft'),
  execute: async (inputs: { name: string; all?: boolean }) => {
    const engine = await getEngine();
    await seriesDraftCommand(engine, inputs.name, { all: inputs.all });
  },
});

apcore.register('reach.series.adapt', {
  ...meta('reach.series.adapt'),
  execute: async (inputs: { name: string; platforms?: string }) => {
    const [engine, config] = await Promise.all([getEngine(), getConfig().catch(() => getGlobalConfig())]);
    await seriesAdaptCommand(engine, inputs.name, { platforms: inputs.platforms, config: config.getConfig() });
  },
});

apcore.register('reach.series.schedule', {
  ...meta('reach.series.schedule'),
  execute: async (inputs: { name: string; dryRun?: boolean }) => {
    const engine = await getEngine();
    await seriesScheduleCommand(engine, inputs.name, { dryRun: inputs.dryRun });
  },
});

apcore.register('reach.series.status', {
  ...meta('reach.series.status'),
  execute: async (inputs: { name: string }) => {
    const engine = await getEngine();
    await seriesStatusCommand(engine, inputs.name);
  },
});

// System modules
apcore.register('reach.new', {
  ...meta('reach.new'),
  execute: async (inputs: { name: string }) => {
    const ctx = await getContext();
    await newProjectCommand(inputs.name, ctx);
  },
});

apcore.register('reach.init', {
  ...meta('reach.init'),
  execute: async (inputs: { path?: string }) => {
    await initCommand(inputs.path);
  },
});

apcore.register('reach.workspace', {
  ...meta('reach.workspace'),
  execute: async () => {
    const ctx = await getContext();
    await workspaceInfoCommand(ctx);
  },
});

apcore.register('reach.watch', {
  ...meta('reach.watch'),
  execute: async (inputs: { interval?: string; all?: boolean; list?: boolean; stop?: string }) => {
    const ctx = await getContext();
    const engine = (inputs.list || inputs.stop !== undefined) ? null! : new PipelineEngine(ctx.projectDir);
    await watchCommand(engine, inputs, ctx);
  },
});

apcore.register('reach.mcp', {
  ...meta('reach.mcp'),
  execute: async (inputs: { port?: string; transport?: string }) => {
    const engine = await getEngine();
    await mcpCommand(engine, apcore, serve, inputs);
  },
});

// ── CLI Setup ────────────────────────────────────────────
// Auto-generate CLI commands from the apcore registry using GroupedModuleGroup.
// This eliminates manual .command().option().action() duplication.

const REACH_VERSION = '0.2.0';
const REACH_DESCRIPTION = 'ReachForge: The Social Influence Engine';

program
  .name('reach')
  .description(REACH_DESCRIPTION)
  .version(`ReachForge ${REACH_VERSION}`)
  .option('-w, --workspace <path>', 'Workspace root directory')
  .option('-P, --project <name>', 'Project name within workspace')
  .option('--json', 'Output in JSON format')
  .addOption(new Option('--all', 'Show full command reference (use with --help)').hideHelp());

configureGroupedHelp(program);

// Intercept --help --all to show full reference
program.on('option:all', () => {});
program.addHelpText('beforeAll', () => {
  if (program.opts().all) {
    console.log(buildFullReference(program));
    process.exit(0);
  }
  return '';
});

// --help --man: generate full roff man page (provided by apcore-cli)
// TODO: add docsUrl when docs site is deployed
configureManHelp(program, 'reach', REACH_VERSION, REACH_DESCRIPTION);

// Adapter: bridge apcore-js Registry/Executor to apcore-cli's expected interface.
// apcore-js 0.14 uses list()/get(), apcore-cli 0.3 expects listModules()/getModule().
import type { Registry as CliRegistry, Executor as CliExecutor } from 'apcore-cli';

const registryAdapter: CliRegistry = {
  listModules() {
    return apcore.registry.list().map((id: string) => {
      const mod = apcore.registry.get(id) as Record<string, unknown> | undefined;
      return { id, name: id, ...(mod ?? {}) } as ReturnType<CliRegistry['listModules']>[number];
    });
  },
  getModule(moduleId: string) {
    const mod = apcore.registry.get(moduleId) as Record<string, unknown> | undefined;
    if (!mod) return null;
    return { id: moduleId, name: moduleId, ...mod } as ReturnType<CliRegistry['getModule']>;
  },
};

const executorAdapter: CliExecutor = {
  async execute(moduleId: string, input: Record<string, unknown>) {
    return apcore.executor.call(moduleId, input) as Promise<unknown>;
  },
};

// Pre-parse --verbose so apcore-cli hides/shows built-in options accordingly.
setVerboseHelp(process.argv.includes('--verbose'));
// setDocsUrl controls the docs link in per-command help footers (read by buildModuleCommand).
// configureManHelp above receives the same URL separately for the man page SEE ALSO section.
// TODO: enable when docs site is deployed
// setDocsUrl('https://reachforge.dev/docs');

// Auto-wire module commands from apcore registry
const moduleGroup = new GroupedModuleGroup(registryAdapter, executorAdapter);

// Filter out apcore-cli built-in commands that are irrelevant for ReachForge users.
// Note: apcore-cli also has a built-in "init" but our reach.init takes precedence
// since GroupedModuleGroup returns our module's command for the "init" name.
const APCORE_BUILTINS = new Set(['completion', 'describe', 'exec', 'list', 'man']);

for (const cmdName of moduleGroup.listCommands()) {
  if (APCORE_BUILTINS.has(cmdName)) continue;
  const cmd = moduleGroup.getCommand(cmdName);
  if (cmd) program.addCommand(cmd);
}

// Default action: when no command is given
program.action(withErrorHandler(async () => {
  const ctx = await getContext();
  if (ctx.isWorkspace) {
    program.outputHelp();
    return;
  }

  const defaultPath = path.join(os.homedir(), DEFAULT_WORKSPACE_NAME);

  if (!process.stdin.isTTY) {
    console.log(`No workspace found. Initialize one with:`);
    console.log(chalk.dim(`  reach init [path]`));
    console.log(chalk.dim(`\nRun ${chalk.white('reach --help')} for all available commands.`));
    return;
  }

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
