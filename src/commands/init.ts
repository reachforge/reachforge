import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import { WorkspaceResolver } from '../core/workspace.js';
import { writeWorkspaceConfig } from '../core/project-config.js';
import { DEFAULT_WORKSPACE_NAME } from '../core/constants.js';

export async function initCommand(targetPath?: string): Promise<void> {
  const wsRoot = path.resolve(targetPath || path.join(os.homedir(), DEFAULT_WORKSPACE_NAME));

  if (await WorkspaceResolver.isWorkspace(wsRoot)) {
    console.log(chalk.yellow(`Workspace already initialized at ${wsRoot}`));
    return;
  }

  await writeWorkspaceConfig(wsRoot, {});

  console.log(chalk.green(`✅ Workspace initialized at ${wsRoot}`));
  console.log(chalk.dim('\nNext steps:'));
  console.log(chalk.dim(`  cd ${wsRoot}`));
  console.log(chalk.dim('  reachforge new my-tech-blog'));
  console.log(chalk.dim('  cd my-tech-blog'));
  console.log(chalk.dim('  reachforge draft my-first-idea.md'));
}
