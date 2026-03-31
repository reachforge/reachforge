import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import fs from 'fs-extra';
import { WorkspaceResolver } from '../core/workspace.js';
import { writeWorkspaceConfig, writeConfigToDir, readConfigFromDir } from '../core/project-config.js';
import { WORKSPACE_CONFIG_DIR, WORKSPACE_CONFIG_FILE, DEFAULT_WORKSPACE_NAME } from '../core/constants.js';
import { jsonSuccess } from '../core/json-output.js';
// @ts-ignore — bun embeds this at compile time
import configTemplate from '../../config.example.yaml' with { type: 'text' };

function getGlobalConfigDir(): string {
  return path.join(os.homedir(), WORKSPACE_CONFIG_DIR);
}

function buildGlobalConfig(defaultWorkspace: string): string {
  // Prepend active default_workspace, then include the rest of the template
  return `# ReachForge global configuration\ndefault_workspace: ${defaultWorkspace}\n\n` +
    configTemplate.replace(/^# ReachForge configuration\n/, '');
}

/**
 * Ensure global config (~/.reach/config.yaml) exists.
 * Returns true if newly created.
 */
async function ensureGlobalConfig(defaultWorkspace: string): Promise<boolean> {
  const globalConfigPath = path.join(getGlobalConfigDir(), WORKSPACE_CONFIG_FILE);
  if (await fs.pathExists(globalConfigPath)) {
    // Update default_workspace if not set
    const existing = await readConfigFromDir(getGlobalConfigDir());
    if (!existing?.default_workspace) {
      await writeConfigToDir(getGlobalConfigDir(), {
        ...existing,
        default_workspace: defaultWorkspace,
      });
    }
    return false;
  }

  await fs.ensureDir(getGlobalConfigDir());
  await fs.writeFile(globalConfigPath, buildGlobalConfig(defaultWorkspace));
  return true;
}

/**
 * `reach init`          → init global + default workspace ~/reach-workspace
 * `reach init <path>`   → init global + workspace at <path>
 */
export async function initCommand(targetPath?: string, options: { json?: boolean } = {}): Promise<void> {
  const wsRoot = path.resolve(targetPath || path.join(os.homedir(), DEFAULT_WORKSPACE_NAME));

  if (await WorkspaceResolver.isWorkspace(wsRoot)) {
    if (options.json) {
      process.stdout.write(jsonSuccess('init', { workspace: wsRoot, created: false }));
      return;
    }
    console.log(chalk.yellow(`Workspace already initialized at ${wsRoot}`));
    return;
  }

  // Ensure global config, pointing to this workspace
  const globalCreated = await ensureGlobalConfig(wsRoot);
  if (globalCreated) {
    console.log(chalk.dim(`Global config created at ${getGlobalConfigDir()}/config.yaml`));
  }

  // Create workspace .reach/config.yaml (from same template, all commented)
  const wsConfigDir = path.join(wsRoot, WORKSPACE_CONFIG_DIR);
  await fs.ensureDir(wsConfigDir);
  const wsConfigPath = path.join(wsConfigDir, WORKSPACE_CONFIG_FILE);
  if (!await fs.pathExists(wsConfigPath)) {
    await fs.writeFile(wsConfigPath, configTemplate);
  }

  if (options.json) {
    process.stdout.write(jsonSuccess('init', {
      workspace: wsRoot,
      created: true,
      configDir: wsConfigDir,
    }));
    return;
  }

  console.log(chalk.green(`Workspace initialized at ${wsRoot}`));
  console.log(chalk.dim(`  Config: ${wsConfigDir}/config.yaml`));
  console.log(chalk.dim('\nNext steps:'));
  console.log(chalk.dim(`  cd ${wsRoot}`));
  console.log(chalk.dim('  reach new my-tech-blog'));
  console.log(chalk.dim('  cd my-tech-blog'));
  console.log(chalk.dim('  reach go "write about ..."'));
}
