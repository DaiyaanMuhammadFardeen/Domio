/**
 * HeroAnimation — canvas-based rotating deck preview.
 *
 * Wave 12 §S12.1 — sits inside the hero section of the marketing home
 * page. Renders five stylized slide thumbnails that rotate through the
 * canvas, simulating the editor flipping through decks. Animation runs
 * via requestAnimationFrame and is gated by prefers-reduced-motion.
 *
 * Implementation notes:
 *  - We render via the 2D canvas API directly so we don't pull in a
 *    charting / animation package. The animation is intentionally simple:
 *    a `currentSlide` index advances every N ms and we paint each slide
 *    in turn.
 *  - The hero is decorative; we expose `aria-hidden` so screen readers
 *    skip past the canvas.
 *  - All colors come from CSS custom properties so the canvas respects
 *    the active theme.
 */

'use client';

import { useEffect, useRef, type JSX } from 'react';

const SLIDE_INTERVAL_MS = 2200;
const SLIDE_COUNT = 5;

interface SlideSpec {
  readonly headline: string;
  readonly accent: string;
  readonly bullets: ReadonlyArray<string>;
}

const SLIDES: ReadonlyArray<SlideSpec> = [
  {
    headline: 'Q4 ARR',
    accent: 'var(--accent-1)',
    bullets: ['+38% net new', 'Expansion 1.4×', 'NRR 124%'],
  },
  {
    headline: 'Product roadmap',
    accent: 'var(--success)',
    bullets: ['Live sync', 'MCP server', 'Agent handoff'],
  },
  {
    headline: 'Onboarding',
    accent: 'var(--warning)',
    bullets: ['SSO day 1', 'SCIM auto', 'Audit log'],
  },
  {
    headline: 'Pitch deck',
    accent: 'var(--danger)',
    bullets: ['Problem', 'Solution', 'Ask'],
  },
  {
    headline: 'Sales review',
    accent: 'var(--info)',
    bullets: ['Pipeline', 'Win rate', 'Forecast'],
  },
];

function readCssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const root = document.documentElement;
  const value = root.style.getPropertyValue(name) || getComputedStyle(root).getPropertyValue(name);
  return value.trim() || fallback;
}

export function HeroAnimation(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let rafId = 0;
    let slideIndex = 0;
    let lastFlip = 0;

    const colors = {
      bg: readCssVar('--surface-1', '#161b22'),
      panel: readCssVar('--surface-2', '#1f242c'),
      border: readCssVar('--border-default', '#30363d'),
      fg: readCssVar('--content-primary', '#e6edf3'),
      muted: readCssVar('--content-muted', '#7d8590'),
      accent: readCssVar('--accent-1', '#58a6ff'),
    };

    const resize = (): void => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const drawSlide = (slide: SlideSpec, t: number, fade: number): void => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const padding = 24;
      const slideW = w - padding * 2;
      const slideH = h - padding * 2;
      const x = padding;
      const y = padding;

      // Slide background.
      ctx.globalAlpha = fade;
      ctx.fillStyle = colors.panel;
      ctx.fillRect(x, y, slideW, slideH);
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, slideW - 1, slideH - 1);

      // Accent stripe.
      ctx.fillStyle = slide.accent;
      ctx.fillRect(x, y, 6, slideH);

      // Headline.
      ctx.fillStyle = colors.fg;
      ctx.font = '600 28px var(--font-sans), -apple-system, sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(slide.headline, x + 24, y + 24);

      // Bullets.
      ctx.font = '14px var(--font-sans), -apple-system, sans-serif';
      ctx.fillStyle = colors.muted;
      slide.bullets.forEach((b, i) => {
        ctx.fillStyle = colors.muted;
        ctx.beginPath();
        ctx.arc(x + 32, y + 80 + i * 28 + 4, 3, 0, Math.PI * 2);
        ctx.fillStyle = slide.accent;
        ctx.fill();
        ctx.fillStyle = colors.fg;
        ctx.fillText(b, x + 44, y + 80 + i * 28);
      });

      // Footer bar — pulsing cursor that tracks time.
      const cursorX = x + 24 + ((t / 1000) % (slideW - 48));
      ctx.fillStyle = colors.accent;
      ctx.fillRect(cursorX, y + slideH - 32, 2, 16);

      ctx.globalAlpha = 1;
    };

    const paint = (now: number): void => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, w, h);

      if (!reduced && now - lastFlip > SLIDE_INTERVAL_MS) {
        slideIndex = (slideIndex + 1) % SLIDE_COUNT;
        lastFlip = now;
      }

      const slide = SLIDES[slideIndex] ?? SLIDES[0]!;
      // Fade-in over the first 240ms of each slide.
      const sinceFlip = now - lastFlip;
      const fade = reduced ? 1 : Math.min(1, sinceFlip / 240);
      drawSlide(slide, now - lastFlip, fade);

      rafId = requestAnimationFrame(paint);
    };

    resize();
    window.addEventListener('resize', resize);
    rafId = requestAnimationFrame(paint);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div className="hero-animation" data-testid="hero-animation">
      <canvas
        ref={canvasRef}
        className="hero-animation__canvas"
        aria-hidden="true"
      />
      <div className="hero-animation__caption" aria-hidden="true">
        <span className="hero-animation__chip">editor</span>
        <span className="hero-animation__chip hero-animation__chip--muted">
          live preview
        </span>
      </div>
    </div>
  );
}

export default HeroAnimation;