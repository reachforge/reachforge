import { parseJsonLine, extractAllErrorText } from './utils.js';

export interface ClaudeParseResult {
  sessionId: string | null;
  model: string;
  costUsd: number | null;
  usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number } | null;
  summary: string;
  resultJson: Record<string, unknown> | null;
}

export function parseClaudeStreamJson(stdout: string): ClaudeParseResult {
  let sessionId: string | null = null;
  let model = '';
  let costUsd: number | null = null;
  let usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number } | null = null;
  let resultJson: Record<string, unknown> | null = null;
  const textBlocks: string[] = [];

  for (const line of stdout.split(/\r?\n/)) {
    const event = parseJsonLine(line);
    if (!event) continue;

    const type = String(event.type ?? '');
    const subtype = String(event.subtype ?? '');

    if (type === 'system' && subtype === 'init') {
      sessionId = asString(event.session_id) ?? sessionId;
      model = asString(event.model) ?? model;
    } else if (type === 'assistant') {
      sessionId = asString(event.session_id) ?? sessionId;
      const message = event.message as Record<string, unknown> | undefined;
      if (message && Array.isArray(message.content)) {
        for (const block of message.content) {
          const b = block as Record<string, unknown>;
          if (b.type === 'text' && typeof b.text === 'string') {
            textBlocks.push(b.text);
          }
        }
      }
    } else if (type === 'result') {
      sessionId = asString(event.session_id) ?? sessionId;
      resultJson = event;

      const u = event.usage as Record<string, unknown> | undefined;
      if (u) {
        usage = {
          inputTokens: asNumber(u.input_tokens),
          cachedInputTokens: asNumber(u.cache_read_input_tokens),
          outputTokens: asNumber(u.output_tokens),
        };
      }

      costUsd = typeof event.total_cost_usd === 'number' ? event.total_cost_usd : costUsd;

      if (typeof event.result === 'string' && !textBlocks.length) {
        textBlocks.push(event.result);
      }
    }
  }

  return {
    sessionId,
    model,
    costUsd,
    usage,
    summary: textBlocks.join('\n\n'),
    resultJson,
  };
}

const CLAUDE_AUTH_RE = /(?:not\s+logged\s+in|please\s+log\s+in|login\s+required|unauthorized|authentication\s+required)/i;

export function detectClaudeAuthRequired(stdout: string, stderr: string): boolean {
  return CLAUDE_AUTH_RE.test(stdout) || CLAUDE_AUTH_RE.test(stderr);
}

export function isClaudeUnknownSessionError(resultJson: Record<string, unknown>): boolean {
  return /no conversation found with session id|unknown session|session .* not found/i.test(
    extractAllErrorText(resultJson),
  );
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function asNumber(v: unknown): number {
  return typeof v === 'number' ? v : 0;
}
