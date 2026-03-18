import { parseJsonLine } from './utils.js';

export interface GeminiParseResult {
  sessionId: string | null;
  summary: string;
  usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number };
  costUsd: number | null;
  errorMessage: string | null;
  resultEvent: Record<string, unknown> | null;
}

export function parseGeminiJsonl(stdout: string): GeminiParseResult {
  let sessionId: string | null = null;
  let costUsd: number | null = null;
  let errorMessage: string | null = null;
  let resultEvent: Record<string, unknown> | null = null;
  const messages: string[] = [];
  const usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };

  for (const line of stdout.split(/\r?\n/)) {
    const event = parseJsonLine(line);
    if (!event) continue;

    // Extract session ID from any event
    sessionId = extractSessionId(event) ?? sessionId;

    const type = String(event.type ?? '');
    const subtype = String(event.subtype ?? '');

    if (type === 'assistant') {
      const message = event.message as Record<string, unknown> | undefined;
      if (message && Array.isArray(message.content)) {
        for (const block of message.content) {
          const b = block as Record<string, unknown>;
          if (typeof b.text === 'string') messages.push(b.text);
        }
      }
    } else if (type === 'text') {
      const part = event.part as Record<string, unknown> | undefined;
      if (part && typeof part.text === 'string') messages.push(part.text);
      else if (typeof event.text === 'string') messages.push(event.text);
    } else if (type === 'result') {
      resultEvent = event;
      accumulateUsage(usage, event);
      costUsd = extractCost(event) ?? costUsd;
    } else if (type === 'step_finish' || event.usageMetadata || event.usage) {
      accumulateUsage(usage, event);
    } else if (type === 'error' || (type === 'system' && subtype === 'error')) {
      errorMessage = typeof event.message === 'string' ? event.message
        : typeof event.error === 'string' ? event.error
        : errorMessage;
    }
  }

  return { sessionId, summary: messages.join('\n\n'), usage, costUsd, errorMessage, resultEvent };
}

const GEMINI_AUTH_RE = /(?:not\s+authenticated|api[_ ]?key\s+(?:required|missing|invalid)|unauthorized|not\s+logged\s+in|run\s+`?gemini\s+auth)/i;

export function detectGeminiAuthRequired(stdout: string, stderr: string): boolean {
  return GEMINI_AUTH_RE.test(stdout) || GEMINI_AUTH_RE.test(stderr);
}

export function isGeminiUnknownSessionError(stdout: string, stderr: string): boolean {
  const combined = `${stdout}\n${stderr}`;
  return /unknown\s+session|session\s+.*\s+not\s+found|cannot\s+resume|failed\s+to\s+resume/i.test(combined);
}

function extractSessionId(event: Record<string, unknown>): string | null {
  for (const key of ['session_id', 'sessionId', 'checkpoint_id', 'thread_id']) {
    if (typeof event[key] === 'string' && (event[key] as string).length > 0) {
      return event[key] as string;
    }
  }
  return null;
}

function accumulateUsage(
  target: { inputTokens: number; cachedInputTokens: number; outputTokens: number },
  event: Record<string, unknown>,
): void {
  const source = (event.usageMetadata ?? event.usage ?? event) as Record<string, unknown>;
  target.inputTokens += asNum(source.input_tokens, asNum(source.inputTokens, asNum(source.promptTokenCount, 0)));
  target.cachedInputTokens += asNum(source.cached_input_tokens, asNum(source.cachedInputTokens, asNum(source.cachedContentTokenCount, 0)));
  target.outputTokens += asNum(source.output_tokens, asNum(source.outputTokens, asNum(source.candidatesTokenCount, 0)));
}

function extractCost(event: Record<string, unknown>): number | null {
  for (const key of ['total_cost_usd', 'cost_usd', 'cost']) {
    if (typeof event[key] === 'number') return event[key] as number;
  }
  return null;
}

function asNum(v: unknown, fallback: number = 0): number {
  return typeof v === 'number' ? v : fallback;
}
