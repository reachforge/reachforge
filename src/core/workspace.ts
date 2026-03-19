import * as path from 'path';
import * as os from 'os';
import fs from 'fs-extra';
import { readProjectConfig, readWorkspaceConfig } from './project-config.js';
import type { ProjectConfig } from './project-config.js';
import { WORKSPACE_CONFIG_DIR, WORKSPACE_CONFIG_FILE, PROJECT_CONFIG_FILE, DEFAULT_WORKSPACE_NAME } from './constants.js';

const GLOBAL_CONFIG_DIR = path.join(os.homedir(), WORKSPACE_CONFIG_DIR);
const DEFAULT_WORKSPACE_DIR = path.join(os.homedir(), DEFAULT_WORKSPACE_NAME);

export interface WorkspaceContext {
  workspaceRoot: string | undefined;
  projectDir: string;
  projectName: string | undefined;
  isWorkspace: boolean;
}

export class WorkspaceResolver {
  /**
   * 5-step context resolution:
   * 1. REACHFORGE_WORKSPACE env var or --workspace CLI flag
   * 2. Walk up from cwd looking for .reach/
   * 3. cwd contains project.yaml → cwd is project, parent is workspace
   * 4. ~/.reach/config.yaml default_workspace, or ~/reach-workspace as fallback
   * 5. Fallback: cwd as project root (backward compatible)
   */
  static async resolve(cwd: string, overrides?: { workspace?: string; project?: string }): Promise<WorkspaceContext> {
    // Step 1: explicit workspace override (CLI flag or env var)
    const explicitWorkspace = overrides?.workspace || process.env.REACHFORGE_WORKSPACE;
    if (explicitWorkspace) {
      const wsRoot = path.resolve(explicitWorkspace);
      if (overrides?.project) {
        return {
          workspaceRoot: wsRoot,
          projectDir: path.join(wsRoot, overrides.project),
          projectName: overrides.project,
          isWorkspace: true,
        };
      }
      // If cwd is inside this workspace, detect project from cwd
      const relative = path.relative(wsRoot, cwd);
      if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
        const projectName = relative.split(path.sep)[0];
        if (projectName && await fs.pathExists(path.join(wsRoot, projectName, PROJECT_CONFIG_FILE))) {
          return { workspaceRoot: wsRoot, projectDir: path.join(wsRoot, projectName), projectName, isWorkspace: true };
        }
      }
      return { workspaceRoot: wsRoot, projectDir: wsRoot, projectName: undefined, isWorkspace: true };
    }

    // Step 2: walk up from cwd looking for .reach/ directory
    const found = await WorkspaceResolver.findWorkspaceRoot(cwd);
    if (found) {
      const relative = path.relative(found, cwd);
      const projectName = relative ? relative.split(path.sep)[0] : undefined;

      if (overrides?.project) {
        return {
          workspaceRoot: found,
          projectDir: path.join(found, overrides.project),
          projectName: overrides.project,
          isWorkspace: true,
        };
      }

      if (projectName && await fs.pathExists(path.join(found, projectName, PROJECT_CONFIG_FILE))) {
        return { workspaceRoot: found, projectDir: path.join(found, projectName), projectName, isWorkspace: true };
      }
      return { workspaceRoot: found, projectDir: found, projectName: undefined, isWorkspace: true };
    }

    // Step 3: cwd contains project.yaml → cwd is project, parent is workspace
    if (await fs.pathExists(path.join(cwd, PROJECT_CONFIG_FILE))) {
      const parentDir = path.dirname(cwd);
      const isWs = await fs.pathExists(path.join(parentDir, WORKSPACE_CONFIG_DIR));
      return {
        workspaceRoot: isWs ? parentDir : undefined,
        projectDir: cwd,
        projectName: path.basename(cwd),
        isWorkspace: isWs,
      };
    }

    // Step 4: global config default_workspace or ~/reach-workspace
    const globalConfig = await readWorkspaceConfig(GLOBAL_CONFIG_DIR);
    const defaultWsPath = globalConfig?.default_workspace
      ? path.resolve(globalConfig.default_workspace)
      : DEFAULT_WORKSPACE_DIR;
    if (await fs.pathExists(path.join(defaultWsPath, WORKSPACE_CONFIG_DIR))) {
      return { workspaceRoot: defaultWsPath, projectDir: defaultWsPath, projectName: undefined, isWorkspace: true };
    }

    // Step 5: fallback — cwd as single-project root (backward compatible)
    return { workspaceRoot: undefined, projectDir: cwd, projectName: undefined, isWorkspace: false };
  }

  static async findWorkspaceRoot(startDir: string): Promise<string | undefined> {
    let current = path.resolve(startDir);
    const root = path.parse(current).root;

    while (current !== root) {
      if (await fs.pathExists(path.join(current, WORKSPACE_CONFIG_DIR, WORKSPACE_CONFIG_FILE))) {
        return current;
      }
      current = path.dirname(current);
    }
    return undefined;
  }

  static async listProjects(workspaceRoot: string): Promise<Array<{ name: string; config: ProjectConfig | null }>> {
    if (!await fs.pathExists(workspaceRoot)) return [];

    const entries = await fs.readdir(workspaceRoot);
    const projects: Array<{ name: string; config: ProjectConfig | null }> = [];

    for (const entry of entries) {
      if (entry.startsWith('.')) continue;
      const entryPath = path.join(workspaceRoot, entry);
      const stat = await fs.stat(entryPath);
      if (stat.isDirectory() && await fs.pathExists(path.join(entryPath, PROJECT_CONFIG_FILE))) {
        const config = await readProjectConfig(entryPath);
        projects.push({ name: entry, config });
      }
    }

    return projects.sort((a, b) => a.name.localeCompare(b.name));
  }

  static async isWorkspace(dir: string): Promise<boolean> {
    return fs.pathExists(path.join(dir, WORKSPACE_CONFIG_DIR, WORKSPACE_CONFIG_FILE));
  }

  static async isProject(dir: string): Promise<boolean> {
    return fs.pathExists(path.join(dir, PROJECT_CONFIG_FILE));
  }
}
