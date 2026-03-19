import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { SkillResolver } from '../../../src/llm/skills.js';
import type { ResolvedSkill } from '../../../src/llm/types.js';

let tmpDir: string;
let builtInDir: string;
let workspaceDir: string;
let projectDir: string;

async function writeSkill(baseDir: string, relativePath: string, content: string = '# Skill') {
  const fullPath = path.join(baseDir, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, 'utf-8');
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reach-skills-test-'));
  builtInDir = path.join(tmpDir, 'built-in');
  workspaceDir = path.join(tmpDir, 'workspace');
  projectDir = path.join(tmpDir, 'project');
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// --- T01: ResolvedSkill type ---

describe('ResolvedSkill type', () => {
  test('has name, path, source fields', () => {
    const skill: ResolvedSkill = {
      name: 'stages/draft.md',
      path: '/some/path/stages/draft.md',
      source: 'built-in',
    };
    expect(skill.name).toBe('stages/draft.md');
    expect(skill.path).toBe('/some/path/stages/draft.md');
    expect(skill.source).toBe('built-in');
  });
});

// --- T02: Built-in skill files ---

describe('Built-in skill files', () => {
  test('all 7 built-in skill files exist and are non-empty', async () => {
    const skillsRoot = path.join(process.cwd(), 'skills');
    const expected = [
      'stages/draft.md', 'stages/adapt.md',
      'platforms/x.md', 'platforms/devto.md',
      'platforms/wechat.md', 'platforms/zhihu.md', 'platforms/hashnode.md',
    ];
    for (const rel of expected) {
      const content = await fs.readFile(path.join(skillsRoot, rel), 'utf-8');
      expect(content.length).toBeGreaterThan(0);
    }
  });
});

// --- T03: resolve() ---

describe('SkillResolver.resolve', () => {
  test('resolve("draft") returns built-in stages/draft.md when only built-in exists', async () => {
    await writeSkill(builtInDir, 'stages/draft.md', '# Draft');
    const resolver = new SkillResolver(builtInDir, '', '');
    const skills = await resolver.resolve('draft');
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('stages/draft.md');
    expect(skills[0].source).toBe('built-in');
  });

  test('resolve("draft") returns project stages/draft.md when project overrides built-in', async () => {
    await writeSkill(builtInDir, 'stages/draft.md', '# Built-in');
    await writeSkill(path.join(projectDir, 'skills'), 'stages/draft.md', '# Project');
    const resolver = new SkillResolver(builtInDir, '', projectDir);
    const skills = await resolver.resolve('draft');
    expect(skills).toHaveLength(1);
    expect(skills[0].source).toBe('project');
  });

  test('resolve("draft") returns workspace stages/draft.md when workspace overrides built-in', async () => {
    await writeSkill(builtInDir, 'stages/draft.md', '# Built-in');
    await writeSkill(path.join(workspaceDir, 'skills'), 'stages/draft.md', '# Workspace');
    const resolver = new SkillResolver(builtInDir, workspaceDir, '');
    const skills = await resolver.resolve('draft');
    expect(skills).toHaveLength(1);
    expect(skills[0].source).toBe('workspace');
  });

  test('resolve("draft") returns project skill when all three layers have the same file', async () => {
    await writeSkill(builtInDir, 'stages/draft.md', '# Built-in');
    await writeSkill(path.join(workspaceDir, 'skills'), 'stages/draft.md', '# Workspace');
    await writeSkill(path.join(projectDir, 'skills'), 'stages/draft.md', '# Project');
    const resolver = new SkillResolver(builtInDir, workspaceDir, projectDir);
    const skills = await resolver.resolve('draft');
    expect(skills[0].source).toBe('project');
  });

  test('resolve("adapt", "x") returns both stages/adapt.md and platforms/x.md', async () => {
    await writeSkill(builtInDir, 'stages/adapt.md');
    await writeSkill(builtInDir, 'platforms/x.md');
    const resolver = new SkillResolver(builtInDir, '', '');
    const skills = await resolver.resolve('adapt', 'x');
    expect(skills).toHaveLength(2);
    expect(skills.map(s => s.name)).toEqual(['stages/adapt.md', 'platforms/x.md']);
  });

  test('resolve("adapt", "x") returns only stages/adapt.md when platforms/x.md doesn\'t exist', async () => {
    await writeSkill(builtInDir, 'stages/adapt.md');
    const resolver = new SkillResolver(builtInDir, '', '');
    const skills = await resolver.resolve('adapt', 'x');
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('stages/adapt.md');
  });

  test('resolve("adapt") without platform returns only stages/adapt.md', async () => {
    await writeSkill(builtInDir, 'stages/adapt.md');
    await writeSkill(builtInDir, 'platforms/x.md');
    const resolver = new SkillResolver(builtInDir, '', '');
    const skills = await resolver.resolve('adapt');
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('stages/adapt.md');
  });

  test('resolve("unknown") returns empty array for unknown stage', async () => {
    await writeSkill(builtInDir, 'stages/draft.md');
    const resolver = new SkillResolver(builtInDir, '', '');
    const skills = await resolver.resolve('unknown');
    expect(skills).toEqual([]);
  });

  test('resolve("adapt", "nonexistent") returns only stages/adapt.md', async () => {
    await writeSkill(builtInDir, 'stages/adapt.md');
    const resolver = new SkillResolver(builtInDir, '', '');
    const skills = await resolver.resolve('adapt', 'nonexistent');
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('stages/adapt.md');
  });

  test('resolve with empty built-in dir returns only workspace/project skills', async () => {
    await writeSkill(path.join(projectDir, 'skills'), 'stages/draft.md', '# Project');
    const resolver = new SkillResolver('', '', projectDir);
    const skills = await resolver.resolve('draft');
    expect(skills).toHaveLength(1);
    expect(skills[0].source).toBe('project');
  });

  test('resolve with all dirs empty returns empty array', async () => {
    const resolver = new SkillResolver('', '', '');
    const skills = await resolver.resolve('draft');
    expect(skills).toEqual([]);
  });
});

// --- T04: listAll() + readSkillContent() ---

describe('SkillResolver.listAll', () => {
  test('returns skills from all three layers without deduplication', async () => {
    await writeSkill(builtInDir, 'stages/draft.md', '# Built-in');
    await writeSkill(path.join(workspaceDir, 'skills'), 'stages/draft.md', '# Workspace');
    await writeSkill(path.join(projectDir, 'skills'), 'stages/draft.md', '# Project');
    const resolver = new SkillResolver(builtInDir, workspaceDir, projectDir);
    const all = await resolver.listAll();
    // All three layers should appear
    expect(all.filter(s => s.name === 'stages/draft.md')).toHaveLength(3);
    // Order: project first, workspace second, built-in last
    expect(all[0].source).toBe('project');
    expect(all[1].source).toBe('workspace');
    expect(all[2].source).toBe('built-in');
  });

  test('returns empty array when no skill directories exist', async () => {
    const resolver = new SkillResolver('/nonexistent', '/also-nonexistent', '/nope');
    const all = await resolver.listAll();
    expect(all).toEqual([]);
  });
});

describe('SkillResolver.readSkillContent', () => {
  test('returns file content for valid skill', async () => {
    await writeSkill(builtInDir, 'stages/draft.md', '# My Draft Skill\n\nContent here.');
    const skill: ResolvedSkill = {
      name: 'stages/draft.md',
      path: path.join(builtInDir, 'stages/draft.md'),
      source: 'built-in',
    };
    const resolver = new SkillResolver(builtInDir, '', '');
    const content = await resolver.readSkillContent(skill);
    expect(content).toBe('# My Draft Skill\n\nContent here.');
  });

  test('returns empty string for unreadable file', async () => {
    const skill: ResolvedSkill = {
      name: 'stages/missing.md',
      path: '/nonexistent/path/stages/missing.md',
      source: 'built-in',
    };
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const resolver = new SkillResolver('', '', '');
    const content = await resolver.readSkillContent(skill);
    expect(content).toBe('');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Could not read skill file'));
    spy.mockRestore();
  });

  test('truncates content exceeding 100K characters', async () => {
    const longContent = 'A'.repeat(150_000);
    await writeSkill(builtInDir, 'stages/big.md', longContent);
    const skill: ResolvedSkill = {
      name: 'stages/big.md',
      path: path.join(builtInDir, 'stages/big.md'),
      source: 'built-in',
    };
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const resolver = new SkillResolver(builtInDir, '', '');
    const content = await resolver.readSkillContent(skill);
    expect(content.length).toBe(100_000);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('truncating'));
    spy.mockRestore();
  });
});

describe('Cascade shadowing', () => {
  test('skill at project layer shadows same at workspace in resolve()', async () => {
    await writeSkill(path.join(workspaceDir, 'skills'), 'stages/draft.md', '# Workspace');
    await writeSkill(path.join(projectDir, 'skills'), 'stages/draft.md', '# Project');
    const resolver = new SkillResolver('', workspaceDir, projectDir);
    const skills = await resolver.resolve('draft');
    expect(skills[0].source).toBe('project');
  });

  test('skill at workspace layer shadows same at built-in in resolve()', async () => {
    await writeSkill(builtInDir, 'stages/draft.md', '# Built-in');
    await writeSkill(path.join(workspaceDir, 'skills'), 'stages/draft.md', '# Workspace');
    const resolver = new SkillResolver(builtInDir, workspaceDir, '');
    const skills = await resolver.resolve('draft');
    expect(skills[0].source).toBe('workspace');
  });
});
