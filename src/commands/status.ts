import * as path from 'path';
import chalk from 'chalk';
import { PipelineEngine } from '../core/pipeline.js';
import { STAGES } from '../core/constants.js';
import { WorkspaceResolver } from '../core/workspace.js';
import type { WorkspaceContext } from '../core/workspace.js';
import { jsonSuccess } from '../core/json-output.js';
import type { PipelineStage } from '../types/index.js';

async function printArticleDetail(engine: PipelineEngine, article: string): Promise<void> {
  const meta = await engine.metadata.readArticleMeta(article);
  if (!meta) {
    console.log(chalk.red(`Article "${article}" not found in meta.yaml`));
    return;
  }

  console.log(chalk.blue.bold(`\n📄 Article: ${article}`));
  console.log(`   Status:    ${chalk.yellow(meta.status)}`);

  // Find which stage(s) the article is in
  for (const stage of STAGES) {
    const files = await engine.getArticleFiles(article, stage);
    if (files.length > 0) {
      console.log(`   Stage:     ${chalk.cyan(stage)}`);
      files.forEach(f => console.log(chalk.dim(`     └─ ${f}`)));
    }
  }

  if (meta.schedule) {
    console.log(`   Schedule:  ${chalk.magenta(meta.schedule)}`);
  }
  if (meta.adapted_platforms?.length) {
    console.log(`   Platforms: ${meta.adapted_platforms.join(', ')}`);
  }
  if (meta.platforms) {
    console.log('   Results:');
    for (const [platform, status] of Object.entries(meta.platforms)) {
      const icon = status.status === 'success' ? chalk.green('✔') : status.status === 'failed' ? chalk.red('✘') : chalk.gray('○');
      const detail = status.url ?? status.error ?? '';
      console.log(`     ${icon} ${platform}: ${status.status}${detail ? ` — ${detail}` : ''}`);
    }
  }
  console.log('');
}

async function printProjectStatus(engine: PipelineEngine, projectName?: string): Promise<number> {
  const status = await engine.getStatus();

  if (projectName) {
    console.log(chalk.blue.bold(`\n📁 ${projectName}`));
  } else {
    console.log(chalk.blue.bold('\n🚀 reach Content Factory Dashboard'));
  }
  console.log('');

  for (const stage of STAGES) {
    const data = status.stages[stage];
    const icon = data.count > 0 ? chalk.green('✔') : chalk.gray('○');
    console.log(`${icon} ${stage.padEnd(15)} : ${chalk.yellow(String(data.count))} items`);
    if (data.count > 0) {
      data.items.forEach((p: string) => console.log(chalk.dim(`   └─ ${p}`)));
    }
  }

  if (status.dueToday.length > 0) {
    console.log(chalk.magenta.bold(`\n📅 Due today: ${status.dueToday.join(', ')}`));
  }

  console.log('');
  return status.totalProjects;
}

export async function statusCommand(
  engine: PipelineEngine,
  options: { all?: boolean; article?: string; json?: boolean } = {},
  context?: WorkspaceContext,
): Promise<void> {
  // Per-article detail mode
  if (options.article) {
    if (options.json) {
      const meta = await engine.metadata.readArticleMeta(options.article);
      const stageFiles: Record<string, string[]> = {};
      for (const stage of STAGES) {
        const files = await engine.getArticleFiles(options.article, stage);
        if (files.length > 0) stageFiles[stage] = files;
      }
      process.stdout.write(jsonSuccess('status', {
        article: options.article,
        meta,
        stages: stageFiles,
      }));
      return;
    }
    await printArticleDetail(engine, options.article);
    return;
  }

  // --all mode: show all projects in workspace
  if (options.all && context?.workspaceRoot) {
    const projects = await WorkspaceResolver.listProjects(context.workspaceRoot);

    if (options.json) {
      const projectStatuses = [];
      for (const proj of projects) {
        try {
          const projEngine = new PipelineEngine(path.join(context.workspaceRoot, proj.name));
          const status = await projEngine.getStatus();
          projectStatuses.push({
            project: proj.name,
            stages: status.stages,
            dueToday: status.dueToday,
            totalProjects: status.totalProjects,
          });
        } catch {
          projectStatuses.push({ project: proj.name, error: 'Failed to read status' });
        }
      }
      process.stdout.write(jsonSuccess('status', {
        workspace: context.workspaceRoot,
        projects: projectStatuses,
      }));
      return;
    }

    if (projects.length === 0) {
      console.log(chalk.yellow('No projects found in workspace. Run `reach new <name>` to create one.'));
      return;
    }

    console.log(chalk.blue.bold(`\n🏗 Workspace: ${context.workspaceRoot}`));
    console.log(chalk.dim(`   ${projects.length} project(s)`));

    let totalItems = 0;
    for (const proj of projects) {
      try {
        const projEngine = new PipelineEngine(path.join(context.workspaceRoot, proj.name));
        totalItems += await printProjectStatus(projEngine, proj.name);
      } catch {
        console.log(chalk.red(`\n📁 ${proj.name} — error reading status\n`));
      }
    }

    console.log(chalk.blue.bold(`📊 Total across all projects: ${totalItems} items\n`));
    return;
  }

  // Single project --json mode
  if (options.json) {
    const status = await engine.getStatus();
    process.stdout.write(jsonSuccess('status', {
      project: context?.projectName ?? '',
      stages: status.stages,
      dueToday: status.dueToday,
      totalProjects: status.totalProjects,
    }));
    return;
  }

  // Single project mode
  await printProjectStatus(engine, context?.projectName);
}
