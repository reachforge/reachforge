import * as path from 'path';
import chalk from 'chalk';
import { WorkspaceResolver } from '../core/workspace.js';
import { writeWorkspaceConfig } from '../core/project-config.js';

export async function initCommand(targetPath?: string): Promise<void> {
  const wsRoot = path.resolve(targetPath || process.cwd());

  if (await WorkspaceResolver.isWorkspace(wsRoot)) {
    console.log(chalk.yellow(`Workspace already initialized at ${wsRoot}`));
    return;
  }

  await writeWorkspaceConfig(wsRoot, {});

  console.log(chalk.green(`✅ Workspace initialized at ${wsRoot}`));
  console.log(chalk.dim('\nNext steps:'));
  console.log(chalk.dim(`  cd ${wsRoot}`));
  console.log(chalk.dim('  aphype new my-tech-blog'));
  console.log(chalk.dim('  cd my-tech-blog'));
  console.log(chalk.dim('  aphype draft my-first-idea.md'));
}
