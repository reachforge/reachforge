import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { SessionManager } from '../../../src/llm/session.js';
import { SessionValidationError, ReachforgeError } from '../../../src/types/index.js';
import type { SessionData } from '../../../src/llm/types.js';

let tmpDir: string;
let manager: SessionManager;

const validSession: SessionData = {
  sessionId: 'sess-abc-123',
  adapter: 'claude',
  stage: 'draft',
  cwd: '/tmp/project',
  createdAt: '2026-03-17T10:00:00.000Z',
  lastUsedAt: '2026-03-17T14:30:00.000Z',
};

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reach-session-'));
  manager = new SessionManager(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// --- T01: Types ---

describe('SessionData & SessionValidationError', () => {
  test('SessionData interface has all required fields', () => {
    const data: SessionData = validSession;
    expect(data.sessionId).toBe('sess-abc-123');
    expect(data.adapter).toBe('claude');
    expect(data.stage).toBe('draft');
    expect(data.cwd).toBe('/tmp/project');
    expect(data.createdAt).toBeDefined();
    expect(data.lastUsedAt).toBeDefined();
  });

  test('SessionValidationError extends ReachforgeError with correct name', () => {
    const err = new SessionValidationError('test');
    expect(err).toBeInstanceOf(ReachforgeError);
    expect(err.name).toBe('SessionValidationError');
  });
});

// --- T02: save, load, getSessionPath ---

describe('SessionManager constructor', () => {
  test('throws for non-absolute projectDir', () => {
    expect(() => new SessionManager('relative/path')).toThrow('projectDir must be an absolute path');
  });
});

describe('SessionManager.save & load', () => {
  test('save then load returns identical SessionData', async () => {
    await manager.save('my-article', 'draft', validSession);
    const loaded = await manager.load('my-article', 'draft');
    expect(loaded).toEqual(validSession);
  });

  test('save creates parent directories if they don\'t exist', async () => {
    await manager.save('new-article', 'draft', validSession);
    const sessionPath = manager.getSessionPath('new-article', 'draft');
    const stat = await fs.stat(sessionPath);
    expect(stat.isFile()).toBe(true);
  });

  test('save overwrites existing session file', async () => {
    await manager.save('art', 'draft', validSession);
    const updated = { ...validSession, lastUsedAt: '2026-03-18T10:00:00.000Z' };
    await manager.save('art', 'draft', updated);
    const loaded = await manager.load('art', 'draft');
    expect(loaded!.lastUsedAt).toBe('2026-03-18T10:00:00.000Z');
  });

  test('save throws SessionValidationError for invalid sessionId (empty string)', async () => {
    const bad = { ...validSession, sessionId: '' };
    await expect(manager.save('art', 'draft', bad)).rejects.toThrow(SessionValidationError);
  });

  test('save throws SessionValidationError for invalid adapter', async () => {
    const bad = { ...validSession, adapter: 'gpt4' as any };
    await expect(manager.save('art', 'draft', bad)).rejects.toThrow(SessionValidationError);
  });

  test('save throws SessionValidationError for invalid stage in data', async () => {
    const bad = { ...validSession, stage: 'unknown' };
    await expect(manager.save('art', 'draft', bad)).rejects.toThrow(SessionValidationError);
  });

  test('load returns null when session file doesn\'t exist', async () => {
    const result = await manager.load('nonexistent', 'draft');
    expect(result).toBeNull();
  });

  test('load returns null when file contains invalid JSON', async () => {
    const filePath = manager.getSessionPath('art', 'draft');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, 'not json{{{', 'utf-8');

    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await manager.load('art', 'draft');
    expect(result).toBeNull();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('invalid JSON'));
    spy.mockRestore();
  });

  test('load returns null when file fails schema validation', async () => {
    const filePath = manager.getSessionPath('art', 'draft');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify({ sessionId: 'x' }), 'utf-8');

    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await manager.load('art', 'draft');
    expect(result).toBeNull();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('schema validation failed'));
    spy.mockRestore();
  });

  test('load returns null for invalid article name (empty string)', async () => {
    const result = await manager.load('', 'draft');
    expect(result).toBeNull();
  });

  test('load returns null for invalid stage name', async () => {
    const result = await manager.load('art', 'badstage');
    expect(result).toBeNull();
  });
});

describe('SessionManager.getSessionPath', () => {
  test('returns correct path for draft stage', () => {
    const p = manager.getSessionPath('my-article', 'draft');
    expect(p).toBe(path.join(tmpDir, '.reach', 'sessions', 'my-article', 'draft.json'));
  });

  test('returns correct path for adapt-x stage', () => {
    const p = manager.getSessionPath('my-article', 'adapt-x');
    expect(p).toBe(path.join(tmpDir, '.reach', 'sessions', 'my-article', 'adapt-x.json'));
  });
});

describe('atomic write', () => {
  test('.tmp file is cleaned up after save', async () => {
    await manager.save('art', 'draft', validSession);
    const tmpPath = manager.getSessionPath('art', 'draft') + '.tmp';
    await expect(fs.access(tmpPath)).rejects.toThrow();
  });
});

// --- T03: delete, deleteAll, list ---

describe('SessionManager.delete', () => {
  test('removes session file', async () => {
    await manager.save('art', 'draft', validSession);
    await manager.delete('art', 'draft');
    const result = await manager.load('art', 'draft');
    expect(result).toBeNull();
  });

  test('is no-op when file doesn\'t exist', async () => {
    // Should not throw
    await manager.delete('nonexistent', 'draft');
  });
});

describe('SessionManager.deleteAll', () => {
  test('removes entire article session directory', async () => {
    await manager.save('art', 'draft', validSession);
    await manager.save('art', 'adapt-x', { ...validSession, stage: 'adapt-x' });
    await manager.deleteAll('art');

    const draftResult = await manager.load('art', 'draft');
    const adaptResult = await manager.load('art', 'adapt-x');
    expect(draftResult).toBeNull();
    expect(adaptResult).toBeNull();
  });

  test('is no-op when article directory doesn\'t exist', async () => {
    await manager.deleteAll('nonexistent');
  });
});

describe('SessionManager.list', () => {
  test('returns all valid sessions for an article', async () => {
    await manager.save('art', 'draft', validSession);
    await manager.save('art', 'adapt-x', { ...validSession, stage: 'adapt-x', lastUsedAt: '2026-03-17T12:00:00.000Z' });

    const sessions = await manager.list('art');
    expect(sessions).toHaveLength(2);
    expect(sessions.map(s => s.stage)).toContain('draft');
    expect(sessions.map(s => s.stage)).toContain('adapt-x');
  });

  test('skips corrupted session files', async () => {
    await manager.save('art', 'draft', validSession);
    // Write a corrupted file
    const corruptPath = manager.getSessionPath('art', 'adapt-x');
    await fs.mkdir(path.dirname(corruptPath), { recursive: true });
    await fs.writeFile(corruptPath, 'broken{', 'utf-8');

    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sessions = await manager.list('art');
    expect(sessions).toHaveLength(1);
    expect(sessions[0].stage).toBe('draft');
    spy.mockRestore();
  });

  test('returns empty array when no sessions exist', async () => {
    const sessions = await manager.list('nonexistent');
    expect(sessions).toEqual([]);
  });

  test('sorts by lastUsedAt descending', async () => {
    await manager.save('art', 'draft', { ...validSession, stage: 'draft', lastUsedAt: '2026-03-17T10:00:00.000Z' });
    await manager.save('art', 'adapt-x', { ...validSession, stage: 'adapt-x', lastUsedAt: '2026-03-17T16:00:00.000Z' });
    await manager.save('art', 'adapt-devto', { ...validSession, stage: 'adapt-devto', lastUsedAt: '2026-03-17T12:00:00.000Z' });

    const sessions = await manager.list('art');
    expect(sessions[0].stage).toBe('adapt-x');
    expect(sessions[1].stage).toBe('adapt-devto');
    expect(sessions[2].stage).toBe('draft');
  });
});
