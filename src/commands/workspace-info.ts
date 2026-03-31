import chalk from 'chalk';
import { WorkspaceResolver } from '../core/workspace.js';
import type { WorkspaceContext } from '../core/workspace.js';
import { PipelineEngine } from '../core/pipeline.js';
import { jsonSuccess } from '../core/json-output.js';
import * as path from 'path';

export async function workspaceInfoCommand(context: WorkspaceContext, options: { json?: boolean } = {}): Promise<void> {
  if (!context.workspaceRoot) {
    if (options.json) {
      process.stdout.write(jsonSuccess('workspace', { workspace: null, projects: [] }));
      return;
    }
    console.log(chalk.yellow('Not in a workspace.'));
    console.log(chalk.dim('\nTo create a workspace:'));
    console.log(chalk.dim('  reach init [path]'));
    return;
  }

  const projects = await WorkspaceResolver.listProjects(context.workspaceRoot);

  if (options.json) {
    const projectList = [];
    for (const proj of projects) {
      const platforms = proj.config?.platforms ?? [];
      let itemCount = 0;
      try {
        const engine = new PipelineEngine(path.join(context.workspaceRoot, proj.name));
        const status = await engine.getStatus();
        itemCount = status.totalProjects;
      } catch { /* ignore */ }
      projectList.push({
        name: proj.name,
        platforms,
        items: itemCount,
        active: proj.name === context.projectName,
      });
    }
    process.stdout.write(jsonSuccess('workspace', {
      workspace: context.workspaceRoot,
      activeProject: context.projectName ?? null,
      projects: projectList,
    }));
    return;
  }

  console.log(chalk.blue.bold(`\n🏗 Workspace: ${context.workspaceRoot}`));

  if (context.projectName) {
    console.log(chalk.dim(`   Active project: ${context.projectName}`));
  }

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
