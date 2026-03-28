import { describe, test, expect } from 'vitest';
import {
  StatusToolSchema,
  DraftToolSchema,
  AdaptToolSchema,
  ScheduleToolSchema,
  PublishToolSchema,
  RollbackToolSchema,
  RefineToolSchema,
  AssetAddToolSchema,
  AssetListToolSchema,
  AnalyticsToolSchema,
  MCP_TOOL_DEFINITIONS,
  TOOL_METADATA,
} from '../../../src/mcp/tools.js';

describe('MCP Tool Schemas', () => {
  test('StatusToolSchema accepts empty object', () => {
    expect(StatusToolSchema.safeParse({}).success).toBe(true);
  });

  test('DraftToolSchema requires source', () => {
    expect(DraftToolSchema.safeParse({}).success).toBe(false);
    expect(DraftToolSchema.safeParse({ source: 'my-idea' }).success).toBe(true);
    expect(DraftToolSchema.safeParse({ source: '' }).success).toBe(false);
  });

  test('AdaptToolSchema requires article, optional platforms', () => {
    expect(AdaptToolSchema.safeParse({ article: 'post' }).success).toBe(true);
    expect(AdaptToolSchema.safeParse({ article: 'post', platforms: 'x,devto' }).success).toBe(true);
    expect(AdaptToolSchema.safeParse({}).success).toBe(false);
  });

  test('ScheduleToolSchema accepts date as optional string', () => {
    expect(ScheduleToolSchema.safeParse({ article: 'post', date: '2026-03-20' }).success).toBe(true);
    expect(ScheduleToolSchema.safeParse({ article: 'post', date: '03/20/2026' }).success).toBe(true);
    expect(ScheduleToolSchema.safeParse({ article: 'post', date: 'tomorrow' }).success).toBe(true);
    expect(ScheduleToolSchema.safeParse({ article: 'post' }).success).toBe(true);
  });

  test('PublishToolSchema optional dryRun', () => {
    expect(PublishToolSchema.safeParse({}).success).toBe(true);
    expect(PublishToolSchema.safeParse({ dryRun: true }).success).toBe(true);
  });

  test('RollbackToolSchema requires article', () => {
    expect(RollbackToolSchema.safeParse({ article: 'my-post' }).success).toBe(true);
    expect(RollbackToolSchema.safeParse({}).success).toBe(false);
  });

  test('RefineToolSchema requires article and feedback', () => {
    expect(RefineToolSchema.safeParse({ article: 'my-draft', feedback: 'make it shorter' }).success).toBe(true);
    expect(RefineToolSchema.safeParse({ article: 'my-draft' }).success).toBe(false);
    expect(RefineToolSchema.safeParse({}).success).toBe(false);
  });

  test('AssetAddToolSchema requires file, optional subdir', () => {
    expect(AssetAddToolSchema.safeParse({ file: './logo.png' }).success).toBe(true);
    expect(AssetAddToolSchema.safeParse({ file: './logo.png', subdir: 'images' }).success).toBe(true);
    expect(AssetAddToolSchema.safeParse({ file: './logo.png', subdir: 'invalid' }).success).toBe(false);
    expect(AssetAddToolSchema.safeParse({}).success).toBe(false);
  });

  test('AssetListToolSchema optional subdir', () => {
    expect(AssetListToolSchema.safeParse({}).success).toBe(true);
    expect(AssetListToolSchema.safeParse({ subdir: 'videos' }).success).toBe(true);
    expect(AssetListToolSchema.safeParse({ subdir: 'invalid' }).success).toBe(false);
  });

  test('AnalyticsToolSchema optional date filters', () => {
    expect(AnalyticsToolSchema.safeParse({}).success).toBe(true);
    expect(AnalyticsToolSchema.safeParse({ from: '2026-03-01' }).success).toBe(true);
    expect(AnalyticsToolSchema.safeParse({ from: '2026-03-01', to: '2026-03-31' }).success).toBe(true);
    expect(AnalyticsToolSchema.safeParse({ from: 'invalid' }).success).toBe(false);
  });
});

describe('TOOL_METADATA', () => {
  test('has 14 tool entries', () => {
    expect(Object.keys(TOOL_METADATA)).toHaveLength(14);
  });

  test('all entries have description and inputSchema', () => {
    for (const [moduleId, meta] of Object.entries(TOOL_METADATA)) {
      expect(meta.description.length).toBeGreaterThan(10);
      expect(meta.inputSchema).toBeDefined();
      expect(typeof meta.inputSchema).toBe('object');
    }
  });

  test('inputSchema has type: object for all tools', () => {
    for (const [moduleId, meta] of Object.entries(TOOL_METADATA)) {
      expect(meta.inputSchema).toHaveProperty('type', 'object');
    }
  });

  test('includes reach.refine', () => {
    expect(TOOL_METADATA['reach.refine']).toBeDefined();
    expect(TOOL_METADATA['reach.refine'].inputSchema).toHaveProperty('properties');
    const props = (TOOL_METADATA['reach.refine'].inputSchema as any).properties;
    expect(props).toHaveProperty('article');
    expect(props).toHaveProperty('feedback');
  });
});

describe('MCP_TOOL_DEFINITIONS', () => {
  test('has 13 tool definitions', () => {
    expect(MCP_TOOL_DEFINITIONS).toHaveLength(14);
  });

  test('all tools have name, description, and schema', () => {
    for (const tool of MCP_TOOL_DEFINITIONS) {
      expect(tool.name).toBeDefined();
      expect(tool.name.startsWith('reach_')).toBe(true);
      expect(tool.description.length).toBeGreaterThan(10);
      expect(tool.schema).toBeDefined();
    }
  });

  test('tool names match expected set', () => {
    const names = MCP_TOOL_DEFINITIONS.map(t => t.name);
    expect(names).toContain('reach_status');
    expect(names).toContain('reach_draft');
    expect(names).toContain('reach_adapt');
    expect(names).toContain('reach_schedule');
    expect(names).toContain('reach_publish');
    expect(names).toContain('reach_rollback');
    expect(names).toContain('reach_refine');
    expect(names).toContain('reach_asset_add');
    expect(names).toContain('reach_asset_list');
    expect(names).toContain('reach_go');
    expect(names).toContain('reach_analytics');
    // reach_approve has been removed (pipeline simplified)
    expect(names).not.toContain('reach_approve');
  });
});
