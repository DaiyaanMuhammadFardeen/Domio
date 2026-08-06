/**
 * Domio AI adapters gRPC server — hosts model-adapter + prompt-registry.
 *
 * This service is the seam the Go orchestrator calls (orchestrator ↔ adapters).
 * It implements the AdapterService contract from contracts/proto/domio/v1/ai.proto
 * (or the spec described here if the proto is not yet generated).
 *
 * @module
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  createAdapter,
  type ModelAdapter,
  type GenerateTextRequest,
} from '@domio/model-adapter';
import {
  getTemplate,
} from '@domio/prompt-registry';

// ---------------------------------------------------------------------------
// Types — local types matching the proto contract
// ---------------------------------------------------------------------------

/** Chat message as received from the gRPC request. */
interface ChatMessage {
  role: string;
  content: string;
}

/** GenerateText request payload. */
interface GenerateTextPayload {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  json_mode?: boolean;
}

/** GenerateText delta payload (streamed response). */
interface GenerateTextDeltaPayload {
  text: string;
  finish_reason?: string;
  input_tokens?: number;
  output_tokens?: number;
}

/** GenerateImage request payload. */
interface GenerateImagePayload {
  model?: string;
  prompt: string;
  n?: number;
  size?: string;
}

/** GenerateImage response payload. */
interface GenerateImageResponsePayload {
  url: string;
  provider: string;
  model: string;
  prompt: string;
  moderation_verdict: string;
}

/** Embed request payload. */
interface EmbedPayload {
  model?: string;
  input: string;
}

/** Embed response payload. */
interface EmbedResponsePayload {
  embedding: number[];
}

/** GetCapabilities response payload. */
interface GetCapabilitiesResponsePayload {
  model_class: string;
  capabilities: string[];
}

/** GetPrompt request payload. */
interface GetPromptPayload {
  template_id: string;
  version?: number;
}

/** GetPrompt response payload. */
interface GetPromptResponsePayload {
  id: string;
  version: number;
  model_class_hint: string;
  input_schema_json: string;
  output_schema_json: string;
  system_prompt: string;
  user_prompt_template: string;
  eval_set_id?: string | undefined;
}

// ---------------------------------------------------------------------------
// Pure handler functions (exported for testing without gRPC server)
// ---------------------------------------------------------------------------

/**
 * Handle a GetCapabilities call — returns the model class and capabilities
 * for the given model string.
 */
export function handleGetCapabilities(
  model: string,
): GetCapabilitiesResponsePayload {
  const adapter = createAdapter(model);
  return {
    model_class: model,
    capabilities: adapter.capabilities,
  };
}

/**
 * Handle a GetPrompt call — looks up the prompt template by ID and version.
 */
export function handleGetPrompt(
  templateId: string,
  version?: number,
): GetPromptResponsePayload {
  const template = getTemplate(templateId, version);
  if (!template) {
    throw new Error(
      `Template "${templateId}" (version ${version ?? 'latest'}) not found.`,
    );
  }
  return {
    id: template.id,
    version: template.version,
    model_class_hint: template.modelClassHint,
    input_schema_json: JSON.stringify(template.inputSchema),
    output_schema_json: JSON.stringify(template.outputSchema),
    system_prompt: template.systemPrompt,
    user_prompt_template: template.userPromptTemplate,
    eval_set_id: template.evalSetId,
  };
}

/**
 * Collect all streaming deltas from a generateText call into a single
 * async iterator result. Used by the server-streaming handler.
 */
export async function* collectTextDeltas(
  adapter: ModelAdapter,
  req: GenerateTextRequest,
  signal?: AbortSignal,
): AsyncIterable<GenerateTextDeltaPayload> {
  for await (const delta of adapter.generateText(req, signal !== undefined ? { signal } : undefined)) {
    yield {
      text: delta.text,
      ...(delta.finishReason !== undefined
        ? { finish_reason: delta.finishReason }
        : {}),
      ...(delta.usage !== undefined
        ? {
            input_tokens: delta.usage.inputTokens,
            output_tokens: delta.usage.outputTokens,
          }
        : {}),
    };
  }
}

// ---------------------------------------------------------------------------
// Server implementation
// ---------------------------------------------------------------------------

/** Port to listen on. */
const DEFAULT_PORT = 50051;

/**
 * Start the gRPC server.
 *
 * Loads contracts/proto/domio/v1/ai.proto if it exists, otherwise
 * falls back to the local type definitions.
 *
 * @param opts - Optional overrides for port, logger, etc.
 * @returns The running gRPC server.
 */
export function startServer(opts?: {
  port?: number;
  logger?: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
}): grpc.Server {
  const port = opts?.port ?? Number(process.env['ADAPTER_PORT'] ?? DEFAULT_PORT);
  const log = opts?.logger ?? console;

  const server = new grpc.Server();

  // Try to load the proto file; fall back to a dynamic definition
  const protoPath = findProtoPath();
  if (protoPath) {
    loadProtoAndBind(server, protoPath, log);
  } else {
    log.info('ai.proto not found — using built-in service definition');
    bindServiceDefinition(server, log);
  }

  // Add gRPC health service
  bindHealthService(server);

  server.bindAsync(
    `0.0.0.0:${port}`,
    grpc.ServerCredentials.createInsecure(),
    (err: Error | null, boundPort: number) => {
      if (err) {
        log.error('Failed to bind server:', err);
        return;
      }
      log.info(`AI Adapters gRPC server listening on port ${boundPort}`);
    },
  );

  return server;
}

// ---------------------------------------------------------------------------
// Proto loading helpers
// ---------------------------------------------------------------------------

function findProtoPath(): string | null {
  const candidates = [
    path.resolve(process.cwd(), 'contracts/proto/domio/v1/ai.proto'),
    path.resolve(__dirname, '../../../contracts/proto/domio/v1/ai.proto'),
    path.resolve(__dirname, '../../contracts/proto/domio/v1/ai.proto'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function loadProtoAndBind(
  server: grpc.Server,
  protoPath: string,
  log: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void },
): void {
  const packageDef = protoLoader.loadSync(protoPath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });

  const proto = grpc.loadPackageDefinition(packageDef) as unknown as Record<string, unknown>;
  const domioV1 = proto['domio.v1'] as Record<string, unknown> | undefined;
  const AdapterService = domioV1?.['AdapterService'] as { service: grpc.ServiceDefinition<grpc.UntypedHandleCall> } | undefined;

  if (!AdapterService) {
    log.info('AdapterService not found in proto — using built-in definition');
    bindServiceDefinition(server, log);
    return;
  }

  server.addService(AdapterService.service, {
    GenerateText: makeGenerateTextHandler(log),
    GenerateImage: makeGenerateImageHandler(log),
    Embed: makeEmbedHandler(log),
    GetCapabilities: makeGetCapabilitiesHandler(log),
    GetPrompt: makeGetPromptHandler(log),
  });
}

function bindServiceDefinition(
  server: grpc.Server,
  log: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void },
): void {
  // Define a minimal service definition matching the AdapterService contract
  const serviceDefinition: grpc.ServiceDefinition<grpc.UntypedHandleCall> = {
    GenerateText: {
      path: '/domio.v1.AdapterService/GenerateText',
      requestStream: false,
      responseStream: true,
      requestSerialize: (value: unknown) => Buffer.from(JSON.stringify(value)),
      requestDeserialize: (value: Buffer) => JSON.parse(value.toString()) as GenerateTextPayload,
      responseSerialize: (value: unknown) => Buffer.from(JSON.stringify(value)),
      responseDeserialize: (value: Buffer) => JSON.parse(value.toString()) as GenerateTextDeltaPayload,
    },
    GenerateImage: {
      path: '/domio.v1.AdapterService/GenerateImage',
      requestStream: false,
      responseStream: false,
      requestSerialize: (value: unknown) => Buffer.from(JSON.stringify(value)),
      requestDeserialize: (value: Buffer) => JSON.parse(value.toString()) as GenerateImagePayload,
      responseSerialize: (value: unknown) => Buffer.from(JSON.stringify(value)),
      responseDeserialize: (value: Buffer) => JSON.parse(value.toString()) as GenerateImageResponsePayload,
    },
    Embed: {
      path: '/domio.v1.AdapterService/Embed',
      requestStream: false,
      responseStream: false,
      requestSerialize: (value: unknown) => Buffer.from(JSON.stringify(value)),
      requestDeserialize: (value: Buffer) => JSON.parse(value.toString()) as EmbedPayload,
      responseSerialize: (value: unknown) => Buffer.from(JSON.stringify(value)),
      responseDeserialize: (value: Buffer) => JSON.parse(value.toString()) as EmbedResponsePayload,
    },
    GetCapabilities: {
      path: '/domio.v1.AdapterService/GetCapabilities',
      requestStream: false,
      responseStream: false,
      requestSerialize: (value: unknown) => Buffer.from(JSON.stringify(value)),
      requestDeserialize: (value: Buffer) => JSON.parse(value.toString()) as { model: string },
      responseSerialize: (value: unknown) => Buffer.from(JSON.stringify(value)),
      responseDeserialize: (value: Buffer) => JSON.parse(value.toString()) as GetCapabilitiesResponsePayload,
    },
    GetPrompt: {
      path: '/domio.v1.AdapterService/GetPrompt',
      requestStream: false,
      responseStream: false,
      requestSerialize: (value: unknown) => Buffer.from(JSON.stringify(value)),
      requestDeserialize: (value: Buffer) => JSON.parse(value.toString()) as GetPromptPayload,
      responseSerialize: (value: unknown) => Buffer.from(JSON.stringify(value)),
      responseDeserialize: (value: Buffer) => JSON.parse(value.toString()) as GetPromptResponsePayload,
    },
  };

  server.addService(serviceDefinition, {
    GenerateText: makeGenerateTextHandler(log),
    GenerateImage: makeGenerateImageHandler(log),
    Embed: makeEmbedHandler(log),
    GetCapabilities: makeGetCapabilitiesHandler(log),
    GetPrompt: makeGetPromptHandler(log),
  });
}

// ---------------------------------------------------------------------------
// Handler factories
// ---------------------------------------------------------------------------

function makeGenerateTextHandler(
  log: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void },
) {
  return async function* GenerateText(
    call: grpc.ServerUnaryCall<GenerateTextPayload, GenerateTextDeltaPayload>,
  ): AsyncGenerator<GenerateTextDeltaPayload> {
    const req = call.request;
    log.info('GenerateText', { model: req.model, messageCount: req.messages?.length });

    try {
      const adapter = createAdapter(req.model);

      const textReq: GenerateTextRequest = {
        model: req.model,
        messages: (req.messages ?? []).map((m: ChatMessage) => ({
          role: m.role as 'system' | 'user' | 'assistant',
          content: m.content,
        })),
        ...(req.max_tokens !== undefined ? { maxTokens: req.max_tokens } : {}),
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.json_mode !== undefined ? { jsonMode: req.json_mode } : {}),
      };

      yield* collectTextDeltas(adapter, textReq);
    } catch (err) {
      log.error('GenerateText error:', err);
      throw err;
    }
  };
}

function makeGenerateImageHandler(
  log: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void },
) {
  return async function GenerateImage(
    call: grpc.ServerUnaryCall<GenerateImagePayload, GenerateImageResponsePayload>,
    callback: grpc.sendUnaryData<GenerateImageResponsePayload>,
  ): Promise<void> {
    const req = call.request;
    log.info('GenerateImage', { prompt: req.prompt?.substring(0, 50) });

    try {
      const model = req.model ?? 'openai/dall-e-3';
      const adapter = createAdapter(model);
      const result = await adapter.generateImage({
        model,
        prompt: req.prompt,
        ...(req.n !== undefined ? { n: req.n } : {}),
        ...(req.size !== undefined ? { size: req.size } : {}),
      });

      callback(null, {
        url: result.url,
        provider: result.provenance.provider,
        model: result.provenance.model,
        prompt: result.provenance.prompt,
        moderation_verdict: result.provenance.moderationVerdict,
      });
    } catch (err) {
      log.error('GenerateImage error:', err);
      callback(err as Error);
    }
  };
}

function makeEmbedHandler(
  log: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void },
) {
  return async function Embed(
    call: grpc.ServerUnaryCall<EmbedPayload, EmbedResponsePayload>,
    callback: grpc.sendUnaryData<EmbedResponsePayload>,
  ): Promise<void> {
    const req = call.request;
    log.info('Embed', { inputLength: req.input?.length });

    try {
      const model = req.model ?? 'openai/text-embedding-3-small';
      const adapter = createAdapter(model);
      const result = await adapter.embed({
        model,
        input: req.input,
      });

      callback(null, { embedding: result.embedding });
    } catch (err) {
      log.error('Embed error:', err);
      callback(err as Error);
    }
  };
}

function makeGetCapabilitiesHandler(
  log: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void },
) {
  return function GetCapabilities(
    call: grpc.ServerUnaryCall<{ model: string }, GetCapabilitiesResponsePayload>,
    callback: grpc.sendUnaryData<GetCapabilitiesResponsePayload>,
  ): void {
    const req = call.request;
    log.info('GetCapabilities', { model: req.model });

    try {
      const result = handleGetCapabilities(req.model);
      callback(null, result);
    } catch (err) {
      log.error('GetCapabilities error:', err);
      callback(err as Error);
    }
  };
}

function makeGetPromptHandler(
  log: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void },
) {
  return function GetPrompt(
    call: grpc.ServerUnaryCall<GetPromptPayload, GetPromptResponsePayload>,
    callback: grpc.sendUnaryData<GetPromptResponsePayload>,
  ): void {
    const req = call.request;
    log.info('GetPrompt', { template_id: req.template_id, version: req.version });

    try {
      const result = handleGetPrompt(req.template_id, req.version);
      callback(null, result);
    } catch (err) {
      log.error('GetPrompt error:', err);
      callback(err as Error);
    }
  };
}

// ---------------------------------------------------------------------------
// gRPC Health service
// ---------------------------------------------------------------------------

function bindHealthService(server: grpc.Server): void {
  const healthDefinition: grpc.ServiceDefinition<grpc.UntypedHandleCall> = {
    Check: {
      path: '/grpc.health.v1.Health/Check',
      requestStream: false,
      responseStream: false,
      requestSerialize: (value: unknown) => Buffer.from(JSON.stringify(value)),
      requestDeserialize: (value: Buffer) => JSON.parse(value.toString()) as { service: string },
      responseSerialize: (value: unknown) => Buffer.from(JSON.stringify(value)),
      responseDeserialize: (value: Buffer) => JSON.parse(value.toString()) as { status: string; service: string },
    },
  };

  server.addService(healthDefinition, {
    Check(
      call: grpc.ServerUnaryCall<{ service: string }, { status: string; service: string }>,
      callback: grpc.sendUnaryData<{ status: string; service: string }>,
    ): void {
      callback(null, {
        status: 'SERVING',
        service: call.request?.service ?? 'domio.ai-adapters',
      });
    },
  });
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const isMainModule =
  process.argv[1] &&
  (process.argv[1]!.endsWith('/index.ts') || process.argv[1]!.endsWith('/index.js'));

if (isMainModule) {
  startServer();
}
