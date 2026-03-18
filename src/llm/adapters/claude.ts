import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { CLIAdapter, AdapterExecuteOptions, AdapterResult, AdapterProbeResult, AdapterErrorCode } from '../types.js';
import { runCLIProcess } from '../process.js';
import { parseClaudeStreamJson, detectClaudeAuthRequired, isClaudeUnknownSessionError } from '../parsers/claude.js';

export class ClaudeAdapter implements CLIAdapter {
  readonly name = 'claude' as const;
  readonly command: string;

  constructor(command: string = 'claude') {
    this.command = command;
  }

  async execute(options: AdapterExecuteOptions): Promise<AdapterResult> {
    let skillsDir: string | null = null;

    try {
      // Build temp skills directory
      skillsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aphype-skills-'));
      const claudeSkillsDir = path.join(skillsDir, '.claude', 'skills');
      await fs.mkdir(claudeSkillsDir, { recursive: true });

      // Copy skill files into temp dir
      for (const skillPath of options.skillPaths) {
        const content = await fs.readFile(skillPath, 'utf-8');
        await fs.writeFile(path.join(claudeSkillsDir, path.basename(skillPath)), content);
      }

      const result = await this.runAttempt(options, skillsDir, options.sessionId);

      // Handle session expiry — retry without resume
      if (
        options.sessionId &&
        result.exitCode !== 0 &&
        isClaudeUnknownSessionError(result.parsed.resultJson ?? {})
      ) {
        const retry = await this.runAttempt(options, skillsDir, null);
        return this.buildResult(retry, 'session_expired');
      }

      return this.buildResult(result, null);
    } finally {
      if (skillsDir) {
        fs.rm(skillsDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  }

  async probe(): Promise<AdapterProbeResult> {
    try {
      const versionResult = await runCLIProcess({
        command: this.command,
        args: ['--version'],
        cwd: os.tmpdir(),
        env: { ...process.env } as Record<string, string>,
        timeoutSec: 10,
      });

      if (versionResult.exitCode !== 0 && !versionResult.stdout.trim()) {
        return { available: false, authenticated: false, version: null, errorMessage: 'not installed' };
      }

      const version = versionResult.stdout.trim().split('\n')[0] || null;

      const helloResult = await runCLIProcess({
        command: this.command,
        args: ['--print', '-', '--output-format', 'stream-json', '--max-turns', '1'],
        cwd: os.tmpdir(),
        env: { ...process.env } as Record<string, string>,
        stdin: 'Say hello',
        timeoutSec: 30,
      });

      if (detectClaudeAuthRequired(helloResult.stdout, helloResult.stderr)) {
        return { available: true, authenticated: false, version, errorMessage: 'authentication required' };
      }

      return { available: true, authenticated: true, version, errorMessage: null };
    } catch {
      return { available: false, authenticated: false, version: null, errorMessage: 'not installed' };
    }
  }

  private async runAttempt(
    options: AdapterExecuteOptions,
    skillsDir: string,
    sessionId: string | null,
  ) {
    const args = ['--print', '-', '--output-format', 'stream-json', '--verbose',
                  '--dangerously-skip-permissions'];
    if (sessionId) args.push('--resume', sessionId);
    args.push('--add-dir', skillsDir);
    args.push(...options.extraArgs);

    const env = { ...process.env } as Record<string, string>;
    for (const key of ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_SESSION', 'CLAUDE_CODE_PARENT_SESSION']) {
      delete env[key];
    }

    const proc = await runCLIProcess({
      command: this.command,
      args,
      cwd: options.cwd,
      env,
      stdin: options.prompt,
      timeoutSec: options.timeoutSec,
    });

    const parsed = parseClaudeStreamJson(proc.stdout);
    const authRequired = detectClaudeAuthRequired(proc.stdout, proc.stderr);

    return { proc, parsed, authRequired };
  }

  private buildResult(
    attempt: { proc: Awaited<ReturnType<typeof runCLIProcess>>; parsed: ReturnType<typeof parseClaudeStreamJson>; authRequired: boolean },
    overrideErrorCode: AdapterErrorCode | null,
  ): AdapterResult {
    const { proc, parsed, authRequired } = attempt;

    let errorCode: AdapterErrorCode | null = overrideErrorCode;
    if (!errorCode) {
      if (proc.timedOut) errorCode = 'timeout';
      else if (authRequired) errorCode = 'auth_required';
      else if (proc.exitCode !== 0 && proc.exitCode !== null) errorCode = 'unknown';
    }

    return {
      success: proc.exitCode === 0 && parsed.summary.length > 0,
      content: parsed.summary,
      sessionId: parsed.sessionId,
      usage: parsed.usage
        ? { inputTokens: parsed.usage.inputTokens, outputTokens: parsed.usage.outputTokens, cachedTokens: parsed.usage.cachedInputTokens }
        : { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
      costUsd: parsed.costUsd,
      model: parsed.model || 'unknown',
      errorMessage: proc.exitCode === 0 ? null : (proc.stderr.trim() || parsed.summary || null),
      errorCode,
      exitCode: proc.exitCode,
      timedOut: proc.timedOut,
    };
  }
}
