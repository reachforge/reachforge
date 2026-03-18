import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { CLIAdapter, AdapterExecuteOptions, AdapterResult, AdapterProbeResult, AdapterErrorCode } from '../types.js';
import { runCLIProcess } from '../process.js';
import { parseCodexJsonl, isCodexUnknownSessionError } from '../parsers/codex.js';

export class CodexAdapter implements CLIAdapter {
  readonly name = 'codex' as const;
  readonly command: string;

  constructor(command: string = 'codex') {
    this.command = command;
  }

  async execute(options: AdapterExecuteOptions): Promise<AdapterResult> {
    // Inject skills via symlink to ~/.codex/skills/
    const skillsHome = path.join(os.homedir(), '.codex', 'skills');
    await fs.mkdir(skillsHome, { recursive: true });
    for (const skillPath of options.skillPaths) {
      const target = path.join(skillsHome, path.basename(skillPath));
      try {
        const existing = await fs.readlink(target).catch(() => null);
        if (existing === skillPath) continue;
        if (existing !== null) continue;
        await fs.symlink(skillPath, target);
      } catch {
        // skip
      }
    }

    const result = await this.runAttempt(options, options.sessionId);

    // Handle session expiry
    if (
      options.sessionId &&
      result.proc.exitCode !== 0 &&
      isCodexUnknownSessionError(result.proc.stdout, result.proc.stderr)
    ) {
      const retry = await this.runAttempt(options, null);
      return this.buildResult(retry, 'session_expired');
    }

    return this.buildResult(result, null);
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
      return { available: true, authenticated: true, version, errorMessage: null };
    } catch {
      return { available: false, authenticated: false, version: null, errorMessage: 'not installed' };
    }
  }

  private async runAttempt(options: AdapterExecuteOptions, sessionId: string | null) {
    const args = ['exec', '--json', '--dangerously-bypass-approvals-and-sandbox'];
    args.push(...options.extraArgs);
    if (sessionId) {
      args.push('resume', sessionId, '-');
    } else {
      args.push('-');
    }

    const env = { ...process.env } as Record<string, string>;

    const proc = await runCLIProcess({
      command: this.command,
      args,
      cwd: options.cwd,
      env,
      stdin: options.prompt,
      timeoutSec: options.timeoutSec,
    });

    const parsed = parseCodexJsonl(proc.stdout);

    return { proc, parsed };
  }

  private buildResult(
    attempt: { proc: Awaited<ReturnType<typeof runCLIProcess>>; parsed: ReturnType<typeof parseCodexJsonl> },
    overrideErrorCode: AdapterErrorCode | null,
  ): AdapterResult {
    const { proc, parsed } = attempt;

    let errorCode: AdapterErrorCode | null = overrideErrorCode;
    if (!errorCode) {
      if (proc.timedOut) errorCode = 'timeout';
      else if (proc.exitCode !== 0 && proc.exitCode !== null) errorCode = 'unknown';
    }

    return {
      success: proc.exitCode === 0 && parsed.summary.length > 0,
      content: parsed.summary,
      sessionId: parsed.sessionId,
      usage: parsed.usage,
      costUsd: null, // Codex does not report cost
      model: 'codex',
      errorMessage: proc.exitCode === 0 ? null : (parsed.errorMessage || proc.stderr.trim() || null),
      errorCode,
      exitCode: proc.exitCode,
      timedOut: proc.timedOut,
    };
  }
}
