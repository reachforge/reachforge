import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import fs from 'fs-extra';
import { ConfigManager } from '../../../src/core/config.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reachforge-config-'));
  // Clear relevant env vars for test isolation
  delete process.env.GEMINI_API_KEY;
  delete process.env.DEVTO_API_KEY;
  delete process.env.REACHFORGE_LLM_MODEL;
});

afterEach(async () => {
  await fs.remove(tmpDir);
  delete process.env.GEMINI_API_KEY;
  delete process.env.DEVTO_API_KEY;
  delete process.env.REACHFORGE_LLM_MODEL;
});

describe('ConfigManager.load', () => {
  test('loads empty config when no sources exist', async () => {
    const config = await ConfigManager.load(tmpDir);
    expect(config.getConfig().geminiApiKey).toBeUndefined();
    expect(config.getConfig().devtoApiKey).toBeUndefined();
  });

  test('loads from credentials.yaml', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'credentials.yaml'),
      'gemini_api_key: yaml-key-123\ndevto_api_key: devto-yaml\n'
    );

    const config = await ConfigManager.load(tmpDir);
    expect(config.getApiKey('gemini')).toBe('yaml-key-123');
    expect(config.getApiKey('devto')).toBe('devto-yaml');
  });

  test('environment variables override credentials.yaml', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'credentials.yaml'),
      'gemini_api_key: yaml-key\n'
    );
    process.env.GEMINI_API_KEY = 'env-key-override';

    const config = await ConfigManager.load(tmpDir);
    expect(config.getApiKey('gemini')).toBe('env-key-override');
  });

  test('getLLMModel returns default when not configured', async () => {
    const config = await ConfigManager.load(tmpDir);
    expect(config.getLLMModel()).toBe('gemini-pro');
  });

  test('getLLMModel reads from REACHFORGE_LLM_MODEL env var', async () => {
    process.env.REACHFORGE_LLM_MODEL = 'gemini-1.5-flash';
    const config = await ConfigManager.load(tmpDir);
    expect(config.getLLMModel()).toBe('gemini-1.5-flash');
  });

  test('getApiKey returns undefined for unknown service', async () => {
    const config = await ConfigManager.load(tmpDir);
    expect(config.getApiKey('nonexistent')).toBeUndefined();
  });

  test('ignores invalid credentials.yaml gracefully', async () => {
    await fs.writeFile(path.join(tmpDir, 'credentials.yaml'), 'not: valid: yaml: {{');
    // Should not throw, just skip the file
    const config = await ConfigManager.load(tmpDir);
    expect(config.getConfig().geminiApiKey).toBeUndefined();
  });
});
