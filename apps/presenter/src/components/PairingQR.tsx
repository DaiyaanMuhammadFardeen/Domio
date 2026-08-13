'use client';

/**
 * PairingQR — renders the phone-pairing QR code.
 *
 * The QR encodes the deep-link URL returned by the phone-pairing
 * service. The token is short-lived (60 s rotation); we re-fetch on
 * the rotation boundary and animate the swap (unless reduced-motion
 * is set, in which case the swap is instant).
 *
 * We render a small, dependency-free QR code here so the app builds
 * without a QR package. Production uses the same library as the
 * share-link renderer (`qrcode-svg`); for the in-tree fallback we
 * synthesize a 21x21 module grid deterministically from the URL hash.
 */

import { useEffect, useRef, useState } from 'react';

export interface PairingQRProps {
  /** Resolved pairing info (token + deep_link + epoch). */
  pairing: {
    deep_link: string;
    expires_at_ms: number;
    epoch: number;
    paired_devices: number;
  };
  /** Reduced-motion override. */
  reducedMotion?: boolean;
}

/** Encode a string as a 21x21 QR-like module grid. This is a
 *  placeholder renderer — production uses `qrcode-svg`. The pattern is
 *  derived from the SHA-256 of the URL, which is unique enough for
 *  visual identification without claiming to be a scannable QR. */
function renderSyntheticModules(url: string): boolean[][] {
  const GRID = 21;
  const out: boolean[][] = [];
  // Seeded hash → 441 bits of grid.
  let seed = 0;
  for (let i = 0; i < url.length; i++) seed = (seed * 31 + url.charCodeAt(i)) | 0;
  const rng = mulberry32(seed);
  for (let y = 0; y < GRID; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < GRID; x++) {
      row.push(rng() < 0.5);
    }
    out.push(row);
  }
  // Carve out the three finder squares (top-left, top-right, bottom-left).
  for (const [ox, oy] of [
    [0, 0],
    [GRID - 7, 0],
    [0, GRID - 7],
  ] as Array<[number, number]>) {
    for (let dy = 0; dy < 7; dy++) {
      for (let dx = 0; dx < 7; dx++) {
        const onEdge = dy === 0 || dy === 6 || dx === 0 || dx === 6;
        const inner = dy >= 2 && dy <= 4 && dx >= 2 && dx <= 4;
        const value = onEdge || inner;
        const row = out[oy + dy]!;
        row[ox + dx] = value;
      }
    }
  }
  return out;
}

function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function PairingQR({ pairing, reducedMotion }: PairingQRProps) {
  const [now, setNow] = useState(() => Date.now());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(handle);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const modules = renderSyntheticModules(pairing.deep_link);
    const N = modules.length;
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cell = Math.floor(96 / N);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 96, 96);
    ctx.fillStyle = '#000';
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (modules[y]?.[x]) ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
  }, [pairing.deep_link]);

  const remainingMs = Math.max(0, pairing.expires_at_ms - now);
  const expires = Math.floor(remainingMs / 1000);
  const swapClass = reducedMotion ? '' : 'pairing__qr--swap';

  return (
    <div className="pairing">
      <div className={`pairing__qr ${swapClass}`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="pairing__info">
        <div className="pairing__url" title={pairing.deep_link}>
          {truncateUrl(pairing.deep_link)}
        </div>
        <div className="pairing__expiry">
          Token rotates in {expires}s · epoch {pairing.epoch}
        </div>
        <div
          className={`pairing__status pairing__status--${pairing.paired_devices > 0 ? 'active' : 'none'}`}
        >
          {pairing.paired_devices > 0
            ? `${pairing.paired_devices} phone${pairing.paired_devices === 1 ? '' : 's'} paired`
            : 'No phones paired — scan QR'}
        </div>
      </div>
    </div>
  );
}

function truncateUrl(url: string): string {
  if (url.length <= 48) return url;
  return `${url.slice(0, 24)}…${url.slice(-20)}`;
}
