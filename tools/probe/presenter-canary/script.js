// Phase 15 W16 — Presenter canary probe.
//
// Drives the create → advance → handover → end lifecycle against a
// real (or local) domio-api instance and reports the four SLOs from
// the dashboard:
//
//   - presenter.ws.p95_open_ms            (p95, target 800 ms)
//   - presenter.annotation.p95_replay_ms  (p95, target 200 ms)
//   - presenter.handoff.p95_ms            (p95, target 1500 ms)
//   - presenter.recap.p95_ms              (p95, target 2000 ms)
//
// Usage:
//   API_BASE=http://localhost:8080 k6 run tools/probe/presenter-canary/script.js
//
// Environment:
//   API_BASE         base URL for domio-api (default http://localhost:8080)
//   CANARY_VUS       concurrent VUs (default 100)
//   CANARY_DURATION  test duration (default 30m)

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { SharedArray } from 'k6/data';

const API_BASE = __ENV.API_BASE || 'http://localhost:8080';
const VUS = Number(__ENV.CANARY_VUS || 100);
const DURATION = __ENV.CANARY_DURATION || '30m';

export const options = {
  scenarios: {
    presenter_canary: {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION,
    },
  },
  thresholds: {
    presenter_ws_open_ms: ['p(95)<800'],
    presenter_handoff_ms: ['p(95)<1500'],
    presenter_annotation_replay_ms: ['p(95)<200'],
    presenter_recap_ms: ['p(95)<2000'],
    checks: ['rate>0.95'],
  },
};

// Custom SLO metrics — surfaced to the JSON summary.
const wsOpen = new Trend('presenter_ws_open_ms', true);
const handoff = new Trend('presenter_handoff_ms', true);
const annotationReplay = new Trend('presenter_annotation_replay_ms', true);
const recap = new Trend('presenter_recap_ms', true);
const advanceCount = new Counter('presenter_advance_count');
const conflictCount = new Counter('presenter_conflict_count');

const slides = new SharedArray('deck', function () {
  // Synth 12 slides per session. The real probe would load a deck from
  // apps/api but the canary only exercises the lifecycle.
  return Array.from({ length: 12 }, (_, i) => ({ id: `slide-${i}`, index: i }));
});

function pickHeader(headers, name) {
  const v = headers[name.toLowerCase()];
  return typeof v === 'string' ? v : undefined;
}

export default function () {
  group('presenter lifecycle', function () {
    const startedAt = Date.now();
    // 1. Create session
    const createRes = http.post(
      `${API_BASE}/v1/presenter/sessions`,
      JSON.stringify({
        workspace_id: '00000000-0000-0000-0000-000000000000',
        deck_id: 'canary-deck',
        presenter_id: `canary-${__VU}`,
        initial_slide_id: 'slide-0',
        initial_slide_index: 0,
      }),
      { headers: { 'content-type': 'application/json', 'x-actor-id': `canary-${__VU}` } },
    );
    check(createRes, { 'session created': (r) => r.status === 200 });
    if (createRes.status !== 200) {
      conflictCount.add(1);
      return;
    }
    const session = createRes.json();
    const sessionId = session.id;
    let version = session.version;

    // 2. Advance through the deck
    for (let i = 1; i < slides.length; i++) {
      const slide = slides[i];
      const advanceRes = http.post(
        `${API_BASE}/v1/presenter/sessions/${sessionId}/advance`,
        JSON.stringify({
          target_slide_id: slide.id,
          target_slide_index: slide.index,
        }),
        {
          headers: {
            'content-type': 'application/json',
            'x-actor-id': `canary-${__VU}`,
            'if-match': `"${version}"`,
          },
        },
      );
      check(advanceRes, { 'advance ok': (r) => r.status === 200 });
      if (advanceRes.status !== 200) {
        conflictCount.add(1);
        break;
      }
      advanceCount.add(1);
      version = advanceRes.json().version;
    }

    // 3. Annotate the active slide.
    const annotateRes = http.post(
      `${API_BASE}/v1/presenter/sessions/${sessionId}/annotate`,
      JSON.stringify({
        slide_id: 'slide-11',
        kind: 'ink',
        geometry: { strokes: [{ x: 0, y: 0 }] },
        color: '#000000',
        stroke_width: 2,
        ephemeral: true,
        drawn_by: `canary-${__VU}`,
        drawn_by_display_name: 'Canary',
      }),
      {
        headers: {
          'content-type': 'application/json',
          'x-actor-id': `canary-${__VU}`,
          'if-match': `"${version}"`,
        },
      },
    );
    if (annotateRes.status === 200) {
      version = annotateRes.json().session.version;
    }

    // 4. Handover to a different presenter.
    const handoverInitRes = http.post(
      `${API_BASE}/v1/presenter/sessions/${sessionId}/handover/init`,
      JSON.stringify({ to_presenter_id: `canary-target-${__VU}`, ttl_ms: 5 * 60_000 }),
      { headers: { 'content-type': 'application/json', 'x-actor-id': `canary-${__VU}` } },
    );
    check(handoverInitRes, { 'handover init ok': (r) => r.status === 200 });
    if (handoverInitRes.status !== 200) return;
    const initBody = handoverInitRes.json();
    const handoverStartedAt = Date.now();

    const handoverRes = http.post(
      `${API_BASE}/v1/presenter/sessions/${sessionId}/handover`,
      JSON.stringify({
        to_presenter_id: initBody.expected_version
          ? `canary-target-${__VU}`
          : `canary-target-${__VU}`,
        state_snapshot: {},
        transfer_token: initBody.token,
        client_started_at_ms: handoverStartedAt,
      }),
      {
        headers: {
          'content-type': 'application/json',
          'x-actor-id': `canary-${__VU}`,
          'if-match': `"${initBody.expected_version}"`,
        },
      },
    );
    check(handoverRes, { 'handover ok': (r) => r.status === 200 });
    if (handoverRes.status === 200) {
      handoff.add(Date.now() - handoverStartedAt);
      version = handoverRes.json().version;
    }

    // 5. End the session.
    const endRes = http.post(`${API_BASE}/v1/presenter/sessions/${sessionId}/end`, '{}', {
      headers: {
        'content-type': 'application/json',
        'x-actor-id': `canary-${__VU}`,
        'if-match': `"${version}"`,
      },
    });
    check(endRes, { 'end ok': (r) => r.status === 200 });

    // 6. Recap read.
    const recapStart = Date.now();
    const recapRes = http.get(`${API_BASE}/v1/presenter/sessions/${sessionId}/recap`);
    if (recapRes.status === 200) {
      recap.add(Date.now() - recapStart);
    }

    // WS-open: synthesize from the round-trip of the first lifecycle
    // request (a true WS probe would require a separate WS endpoint).
    wsOpen.add(Date.now() - startedAt);
    annotationReplay.add(annotateRes.timings.duration);

    sleep(0.5);
  });
}

// Override the default summary reporter to print all four SLO p95s
// alongside the threshold table.
export function handleSummary(data) {
  const out = {
    stdout: textSummary(data),
    'summary.json': JSON.stringify(data, null, 2),
  };
  return out;
}

function textSummary(data) {
  const m = data.metrics || {};
  const trends = [
    'presenter_ws_open_ms',
    'presenter_handoff_ms',
    'presenter_annotation_replay_ms',
    'presenter_recap_ms',
  ];
  let text = '\nPresenter canary — SLO snapshot\n\n';
  for (const name of trends) {
    const t = m[name] || {};
    text += `  ${name.padEnd(38)} p95=${((t.values && t.values['p(95)']) || 0).toFixed(2)} ms\n`;
  }
  return text + '\n';
}
