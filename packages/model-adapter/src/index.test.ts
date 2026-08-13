import { describe, it, expect, vi } from 'vitest';
import {
  createAdapter,
  parseModelClass,
  UnsupportedCapabilityError,
  type GenerateTextRequest,
} from './index.js';

// ---------------------------------------------------------------------------
// parseModelClass
// ---------------------------------------------------------------------------

describe('parseModelClass', () => {
  it('parses provider/model format', () => {
    expect(parseModelClass('openai/gpt-5.2-high')).toEqual({
      provider: 'openai',
      modelId: 'gpt-5.2-high',
    });
  });

  it('parses simple model id with no slash', () => {
    expect(parseModelClass('some-model')).toEqual({
      provider: 'unknown',
      modelId: 'some-model',
    });
  });

  it('parses anthropic model', () => {
    expect(parseModelClass('anthropic/claude-sonnet-4.5')).toEqual({
      provider: 'anthropic',
      modelId: 'claude-sonnet-4.5',
    });
  });

  it('parses google model', () => {
    expect(parseModelClass('google/gemini-2.5-pro')).toEqual({
      provider: 'google',
      modelId: 'gemini-2.5-pro',
    });
  });

  it('parses vllm model', () => {
    expect(parseModelClass('vllm/qwen2.5-72b')).toEqual({
      provider: 'vllm',
      modelId: 'qwen2.5-72b',
    });
  });
});

// ---------------------------------------------------------------------------
// createAdapter
// ---------------------------------------------------------------------------

describe('createAdapter', () => {
  it('throws for unknown provider', () => {
    expect(() => createAdapter('unknown/model')).toThrow('No adapter for provider');
  });

  it('creates OpenAI adapter', () => {
    const adapter = createAdapter('openai/gpt-5.2-high');
    expect(adapter.id).toBe('openai-openai-gpt-5.2-high');
    expect(adapter.capabilities).toContain('text');
    expect(adapter.capabilities).toContain('json-mode');
  });

  it('creates Anthropic adapter', () => {
    const adapter = createAdapter('anthropic/claude-sonnet-4.5');
    expect(adapter.id).toBe('anthropic-anthropic-claude-sonnet-4.5');
    expect(adapter.capabilities).toContain('text');
  });

  it('creates Google adapter', () => {
    const adapter = createAdapter('google/gemini-2.5-pro');
    expect(adapter.id).toBe('google-google-gemini-2.5-pro');
    expect(adapter.capabilities).toContain('text');
  });

  it('creates VLLM adapter', () => {
    const adapter = createAdapter('vllm/qwen2.5-72b');
    expect(adapter.id).toBe('vllm-vllm-qwen2.5-72b');
    expect(adapter.capabilities).toContain('text');
  });

  it('passes opts to adapter', () => {
    const mockFetch = vi.fn();
    const adapter = createAdapter('openai/gpt-5.2-high', {
      fetchImpl: mockFetch as unknown as typeof fetch,
      apiKey: 'test-key',
    });
    expect(adapter.id).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// OpenAI adapter — generateText with mocked fetch
// ---------------------------------------------------------------------------

describe('OpenAIAdapter generateText', () => {
  function createMockSSE(events: Array<Record<string, unknown>>): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    const lines: string[] = [];
    for (const evt of events) {
      lines.push(`data: ${JSON.stringify(evt)}\n`);
    }
    lines.push('data: [DONE]\n');
    return new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(lines.join('')));
        controller.close();
      },
    });
  }

  function makeRes(body: ReadableStream<Uint8Array>, status = 200): Response {
    return new Response(body, {
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  it('streams deltas from OpenAI SSE', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeRes(
        createMockSSE([
          {
            choices: [{ delta: { content: 'Hello' }, finish_reason: null }],
          },
          {
            choices: [{ delta: { content: ' world' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          },
        ]),
      ),
    );

    const adapter = createAdapter('openai/gpt-5.2', {
      fetchImpl: mockFetch as unknown as typeof fetch,
      apiKey: 'test-key',
    });

    const req: GenerateTextRequest = {
      model: 'openai/gpt-5.2',
      messages: [{ role: 'user', content: 'Hi' }],
    };

    const deltas: string[] = [];
    for await (const delta of adapter.generateText(req)) {
      deltas.push(delta.text);
    }

    expect(deltas).toEqual(['Hello', ' world']);

    // Assert request was correctly shaped
    const [, init] = mockFetch.mock.calls[0]!;
    const body = JSON.parse(init!.body as string) as Record<string, unknown>;
    expect(body['model']).toBe('gpt-5.2');
    expect(body['stream']).toBe(true);
    expect(body['messages']).toEqual([{ role: 'user', content: 'Hi' }]);

    // Assert headers
    const headers = init!.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-key');
  });

  it('handles finish reason and usage', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeRes(
        createMockSSE([
          {
            choices: [{ delta: { content: 'Done' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 5, completion_tokens: 3 },
          },
        ]),
      ),
    );

    const adapter = createAdapter('openai/gpt-5.2', {
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const deltas: Array<{
      text: string;
      finishReason?: string;
      usage?: { inputTokens: number; outputTokens: number };
    }> = [];
    for await (const delta of adapter.generateText({
      model: 'openai/gpt-5.2',
      messages: [{ role: 'user', content: 'Go' }],
    })) {
      deltas.push(delta);
    }

    expect(deltas).toHaveLength(1);
    expect(deltas[0]!['text']).toBe('Done');
    expect(deltas[0]!['finishReason']).toBe('stop');
    expect(deltas[0]!['usage']).toEqual({ inputTokens: 5, outputTokens: 3 });
  });
});

// ---------------------------------------------------------------------------
// VLLM adapter — baseURL
// ---------------------------------------------------------------------------

describe('VLLMAdapter', () => {
  it('uses custom baseURL', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n'));
            controller.close();
          },
        }),
        { status: 200, statusText: 'OK' },
      ),
    );

    const adapter = createAdapter('vllm/qwen2.5-72b', {
      fetchImpl: mockFetch as unknown as typeof fetch,
      baseURL: 'http://my-vllm:8000/v1',
    });

    const gen = adapter.generateText({
      model: 'vllm/qwen2.5-72b',
      messages: [{ role: 'user', content: 'Hi' }],
    });
    // consume the iterator
    for await (const _ of gen) {
      void _;
    }

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toBe('http://my-vllm:8000/v1/chat/completions');
  });

  it('has correct capabilities (text only)', () => {
    const adapter = createAdapter('vllm/qwen2.5-72b');
    expect(adapter.capabilities).toEqual(['text']);
  });
});

// ---------------------------------------------------------------------------
// Embed request shape
// ---------------------------------------------------------------------------

describe('OpenAIAdapter embed', () => {
  it('sends correct request shape', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
        }),
        { status: 200, statusText: 'OK' },
      ),
    );

    const adapter = createAdapter('openai/gpt-5.2', {
      fetchImpl: mockFetch as unknown as typeof fetch,
      apiKey: 'test-key',
    });

    const result = await adapter.embed({
      model: 'openai/gpt-5.2',
      input: 'Hello world',
    });

    expect(result.embedding).toEqual([0.1, 0.2, 0.3]);

    const [, init] = mockFetch.mock.calls[0]!;
    const body = JSON.parse(init!.body as string) as Record<string, unknown>;
    expect(body['model']).toBe('text-embedding-3-small');
    expect(body['input']).toEqual(['Hello world']);
  });
});

// ---------------------------------------------------------------------------
// UnsupportedCapabilityError
// ---------------------------------------------------------------------------

describe('UnsupportedCapabilityError', () => {
  it('has correct name and message', () => {
    const err = new UnsupportedCapabilityError('speech', 'openai-gpt-5.2');
    expect(err.name).toBe('UnsupportedCapabilityError');
    expect(err.capability).toBe('speech');
    expect(err.adapterId).toBe('openai-gpt-5.2');
    expect(err.message).toContain('speech');
    expect(err.message).toContain('openai-gpt-5.2');
  });
});

// ---------------------------------------------------------------------------
// Unsupported capabilities throw
// ---------------------------------------------------------------------------

describe('Unsupported capabilities', () => {
  it('OpenAI adapter throws for unsupported generateSpeech', async () => {
    const adapter = createAdapter('openai/gpt-5.2');
    expect(() => adapter.generateSpeech?.({ text: 'hello' })).toThrow(UnsupportedCapabilityError);
  });

  it('Anthropic adapter throws for image generation', async () => {
    const adapter = createAdapter('anthropic/claude-sonnet-4.5');
    await expect(adapter.generateImage({ prompt: 'test' })).rejects.toThrow(
      UnsupportedCapabilityError,
    );
  });

  it('Google adapter throws for embed', async () => {
    const adapter = createAdapter('google/gemini-2.5-pro');
    await expect(adapter.embed({ input: 'test' })).rejects.toThrow(UnsupportedCapabilityError);
  });

  it('VLLM adapter throws for image generation', async () => {
    const adapter = createAdapter('vllm/qwen2.5-72b');
    await expect(adapter.generateImage({ prompt: 'test' })).rejects.toThrow(
      UnsupportedCapabilityError,
    );
  });
});
