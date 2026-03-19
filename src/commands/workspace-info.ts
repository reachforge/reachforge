import chalk from 'chalk';
import { WorkspaceResolver } from '../core/workspace.js';
import type { WorkspaceContext } from '../core/workspace.js';
import { PipelineEngine } from '../core/pipeline.js';
import * as path from 'path';

export async function workspaceInfoCommand(context: WorkspaceContext): Promise<void> {
  if (!context.workspaceRoot) {
    console.log(chalk.yellow('Not in a workspace.'));
    console.log(chalk.dim('\nTo create a workspace:'));
    console.log(chalk.dim('  reach init [path]'));
    return;
  }

  console.log(chalk.blue.bold(`\n🏗 Workspace: ${context.workspaceRoot}`));

  if (context.projectName) {
    console.log(chalk.dim(`   Active project: ${context.projectName}`));
  }

  const projects = await WorkspaceResolver.listProjects(context.workspaceRoot);

  if (projects.length === 0) {
    console.log(chalk.yellow('\n   No projects yet. Run `reach new <name>` to create one.'));
  } else {
    console.log(chalk.dim(`   ${projects.length} project(s):\n`));

    for (const proj of projects) {
      const isActive = proj.name === context.projectName;
      const marker = isActive ? chalk.green('▶') : chalk.gray('○');
      const platforms = proj.config?.platforms?.join(', ') || 'none';

      try {
        const engine = new PipelineEngine(path.join(context.workspaceRoot, proj.name));
        const status = await engine.getStatus();
        console.log(`${marker} ${chalk.bold(proj.name)}  (${platforms})  ${chalk.dim(`${status.totalProjects} items`)}`);
      } catch {
        console.log(`${marker} ${chalk.bold(proj.name)}  (${platforms})  ${chalk.red('error reading status')}`);
      }
    }
  }

  console.log('');
}
