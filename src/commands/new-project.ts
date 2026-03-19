import * as path from 'path';
import chalk from 'chalk';
import fs from 'fs-extra';
import { sanitizePath } from '../utils/path.js';
import { WorkspaceResolver } from '../core/workspace.js';
import { writeProjectConfig } from '../core/project-config.js';
import { STAGES } from '../core/constants.js';
import type { WorkspaceContext } from '../core/workspace.js';

export async function newProjectCommand(
  projectName: string,
  context?: WorkspaceContext,
): Promise<void> {
  const safeName = sanitizePath(projectName);

  const wsRoot = context?.workspaceRoot;
  if (!wsRoot) {
    throw new Error(
      'Not in a workspace. Run `reachforge init` first to create a workspace, then `reachforge new <name>`.'
    );
  }

  const projectDir = path.join(wsRoot, safeName);

  if (await fs.pathExists(projectDir)) {
    throw new Error(`Project "${safeName}" already exists at ${projectDir}`);
  }

  // Create project directory with pipeline stages
  for (const stage of STAGES) {
    await fs.ensureDir(path.join(projectDir, stage));
  }

  // Create project.yaml
  await writeProjectConfig(projectDir, {
    name: safeName,
    platforms: [],
    default_tags: [],
    history: [],
  });

  console.log(chalk.green(`✅ Project "${safeName}" created at ${projectDir}`));
  console.log(chalk.dim('\nNext steps:'));
  console.log(chalk.dim(`  cd ${projectDir}`));
  console.log(chalk.dim(`  # Edit project.yaml to set platforms, language, tone`));
  console.log(chalk.dim('  reachforge draft my-idea.md'));
}
