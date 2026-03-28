import { describe, test, expect } from 'vitest';
import { APCore } from 'apcore-js';
import { GroupedModuleGroup } from 'apcore-cli';
import type { Registry as CliRegistry, Executor as CliExecutor } from 'apcore-cli';

function createTestSetup() {
  const apcore = new APCore();

  function meta(moduleId: string) {
    const alias = moduleId.replace(/^reach\./, '');
    return {
      description: `Test ${moduleId}`,
      inputSchema: { type: 'object' as const, properties: {} },
      metadata: { display: { cli: { alias } } },
    };
  }

  // Register sample modules covering all grouping patterns
  apcore.register('reach.status', { ...meta('reach.status'), execute: async () => {} });
  apcore.register('reach.draft', { ...meta('reach.draft'), execute: async () => {} });
  apcore.register('reach.publish', { ...meta('reach.publish'), execute: async () => {} });
  apcore.register('reach.go', { ...meta('reach.go'), execute: async () => {} });
  apcore.register('reach.init', { ...meta('reach.init'), execute: async () => {} });
  apcore.register('reach.series.init', { ...meta('reach.series.init'), execute: async () => {} });
  apcore.register('reach.series.outline', { ...meta('reach.series.outline'), execute: async () => {} });
  apcore.register('reach.asset.add', { ...meta('reach.asset.add'), execute: async () => {} });
  apcore.register('reach.asset.list', { ...meta('reach.asset.list'), execute: async () => {} });

  const registryAdapter: CliRegistry = {
    listModules() {
      return apcore.registry.list().map((id: string) => {
        const mod = apcore.registry.get(id) as Record<string, unknown> | undefined;
        return { id, name: id, ...(mod ?? {}) } as ReturnType<CliRegistry['listModules']>[number];
      });
    },
    getModule(moduleId: string) {
      const mod = apcore.registry.get(moduleId) as Record<string, unknown> | undefined;
      if (!mod) return null;
      return { id: moduleId, name: moduleId, ...mod } as ReturnType<CliRegistry['getModule']>;
    },
  };

  const executorAdapter: CliExecutor = {
    async execute(moduleId: string, input: Record<string, unknown>) {
      return apcore.executor.call(moduleId, input) as Promise<unknown>;
    },
  };

  return { apcore, registryAdapter, executorAdapter };
}

describe('apcore-cli integration', () => {
  test('GroupedModuleGroup resolves top-level commands from reach.X aliases', () => {
    const { registryAdapter, executorAdapter } = createTestSetup();
    const group = new GroupedModuleGroup(registryAdapter, executorAdapter);
    const commands = group.listCommands();

    // Top-level commands (reach.status → "status")
    expect(commands).toContain('status');
    expect(commands).toContain('draft');
    expect(commands).toContain('publish');
    expect(commands).toContain('go');
    expect(commands).toContain('init');
  });

  test('GroupedModuleGroup resolves grouped commands from dotted aliases', () => {
    const { registryAdapter, executorAdapter } = createTestSetup();
    const group = new GroupedModuleGroup(registryAdapter, executorAdapter);
    const commands = group.listCommands();

    // Grouped commands (reach.series.init → group "series")
    expect(commands).toContain('series');
    expect(commands).toContain('asset');
  });

  test('reach. prefix is NOT a group name', () => {
    const { registryAdapter, executorAdapter } = createTestSetup();
    const group = new GroupedModuleGroup(registryAdapter, executorAdapter);
    const commands = group.listCommands();

    // "reach" should NOT appear as a group
    expect(commands).not.toContain('reach');
  });

  test('getCommand returns Commander Command for top-level module', () => {
    const { registryAdapter, executorAdapter } = createTestSetup();
    const group = new GroupedModuleGroup(registryAdapter, executorAdapter);

    const cmd = group.getCommand('status');
    expect(cmd).not.toBeNull();
    expect(cmd!.name()).toBe('status');
  });

  test('getCommand returns Commander Command for grouped module', () => {
    const { registryAdapter, executorAdapter } = createTestSetup();
    const group = new GroupedModuleGroup(registryAdapter, executorAdapter);

    const cmd = group.getCommand('series');
    expect(cmd).not.toBeNull();
    expect(cmd!.name()).toBe('series');
  });
});
