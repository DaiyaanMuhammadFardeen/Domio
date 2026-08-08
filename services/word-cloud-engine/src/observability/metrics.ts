/**
 * @domio/word-cloud-engine — observability.
 */

export interface CounterLike {
  inc(by?: number, attrs?: Record<string, string>): void;
}

export interface HistogramLike {
  observe(value_ms: number, attrs?: Record<string, string>): void;
}

export interface UpDownCounterLike {
  inc(by?: number, attrs?: Record<string, string>): void;
  dec(by?: number, attrs?: Record<string, string>): void;
}

export interface WordCloudEngineMetrics {
  clouds_created: CounterLike;
  submits: CounterLike;
  submit_latency_ms: HistogramLike;
  blocked_submits: CounterLike;
  open_clouds: UpDownCounterLike;
}

export class NullWordCloudEngineMetrics implements WordCloudEngineMetrics {
  clouds_created = makeCounter();
  submits = makeCounter();
  submit_latency_ms = makeHistogram();
  blocked_submits = makeCounter();
  open_clouds = makeUpDown();
}

function makeCounter(): CounterLike { return { inc: () => undefined }; }
function makeHistogram(): HistogramLike { return { observe: () => undefined }; }
function makeUpDown(): UpDownCounterLike { return { inc: () => undefined, dec: () => undefined }; }
