import { parseJsonLine } from './utils.js';

export interface CodexParseResult {
  sessionId: string | null;
  summary: string;
  usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number };
  errorMessage: string | null;
}

export function parseCodexJsonl(stdout: string): CodexParseResult {
  let sessionId: string | null = null;
  let errorMessage: string | null = null;
  const messages: string[] = [];
  const usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };

  for (const line of stdout.split(/\r?\n/)) {
    const event = parseJsonLine(line);
    if (!event) continue;

    const type = String(event.type ?? '');

    if (type === 'thread.started') {
      sessionId = typeof event.thread_id === 'string' ? event.thread_id : sessionId;
    } else if (type === 'item.completed') {
      const item = event.item as Record<string, unknown> | undefined;
      if (item && item.type === 'agent_message' && typeof item.text === 'string') {
        messages.push(item.text);
      }
    } else if (type === 'turn.completed') {
      const u = (event.usage ?? event) as Record<string, unknown>;
      usage.inputTokens += asNum(u.input_tokens);
      usage.cachedInputTokens += asNum(u.cached_input_tokens);
      usage.outputTokens += asNum(u.output_tokens);
    } else if (type === 'error') {
      errorMessage = typeof event.message === 'string' ? event.message : errorMessage;
    } else if (type === 'turn.failed') {
      const err = event.error as Record<string, unknown> | undefined;
      if (err && typeof err.message === 'string') {
        errorMessage = err.message;
      }
    }
  }

  return { sessionId, summary: messages.join('\n\n'), usage, errorMessage };
}

export function isCodexUnknownSessionError(stdout: string, stderr: string): boolean {
  const combined = `${stdout}\n${stderr}`;
  return /unknown (session|thread)|session .* not found|thread .* not found/i.test(combined);
}

function asNum(v: unknown): number {
  return typeof v === 'number' ? v : 0;
}
