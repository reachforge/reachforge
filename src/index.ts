import { Command } from 'commander';
import chalk from 'chalk';
import { APCore } from 'apcore-js';
import { serve } from 'apcore-mcp';

import { PipelineEngine } from './core/pipeline.js';
import { ConfigManager } from './core/config.js';
import { LLMFactory } from './llm/factory.js';
import { sanitizePath } from './utils/path.js';

import { statusCommand } from './commands/status.js';
import { draftCommand } from './commands/draft.js';
import { adaptCommand } from './commands/adapt.js';
import { scheduleCommand } from './commands/schedule.js';
import { publishCommand } from './commands/publish.js';
import { rollbackCommand } from './commands/rollback.js';
import { watchCommand } from './commands/watch.js';
import { mcpCommand } from './commands/mcp.js';

const program = new Command();
const engine = new PipelineEngine(process.cwd());

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

// Lazy LLM provider (only created when needed)
async function getLLM() {
  const config = await ConfigManager.load(process.cwd());
  return LLMFactory.create(config);
}

// APCore registration for MCP/programmatic access
const apcore = new APCore();
apcore.register('aphype.status', { execute: () => engine.getStatus() });
apcore.register('aphype.draft', {
  execute: async (inputs: { source: string }) => {
    const llm = await getLLM();
    await draftCommand(engine, llm, inputs.source);
  },
});
apcore.register('aphype.adapt', {
  execute: async (inputs: { article: string }) => {
    const llm = await getLLM();
    await adaptCommand(engine, llm, inputs.article);
  },
});
apcore.register('aphype.schedule', {
  execute: async (inputs: { article: string; date: string }) => {
    await scheduleCommand(engine, inputs.article, inputs.date);
  },
});
apcore.register('aphype.publish', {
  execute: async () => {
    const config = await ConfigManager.load(process.cwd());
    await publishCommand(engine, { config: config.getConfig() });
  },
});

// CLI Setup
program
  .name('aphype')
  .description('AI PartnerUp Hype: The Social Influence Engine')
  .version('0.1.0');

program
  .command('status')
  .description('Check the dashboard status of the current content pipeline')
  .action(withErrorHandler(async () => {
    await statusCommand(engine);
  }));

program
  .command('draft <source>')
  .description('Generate an AI draft from an inbox source')
  .action(withErrorHandler(async (source: string) => {
    const llm = await getLLM();
    await draftCommand(engine, llm, source);
  }));

program
  .command('adapt <article>')
  .description('Generate multi-platform adapted versions from the master draft')
  .option('-p, --platforms <list>', 'Comma-separated platform list (e.g., x,devto,wechat)')
  .option('-f, --force', 'Overwrite existing platform versions')
  .action(withErrorHandler(async (article: string, options: { platforms?: string; force?: boolean }) => {
    const llm = await getLLM();
    await adaptCommand(engine, llm, article, options);
  }));

program
  .command('schedule <article> <date>')
  .description('Schedule an article for publishing (date: YYYY-MM-DD)')
  .option('-n, --dry-run', 'Preview without moving files')
  .action(withErrorHandler(async (article: string, date: string, options: { dryRun?: boolean }) => {
    await scheduleCommand(engine, article, date, options);
  }));

program
  .command('publish')
  .description('Publish all scheduled content due for today')
  .option('-n, --dry-run', 'Preview what would be published')
  .action(withErrorHandler(async (options: { dryRun?: boolean }) => {
    const config = await ConfigManager.load(process.cwd());
    await publishCommand(engine, { ...options, config: config.getConfig() });
  }));

program
  .command('rollback <project>')
  .description('Move a project back one pipeline stage')
  .action(withErrorHandler(async (project: string) => {
    await rollbackCommand(engine, project);
  }));

program
  .command('watch')
  .description('Start the aphype daemon to watch for due content')
  .option('-i, --interval <minutes>', 'Check interval in minutes (min: 1)', '60')
  .action(withErrorHandler(async (options: { interval?: string }) => {
    await watchCommand(engine, options);
  }));

program
  .command('mcp')
  .description('Launch aphype as an MCP Server')
  .option('-p, --port <number>', 'Port for SSE transport', '8000')
  .option('-t, --transport <type>', 'Transport type (stdio, sse)', 'stdio')
  .action(withErrorHandler(async (options: { port?: string; transport?: string }) => {
    await mcpCommand(engine, apcore, serve, options);
  }));

program.parse();
