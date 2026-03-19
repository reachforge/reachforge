import * as path from 'path';
import chalk from 'chalk';
import { PipelineEngine } from '../core/pipeline.js';
import { STAGES } from '../core/constants.js';
import { WorkspaceResolver } from '../core/workspace.js';
import type { WorkspaceContext } from '../core/workspace.js';

async function printProjectStatus(engine: PipelineEngine, projectName?: string): Promise<number> {
  const status = await engine.getStatus();

  if (projectName) {
    console.log(chalk.blue.bold(`\n📁 ${projectName}`));
  } else {
    console.log(chalk.blue.bold('\n🚀 reachforge Content Factory Dashboard'));
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
  options: { all?: boolean } = {},
  context?: WorkspaceContext,
): Promise<void> {
  // --all mode: show all projects in workspace
  if (options.all && context?.workspaceRoot) {
    const projects = await WorkspaceResolver.listProjects(context.workspaceRoot);

    if (projects.length === 0) {
      console.log(chalk.yellow('No projects found in workspace. Run `reachforge new <name>` to create one.'));
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

  // Single project mode
  await printProjectStatus(engine, context?.projectName);
}
