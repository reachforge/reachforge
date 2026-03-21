import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import fs from 'fs-extra';
import { WorkspaceResolver } from '../core/workspace.js';
import { writeWorkspaceConfig } from '../core/project-config.js';
import { DEFAULT_WORKSPACE_NAME } from '../core/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_EXAMPLE_PATH = path.resolve(__dirname, '../../.env.example');

export async function initCommand(targetPath?: string): Promise<void> {
  const wsRoot = path.resolve(targetPath || path.join(os.homedir(), DEFAULT_WORKSPACE_NAME));

  if (await WorkspaceResolver.isWorkspace(wsRoot)) {
    console.log(chalk.yellow(`Workspace already initialized at ${wsRoot}`));
    return;
  }

  await writeWorkspaceConfig(wsRoot, {});

  // Copy .env.example as .env template if one does not exist
  const envPath = path.join(wsRoot, '.env');
  if (!await fs.pathExists(envPath) && await fs.pathExists(ENV_EXAMPLE_PATH)) {
    await fs.copyFile(ENV_EXAMPLE_PATH, envPath);
    console.log(chalk.dim(`Created ${envPath} — edit it to add your platform API keys.`));
  }

  console.log(chalk.green(`Workspace initialized at ${wsRoot}`));
  console.log(chalk.dim('\nNext steps:'));
  console.log(chalk.dim(`  cd ${wsRoot}`));
  console.log(chalk.dim('  reach new my-tech-blog'));
  console.log(chalk.dim('  cd my-tech-blog'));
  console.log(chalk.dim('  reach draft my-first-idea.md'));
}
