import { describe, test, expect, vi, afterEach } from 'vitest';
import { httpRequest } from '../../../src/utils/http.js';
import { ProviderError } from '../../../src/types/index.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

afterEach(() => {
  mockFetch.mockReset();
});

describe('httpRequest', () => {
  test('makes a successful GET request', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => '{"data":"hello"}',
    });

    const response = await httpRequest('https://api.example.com/test');
    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
    expect(response.json()).toEqual({ data: 'hello' });
  });

  test('makes a POST request with body and headers', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      text: async () => '{"id":"123"}',
    });

    const response = await httpRequest('https://api.example.com/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': 'test' },
      body: JSON.stringify({ title: 'Test' }),
    });

    expect(response.status).toBe(201);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/posts',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': 'test' },
        body: '{"title":"Test"}',
      }),
    );
  });

  test('returns non-ok responses without throwing', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      text: async () => '{"error":"validation failed"}',
    });

    const response = await httpRequest('https://api.example.com/bad', { retries: 0 });
    expect(response.ok).toBe(false);
    expect(response.status).toBe(422);
  });

  test('retries on network failure', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '"ok"',
      });

    const response = await httpRequest('https://api.example.com/flaky', {
      retries: 2,
      retryDelay: 1, // 1ms for fast tests
    });

    expect(response.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  test('throws ProviderError after all retries exhausted', async () => {
    mockFetch.mockRejectedValue(new Error('Connection refused'));

    await expect(
      httpRequest('https://api.example.com/down', { retries: 1, retryDelay: 1 })
    ).rejects.toThrow(ProviderError);
  });

  test('throws ProviderError with attempt count in message', async () => {
    mockFetch.mockRejectedValue(new Error('Timeout'));

    try {
      await httpRequest('https://api.example.com/slow', { retries: 2, retryDelay: 1 });
    } catch (err: any) {
      expect(err.message).toContain('3 attempts');
      expect(err.message).toContain('Timeout');
    }
  });
});
