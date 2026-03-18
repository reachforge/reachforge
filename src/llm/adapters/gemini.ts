import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { CLIAdapter, AdapterExecuteOptions, AdapterResult, AdapterProbeResult, AdapterErrorCode } from '../types.js';
import { runCLIProcess } from '../process.js';
import { parseGeminiJsonl, detectGeminiAuthRequired, isGeminiUnknownSessionError } from '../parsers/gemini.js';

export class GeminiAdapter implements CLIAdapter {
  readonly name = 'gemini' as const;
  readonly command: string;

  constructor(command: string = 'gemini') {
    this.command = command;
  }

  async execute(options: AdapterExecuteOptions): Promise<AdapterResult> {
    // Inject skills via symlink to ~/.gemini/skills/
    const skillsHome = path.join(os.homedir(), '.gemini', 'skills');
    await fs.mkdir(skillsHome, { recursive: true });
    for (const skillPath of options.skillPaths) {
      const target = path.join(skillsHome, path.basename(skillPath));
      try {
        const existing = await fs.readlink(target).catch(() => null);
        if (existing === skillPath) continue; // already correct
        if (existing !== null) continue; // exists but points elsewhere — don't overwrite
        await fs.symlink(skillPath, target);
      } catch {
        // skip if symlink fails (e.g., file exists as non-symlink)
      }
    }

    const result = await this.runAttempt(options, options.sessionId);

    // Handle session expiry
    if (
      options.sessionId &&
      result.proc.exitCode !== 0 &&
      isGeminiUnknownSessionError(result.proc.stdout, result.proc.stderr)
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
    const args = ['--output-format', 'stream-json', '--approval-mode', 'yolo', '--sandbox=none'];
    if (sessionId) args.push('--resume', sessionId);
    args.push(...options.extraArgs);
    args.push(options.prompt); // prompt as final positional argument

    const env = { ...process.env } as Record<string, string>;

    const proc = await runCLIProcess({
      command: this.command,
      args,
      cwd: options.cwd,
      env,
      // no stdin — prompt is positional
      timeoutSec: options.timeoutSec,
    });

    const parsed = parseGeminiJsonl(proc.stdout);
    const authRequired = detectGeminiAuthRequired(proc.stdout, proc.stderr);

    return { proc, parsed, authRequired };
  }

  private buildResult(
    attempt: { proc: Awaited<ReturnType<typeof runCLIProcess>>; parsed: ReturnType<typeof parseGeminiJsonl>; authRequired: boolean },
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
      usage: { inputTokens: parsed.usage.inputTokens, outputTokens: parsed.usage.outputTokens, cachedTokens: parsed.usage.cachedInputTokens },
      costUsd: parsed.costUsd,
      model: 'gemini',
      errorMessage: proc.exitCode === 0 ? null : (parsed.errorMessage || proc.stderr.trim() || null),
      errorCode,
      exitCode: proc.exitCode,
      timedOut: proc.timedOut,
    };
  }
}
