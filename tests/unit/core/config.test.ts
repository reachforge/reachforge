import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import { WORKSPACE_CONFIG_DIR } from '../../../src/core/constants.js';

// Mock homedir to isolate from real ~/.reach/config.yaml
let fakeHome: string;
vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return { ...actual, homedir: () => fakeHome };
});

const { ConfigManager } = await import('../../../src/core/config.js');

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reach-config-'));
  fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'reach-home-'));
  delete process.env.GEMINI_API_KEY;
  delete process.env.DEVTO_API_KEY;
  delete process.env.REACHFORGE_LLM_MODEL;
});

afterEach(async () => {
  await fs.remove(tmpDir);
  await fs.remove(fakeHome);
  delete process.env.GEMINI_API_KEY;
  delete process.env.DEVTO_API_KEY;
  delete process.env.REACHFORGE_LLM_MODEL;
});

/** Write global config in namespace format. */
async function writeGlobalConfig(data: Record<string, unknown>): Promise<void> {
  const dir = path.join(fakeHome, WORKSPACE_CONFIG_DIR);
  await fs.ensureDir(dir);
  // Wrap into namespace mode if flat keys provided
  const content = data.apcore !== undefined ? data : { apcore: {}, reach: data };
  await fs.writeFile(path.join(dir, 'config.yaml'), yaml.dump(content));
}

/** Write workspace config — supports both flat and namespaced formats. */
async function writeWorkspaceConfig(wsRoot: string, data: Record<string, unknown>): Promise<void> {
  const dir = path.join(wsRoot, WORKSPACE_CONFIG_DIR);
  await fs.ensureDir(dir);
  await fs.writeFile(path.join(dir, 'config.yaml'), yaml.dump(data));
}

describe('ConfigManager.load', () => {
  test('loads empty config when no sources exist', async () => {
    const config = await ConfigManager.load();
    expect(config.getConfig().geminiApiKey).toBeUndefined();
    expect(config.getConfig().devtoApiKey).toBeUndefined();
  });

  test('loads API keys from global config.yaml', async () => {
    await writeGlobalConfig({
      gemini_api_key: 'global-gemini',
      devto_api_key: 'global-devto',
    });

    const config = await ConfigManager.load();
    expect(config.getApiKey('gemini')).toBe('global-gemini');
    expect(config.getApiKey('devto')).toBe('global-devto');
  });

  test('workspace config overrides global config', async () => {
    await writeGlobalConfig({ devto_api_key: 'global-key' });
    await writeWorkspaceConfig(tmpDir, { devto_api_key: 'workspace-key' });

    const config = await ConfigManager.load(tmpDir);
    expect(config.getApiKey('devto')).toBe('workspace-key');
  });

  test('environment variables override config.yaml', async () => {
    await writeGlobalConfig({ gemini_api_key: 'yaml-key' });
    process.env.GEMINI_API_KEY = 'env-key-override';

    const config = await ConfigManager.load();
    expect(config.getApiKey('gemini')).toBe('env-key-override');
  });

  test('getLLMModel returns default when not configured', async () => {
    const config = await ConfigManager.load();
    expect(config.getLLMModel()).toBe('gemini-pro');
  });

  test('getLLMModel reads from config.yaml', async () => {
    await writeGlobalConfig({ llm_model: 'claude-sonnet' });

    const config = await ConfigManager.load();
    expect(config.getLLMModel()).toBe('claude-sonnet');
  });

  test('getLLMModel env var overrides config.yaml', async () => {
    await writeGlobalConfig({ llm_model: 'claude-sonnet' });
    process.env.REACHFORGE_LLM_MODEL = 'gemini-1.5-flash';

    const config = await ConfigManager.load();
    expect(config.getLLMModel()).toBe('gemini-1.5-flash');
  });

  test('getApiKey returns undefined for unknown service', async () => {
    const config = await ConfigManager.load();
    expect(config.getApiKey('nonexistent')).toBeUndefined();
  });

  test('exposes underlying apcore Config instance', async () => {
    await writeGlobalConfig({ devto_api_key: 'test-key' });
    const config = await ConfigManager.load();
    const apcoreConfig = config.getApcoreConfig();
    expect(apcoreConfig).toBeDefined();
    const reach = apcoreConfig.namespace('reach') as Record<string, unknown>;
    expect(reach.devto_api_key).toBe('test-key');
  });

  test('supports namespace-format config files', async () => {
    // Write config in explicit namespace format
    await writeGlobalConfig({
      apcore: {},
      reach: { devto_api_key: 'ns-key', llm_model: 'ns-model' },
    });
    const config = await ConfigManager.load();
    expect(config.getApiKey('devto')).toBe('ns-key');
    expect(config.getLLMModel()).toBe('ns-model');
  });

  test('supports flat workspace config (auto-wrapped)', async () => {
    await writeGlobalConfig({ devto_api_key: 'global-key' });
    // Workspace config in flat format (no reach: wrapper)
    await writeWorkspaceConfig(tmpDir, { devto_api_key: 'ws-flat-key' });

    const config = await ConfigManager.load(tmpDir);
    expect(config.getApiKey('devto')).toBe('ws-flat-key');
  });
});
