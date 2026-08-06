/**
 * Domio model adapter SDK — multi-provider text, image, embed adapters.
 *
 * The canonical ModelAdapter interface per docs/ai-copilot.md §4.3.
 * Each provider is wrapped in an adapter that handles auth, streaming, and
 * request shaping. All network calls go through an injectable fetch so tests
 * can mock without real network access.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Capability a model or adapter can handle. */
export type Capability = 'text' | 'vision' | 'json-mode' | 'tools';

/**
 * Model class string, e.g. 'openai/gpt-5.2-high'.
 * Providers are identified by the prefix before the first '/'.
 */
export type ModelClass = string;

/** Chat message role. */
export type MessageRole = 'system' | 'user' | 'assistant';

/** Single chat message. */
export interface Message {
  role: MessageRole;
  content: string;
}

/** Request for text generation. */
export interface GenerateTextRequest {
  model: string;
  messages: Message[];
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
}

/** Streaming delta emitted by generateText. */
export interface Delta {
  text: string;
  finishReason?: 'stop' | 'length' | 'error';
  usage?: { inputTokens: number; outputTokens: number };
}

/** Image generation request. */
export interface GenerateImageRequest {
  model?: string;
  prompt: string;
  n?: number;
  size?: string;
  style?: string;
}

/** Provenance metadata returned with generated images. */
export interface ImageProvenance {
  provider: string;
  model: string;
  prompt: string;
  moderationVerdict: string;
}

/** Result of image generation. */
export interface GenerateImageResult {
  url: string;
  provenance: ImageProvenance;
}

/** Embedding request. */
export interface EmbedRequest {
  model?: string;
  input: string | string[];
}

/** Embedding result. */
export interface EmbedResult {
  embedding: number[];
}

/** Vision request (stub). */
export interface GenerateVisionRequest {
  model?: string;
  prompt: string;
  imageUrl?: string;
}

/** Vision result (stub). */
export interface GenerateVisionResult {
  description: string;
}

/** Speech request (stub). */
export interface GenerateSpeechRequest {
  model?: string;
  text: string;
  voice?: string;
}

/** Speech result (stub). */
export interface GenerateSpeechResult {
  audioUrl: string;
}

/** Transcribe request (stub). */
export interface TranscribeRequest {
  model?: string;
  audioUrl: string;
  language?: string;
}

/** Transcribe result (stub). */
export interface TranscribeResult {
  text: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Thrown when a capability is requested but not supported by the adapter. */
export class UnsupportedCapabilityError extends Error {
  constructor(
    public readonly capability: string,
    public readonly adapterId: string,
  ) {
    super(
      `Adapter "${adapterId}" does not support capability "${capability}". ` +
        `Supported capabilities vary per provider.`,
    );
    this.name = 'UnsupportedCapabilityError';
  }
}

// ---------------------------------------------------------------------------
// ModelAdapter interface
// ---------------------------------------------------------------------------

/**
 * Core adapter interface — every provider implements this.
 *
 * generateText + generateImage + embed are the M1/M2 implemented methods.
 * The rest throw UnsupportedCapabilityError.
 */
export interface ModelAdapter {
  /** Unique adapter identifier, e.g. "openai-gpt-5.2-high". */
  id: string;

  /** Capabilities this adapter supports. */
  capabilities: Capability[];

  /** Streaming text generation. */
  generateText(
    req: GenerateTextRequest,
    ctx?: { signal?: AbortSignal },
  ): AsyncIterable<Delta>;

  /** Image generation. */
  generateImage(
    req: GenerateImageRequest,
    ctx?: { signal?: AbortSignal },
  ): Promise<GenerateImageResult>;

  /** Embedding generation. */
  embed(
    req: EmbedRequest,
    ctx?: { signal?: AbortSignal },
  ): Promise<EmbedResult>;

  /** Vision (M1 stub — throws UnsupportedCapabilityError by default). */
  generateVision?(
    req: GenerateVisionRequest,
    ctx?: { signal?: AbortSignal },
  ): Promise<GenerateVisionResult>;

  /** Speech/TTS (M1 stub — throws UnsupportedCapabilityError by default). */
  generateSpeech?(
    req: GenerateSpeechRequest,
    ctx?: { signal?: AbortSignal },
  ): Promise<GenerateSpeechResult>;

  /** Transcribe/ASR (M1 stub — throws UnsupportedCapabilityError by default). */
  transcribe?(
    req: TranscribeRequest,
    ctx?: { signal?: AbortSignal },
  ): Promise<TranscribeResult>;
}

// ---------------------------------------------------------------------------
// Adapter options (injectable fetch + credentials)
// ---------------------------------------------------------------------------

/** Constructor options shared by all adapters. */
export interface AdapterOptions {
  /** Injectable fetch implementation (for tests). Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
  /** API key override. Falls back to env var per provider. */
  apiKey?: string;
  /** Base URL override for the provider API. */
  baseURL?: string;
}

// ---------------------------------------------------------------------------
// parseModelClass
// ---------------------------------------------------------------------------

/** Parsed model class info. */
export interface ParsedModelClass {
  provider: string;
  modelId: string;
}

/**
 * Parse a model class string into provider + modelId.
 * Format: "provider/modelId" — provider is everything before the first '/'.
 * If there is no '/', provider is 'unknown' and modelId is the full string.
 */
export function parseModelClass(model: string): ParsedModelClass {
  const idx = model.indexOf('/');
  if (idx === -1) {
    return { provider: 'unknown', modelId: model };
  }
  return {
    provider: model.slice(0, idx),
    modelId: model.slice(idx + 1),
  };
}

// ---------------------------------------------------------------------------
// createAdapter
// ---------------------------------------------------------------------------

/**
 * Factory: create the appropriate adapter for the given model class string.
 * Dispatches by provider prefix.
 */
export function createAdapter(
  model: string,
  opts?: AdapterOptions,
): ModelAdapter {
  const { provider } = parseModelClass(model);

  switch (provider) {
    case 'openai':
      return new OpenAIAdapter(model, opts);
    case 'anthropic':
      return new AnthropicAdapter(model, opts);
    case 'google':
      return new GoogleAdapter(model, opts);
    case 'vllm':
      return new VLLMAdapter(model, opts);
    default:
      throw new Error(
        `No adapter for provider "${provider}" in model "${model}". ` +
          `Supported providers: openai, anthropic, google, vllm.`,
      );
  }
}

// ---------------------------------------------------------------------------
// Helper: conditionally build init with or without signal
// ---------------------------------------------------------------------------

function fetchOpts(
  init: Omit<RequestInit, 'signal'>,
  signal?: AbortSignal,
): RequestInit {
  if (signal !== undefined) {
    return { ...init, signal };
  }
  return init;
}

// ---------------------------------------------------------------------------
// OpenAI adapter
// ---------------------------------------------------------------------------

class OpenAIAdapter implements ModelAdapter {
  readonly id: string;
  readonly capabilities: Capability[] = ['text', 'vision', 'json-mode', 'tools'];

  private readonly fetchImpl: typeof fetch;
  private readonly apiKey: string;
  private readonly baseURL: string;

  constructor(model: string, opts?: AdapterOptions) {
    this.id = `openai-${model.replace('/', '-')}`;
    this.fetchImpl = opts?.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.apiKey = opts?.apiKey ?? process.env['OPENAI_API_KEY'] ?? '';
    this.baseURL = opts?.baseURL ?? 'https://api.openai.com/v1';
  }

  async *generateText(
    req: GenerateTextRequest,
    ctx?: { signal?: AbortSignal },
  ): AsyncIterable<Delta> {
    const { modelId } = parseModelClass(req.model);
    const body = {
      model: modelId,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: req.maxTokens,
      temperature: req.temperature,
      stream: true,
      ...(req.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    };

    const res = await this.fetchImpl(
      `${this.baseURL}/chat/completions`,
      fetchOpts(
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
        },
        ctx?.signal,
      ),
    );

    if (!res.ok) {
      throw new Error(`OpenAI API error: ${res.status} ${res.statusText}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('Response body is not readable');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data) as Record<string, unknown>;
          const choices = parsed['choices'] as Array<Record<string, unknown>> | undefined;
          const choice = choices?.[0];
          if (!choice) continue;

          const delta = choice['delta'] as Record<string, unknown> | undefined;
          const finish = choice['finish_reason'] as string | undefined;

          const textContent = delta?.['content'];
          const text = typeof textContent === 'string' ? textContent : '';

          const usageRaw = parsed['usage'] as Record<string, unknown> | undefined;

          yield {
            text,
            ...(finish === 'stop' || finish === 'length' || finish === 'error'
              ? { finishReason: finish as 'stop' | 'length' | 'error' }
              : {}),
            ...(usageRaw
              ? {
                  usage: {
                    inputTokens: (usageRaw['prompt_tokens'] as number) ?? 0,
                    outputTokens: (usageRaw['completion_tokens'] as number) ?? 0,
                  },
                }
              : {}),
          };
        } catch {
          // Skip unparseable SSE lines
        }
      }
    }
  }

  async generateImage(
    req: GenerateImageRequest,
    ctx?: { signal?: AbortSignal },
  ): Promise<GenerateImageResult> {
    const body = {
      model: 'dall-e-3',
      prompt: req.prompt,
      n: req.n ?? 1,
      size: req.size ?? '1024x1024',
      ...(req.style ? { style: req.style } : {}),
    };

    const res = await this.fetchImpl(
      `${this.baseURL}/images/generations`,
      fetchOpts(
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
        },
        ctx?.signal,
      ),
    );

    if (!res.ok) {
      throw new Error(`OpenAI image API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as Record<string, unknown>;
    const dataArr = data['data'] as Array<Record<string, unknown>> | undefined;
    const first = dataArr?.[0];
    const url = (first?.['url'] as string) ?? '';

    return {
      url,
      provenance: {
        provider: 'openai',
        model: 'dall-e-3',
        prompt: req.prompt,
        moderationVerdict: 'approved',
      },
    };
  }

  async embed(
    req: EmbedRequest,
    ctx?: { signal?: AbortSignal },
  ): Promise<EmbedResult> {
    const inputs = Array.isArray(req.input) ? req.input : [req.input];
    const body = {
      model: 'text-embedding-3-small',
      input: inputs,
    };

    const res = await this.fetchImpl(
      `${this.baseURL}/embeddings`,
      fetchOpts(
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
        },
        ctx?.signal,
      ),
    );

    if (!res.ok) {
      throw new Error(`OpenAI embedding API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as Record<string, unknown>;
    const dataArr = data['data'] as Array<Record<string, unknown>> | undefined;
    const first = dataArr?.[0];
    const embedding = (first?.['embedding'] as number[]) ?? [];

    return { embedding };
  }

  generateVision(): Promise<GenerateVisionResult> {
    throw new UnsupportedCapabilityError('vision', this.id);
  }

  generateSpeech(): Promise<GenerateSpeechResult> {
    throw new UnsupportedCapabilityError('speech', this.id);
  }

  transcribe(): Promise<TranscribeResult> {
    throw new UnsupportedCapabilityError('transcribe', this.id);
  }
}

// ---------------------------------------------------------------------------
// Anthropic adapter
// ---------------------------------------------------------------------------

class AnthropicAdapter implements ModelAdapter {
  readonly id: string;
  readonly capabilities: Capability[] = ['text', 'vision', 'tools'];

  private readonly fetchImpl: typeof fetch;
  private readonly apiKey: string;
  private readonly baseURL: string;

  constructor(model: string, opts?: AdapterOptions) {
    this.id = `anthropic-${model.replace('/', '-')}`;
    this.fetchImpl = opts?.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.apiKey = opts?.apiKey ?? process.env['ANTHROPIC_API_KEY'] ?? '';
    this.baseURL = opts?.baseURL ?? 'https://api.anthropic.com/v1';
  }

  async *generateText(
    req: GenerateTextRequest,
    ctx?: { signal?: AbortSignal },
  ): AsyncIterable<Delta> {
    const { modelId } = parseModelClass(req.model);

    // Anthropic separates system prompt from messages
    const systemMsg = req.messages.find((m) => m.role === 'system');
    const nonSystem = req.messages.filter((m) => m.role !== 'system');

    const body: Record<string, unknown> = {
      model: modelId,
      max_tokens: req.maxTokens ?? 4096,
      stream: true,
      messages: nonSystem.map((m) => ({ role: m.role, content: m.content })),
      ...(systemMsg ? { system: systemMsg.content } : {}),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    };

    const res = await this.fetchImpl(
      `${this.baseURL}/messages`,
      fetchOpts(
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(body),
        },
        ctx?.signal,
      ),
    );

    if (!res.ok) {
      throw new Error(`Anthropic API error: ${res.status} ${res.statusText}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('Response body is not readable');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data) as Record<string, unknown>;
          const type = parsed['type'] as string | undefined;

          if (type === 'content_block_delta') {
            const deltaObj = parsed['delta'] as Record<string, unknown> | undefined;
            const text = (deltaObj?.['text'] as string) ?? '';
            yield { text };
          } else if (type === 'message_delta') {
            const deltaObj = parsed['delta'] as Record<string, unknown> | undefined;
            const stopReason = deltaObj?.['stop_reason'] as string | undefined;
            const usageObj = parsed['usage'] as Record<string, unknown> | undefined;
            yield {
              text: '',
              ...(stopReason === 'end_turn'
                ? { finishReason: 'stop' as const }
                : stopReason === 'max_tokens'
                  ? { finishReason: 'length' as const }
                  : {}),
              ...(usageObj
                ? {
                    usage: {
                      inputTokens: (usageObj['input_tokens'] as number) ?? 0,
                      outputTokens: (usageObj['output_tokens'] as number) ?? 0,
                    },
                  }
                : {}),
            };
          }
        } catch {
          // Skip unparseable SSE lines
        }
      }
    }
  }

  async generateImage(
    _req: GenerateImageRequest,
    _ctx?: { signal?: AbortSignal },
  ): Promise<GenerateImageResult> {
    throw new UnsupportedCapabilityError('image-generation', this.id);
  }

  async embed(
    _req: EmbedRequest,
    _ctx?: { signal?: AbortSignal },
  ): Promise<EmbedResult> {
    throw new UnsupportedCapabilityError('embed', this.id);
  }

  generateVision(): Promise<GenerateVisionResult> {
    throw new UnsupportedCapabilityError('vision', this.id);
  }

  generateSpeech(): Promise<GenerateSpeechResult> {
    throw new UnsupportedCapabilityError('speech', this.id);
  }

  transcribe(): Promise<TranscribeResult> {
    throw new UnsupportedCapabilityError('transcribe', this.id);
  }
}

// ---------------------------------------------------------------------------
// Google (Gemini) adapter
// ---------------------------------------------------------------------------

class GoogleAdapter implements ModelAdapter {
  readonly id: string;
  readonly capabilities: Capability[] = ['text', 'vision', 'json-mode'];

  private readonly fetchImpl: typeof fetch;
  private readonly apiKey: string;
  private readonly baseURL: string;

  constructor(model: string, opts?: AdapterOptions) {
    this.id = `google-${model.replace('/', '-')}`;
    this.fetchImpl = opts?.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.apiKey = opts?.apiKey ?? process.env['GOOGLE_AI_API_KEY'] ?? '';
    this.baseURL = opts?.baseURL ?? 'https://generativelanguage.googleapis.com/v1beta';
  }

  async *generateText(
    req: GenerateTextRequest,
    ctx?: { signal?: AbortSignal },
  ): AsyncIterable<Delta> {
    const { modelId } = parseModelClass(req.model);
    const contents = req.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        maxOutputTokens: req.maxTokens,
        temperature: req.temperature,
        ...(req.jsonMode ? { responseMimeType: 'application/json' } : {}),
      },
    };

    const res = await this.fetchImpl(
      `${this.baseURL}/models/${modelId}:streamGenerateContent?alt=sse&key=${this.apiKey}`,
      fetchOpts(
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        ctx?.signal,
      ),
    );

    if (!res.ok) {
      throw new Error(`Google AI API error: ${res.status} ${res.statusText}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('Response body is not readable');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data) as Record<string, unknown>;
          const candidates = parsed['candidates'] as Array<Record<string, unknown>> | undefined;
          const candidate = candidates?.[0];
          if (!candidate) continue;

          const content = candidate['content'] as Record<string, unknown> | undefined;
          const parts = content?.['parts'] as Array<Record<string, unknown>> | undefined;
          const text = (parts?.[0]?.['text'] as string) ?? '';

          const finishReason = candidate['finishReason'] as string | undefined;

          yield {
            text,
            ...(finishReason === 'STOP'
              ? { finishReason: 'stop' as const }
              : finishReason === 'MAX_TOKENS'
                ? { finishReason: 'length' as const }
                : {}),
          };
        } catch {
          // Skip unparseable SSE lines
        }
      }
    }
  }

  async generateImage(
    _req: GenerateImageRequest,
    _ctx?: { signal?: AbortSignal },
  ): Promise<GenerateImageResult> {
    throw new UnsupportedCapabilityError('image-generation', this.id);
  }

  async embed(
    _req: EmbedRequest,
    _ctx?: { signal?: AbortSignal },
  ): Promise<EmbedResult> {
    throw new UnsupportedCapabilityError('embed', this.id);
  }

  generateVision(): Promise<GenerateVisionResult> {
    throw new UnsupportedCapabilityError('vision', this.id);
  }

  generateSpeech(): Promise<GenerateSpeechResult> {
    throw new UnsupportedCapabilityError('speech', this.id);
  }

  transcribe(): Promise<TranscribeResult> {
    throw new UnsupportedCapabilityError('transcribe', this.id);
  }
}

// ---------------------------------------------------------------------------
// VLLM adapter (OpenAI-compatible self-hosted)
// ---------------------------------------------------------------------------

class VLLMAdapter implements ModelAdapter {
  readonly id: string;
  readonly capabilities: Capability[] = ['text'];

  private readonly fetchImpl: typeof fetch;
  private readonly apiKey: string;
  private readonly baseURL: string;

  constructor(model: string, opts?: AdapterOptions) {
    this.id = `vllm-${model.replace('/', '-')}`;
    this.fetchImpl = opts?.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.apiKey = opts?.apiKey ?? process.env['VLLM_API_KEY'] ?? '';
    this.baseURL =
      opts?.baseURL ?? process.env['VLLM_BASE_URL'] ?? 'http://localhost:8000/v1';
  }

  async *generateText(
    req: GenerateTextRequest,
    ctx?: { signal?: AbortSignal },
  ): AsyncIterable<Delta> {
    const { modelId } = parseModelClass(req.model);
    const body: Record<string, unknown> = {
      model: modelId,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: req.maxTokens,
      temperature: req.temperature,
      stream: true,
      ...(req.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const res = await this.fetchImpl(
      `${this.baseURL}/chat/completions`,
      fetchOpts(
        {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        },
        ctx?.signal,
      ),
    );

    if (!res.ok) {
      throw new Error(`VLLM API error: ${res.status} ${res.statusText}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('Response body is not readable');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data) as Record<string, unknown>;
          const choices = parsed['choices'] as Array<Record<string, unknown>> | undefined;
          const choice = choices?.[0];
          if (!choice) continue;

          const delta = choice['delta'] as Record<string, unknown> | undefined;
          const finish = choice['finish_reason'] as string | undefined;

          const textContent = delta?.['content'];
          const text = typeof textContent === 'string' ? textContent : '';

          yield {
            text,
            ...(finish === 'stop' || finish === 'length' || finish === 'error'
              ? { finishReason: finish as 'stop' | 'length' | 'error' }
              : {}),
          };
        } catch {
          // Skip unparseable SSE lines
        }
      }
    }
  }

  async generateImage(
    _req: GenerateImageRequest,
    _ctx?: { signal?: AbortSignal },
  ): Promise<GenerateImageResult> {
    throw new UnsupportedCapabilityError('image-generation', this.id);
  }

  async embed(
    _req: EmbedRequest,
    _ctx?: { signal?: AbortSignal },
  ): Promise<EmbedResult> {
    throw new UnsupportedCapabilityError('embed', this.id);
  }

  generateVision(): Promise<GenerateVisionResult> {
    throw new UnsupportedCapabilityError('vision', this.id);
  }

  generateSpeech(): Promise<GenerateSpeechResult> {
    throw new UnsupportedCapabilityError('speech', this.id);
  }

  transcribe(): Promise<TranscribeResult> {
    throw new UnsupportedCapabilityError('transcribe', this.id);
  }
}
