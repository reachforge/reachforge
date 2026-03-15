import { ProviderError } from '../types/index.js';

export interface HttpOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

export interface HttpResponse {
  status: number;
  ok: boolean;
  body: string;
  json<T = unknown>(): T;
}

const DEFAULT_TIMEOUT = 30000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY = 1000;

export async function httpRequest(url: string, options: HttpOptions = {}): Promise<HttpResponse> {
  const {
    method = 'GET',
    headers = {},
    body,
    timeout = DEFAULT_TIMEOUT,
    retries = DEFAULT_RETRIES,
    retryDelay = DEFAULT_RETRY_DELAY,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timer);

      const text = await response.text();

      return {
        status: response.status,
        ok: response.ok,
        body: text,
        json<T>(): T {
          return JSON.parse(text) as T;
        },
      };
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
      }
    }
  }

  throw new ProviderError('http', `Request to ${url} failed after ${retries + 1} attempts: ${lastError?.message}`);
}
