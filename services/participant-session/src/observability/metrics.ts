/**
 * @domio/participant-session — metrics facade.
 *
 * Phase 16 W1. Mirrors the surface of `@domio/presenter-session` for
 * the audience side. SLOs pinned by the dashboard:
 *
 *   - audience.join.p95_ms       — join round-trip
 *   - audience.ws.p95_open_ms    — handshake latency
 *   - audience.aggregation.latency_ms — fan-in from engines
 *   - audience.fanout.duration_ms     — fan-out to audience PWA
 */

export interface HistogramLike {
  record(value: number, attrs?: Record<string, string>): void;
}

export interface UpDownCounterLike {
  add(value: number, attrs?: Record<string, string>): void;
}

export interface MeterLike {
  createHistogram(name: string, opts?: { description?: string; unit?: string }): HistogramLike;
  createUpDownCounter(
    name: string,
    opts?: { description?: string; unit?: string },
  ): UpDownCounterLike;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
}

export interface ParticipantMetrics {
  readonly joinMs: HistogramLike;
  readonly heartbeatMs: HistogramLike;
  readonly leaveMs: HistogramLike;
  activeGaugeAdd(value: number, attrs?: Record<string, string>): void;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
}

class NullParticipantMetrics implements ParticipantMetrics {
  private static readonly noopHist = (): HistogramLike => ({ record: () => undefined });
  readonly joinMs: HistogramLike = NullParticipantMetrics.noopHist();
  readonly heartbeatMs: HistogramLike = NullParticipantMetrics.noopHist();
  readonly leaveMs: HistogramLike = NullParticipantMetrics.noopHist();
  activeGaugeAdd(): void {
    /* noop */
  }
  async flush(): Promise<void> {
    /* noop */
  }
  async shutdown(): Promise<void> {
    /* noop */
  }
}

const NULL: ParticipantMetrics = new NullParticipantMetrics();

export function nullParticipantMetrics(): ParticipantMetrics {
  return NULL;
}

export interface BindOptions {
  readonly meter: MeterLike;
}

export function bindParticipantMetrics(opts: BindOptions): ParticipantMetrics {
  const meter = opts.meter;
  const gauge = meter.createUpDownCounter('audience_participants_active', {
    description: 'Active participant sessions per workspace',
    unit: '1',
  });
  return {
    joinMs: meter.createHistogram('audience_join_ms', {
      description: 'Join round-trip',
      unit: 'ms',
    }),
    heartbeatMs: meter.createHistogram('audience_heartbeat_ms', {
      description: 'Heartbeat round-trip',
      unit: 'ms',
    }),
    leaveMs: meter.createHistogram('audience_leave_ms', {
      description: 'Leave round-trip',
      unit: 'ms',
    }),
    activeGaugeAdd(value, attrs) {
      gauge.add(value, attrs);
    },
    flush: () => meter.flush(),
    shutdown: () => meter.shutdown(),
  };
}
