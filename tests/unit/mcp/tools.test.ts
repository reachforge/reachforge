import { describe, test, expect } from 'vitest';
import {
  StatusToolSchema,
  DraftToolSchema,
  AdaptToolSchema,
  ScheduleToolSchema,
  PublishToolSchema,
  RollbackToolSchema,
  MCP_TOOL_DEFINITIONS,
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

  test('ScheduleToolSchema validates date format', () => {
    expect(ScheduleToolSchema.safeParse({ article: 'post', date: '2026-03-20' }).success).toBe(true);
    expect(ScheduleToolSchema.safeParse({ article: 'post', date: '03/20/2026' }).success).toBe(false);
    expect(ScheduleToolSchema.safeParse({ article: 'post', date: 'tomorrow' }).success).toBe(false);
  });

  test('PublishToolSchema optional dryRun', () => {
    expect(PublishToolSchema.safeParse({}).success).toBe(true);
    expect(PublishToolSchema.safeParse({ dryRun: true }).success).toBe(true);
  });

  test('RollbackToolSchema requires project', () => {
    expect(RollbackToolSchema.safeParse({ project: 'my-post' }).success).toBe(true);
    expect(RollbackToolSchema.safeParse({}).success).toBe(false);
  });
});

describe('MCP_TOOL_DEFINITIONS', () => {
  test('has 6 tool definitions', () => {
    expect(MCP_TOOL_DEFINITIONS).toHaveLength(6);
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
  });
});
