/**
 * MagicCard — adapted from Magic UI (magicui.design/magic-card).
 * Mouse-tracked radial highlight on hover.
 */

'use client';

import { motion, useMotionTemplate, useMotionValue } from 'motion/react';
import { useCallback } from 'react';
import type { MouseEvent, ReactElement, ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface MagicCardProps {
  className?: string;
  children: ReactNode;
}

export function MagicCard({ className, children }: MagicCardProps): ReactElement {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const background = useMotionTemplate`radial-gradient(at ${mouseX}px ${mouseY}px, rgba(88,166,255,0.14) 0%, transparent 60%)`;

  const handleMouseMove = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      mouseX.set(e.clientX - rect.left);
      mouseY.set(e.clientY - rect.top);
    },
    [mouseX, mouseY],
  );

  return (
    <motion.div
      onMouseMove={handleMouseMove}
      className={cn(
        'group relative overflow-hidden rounded-xl border border-[#262b33] bg-[#11151c] transition-colors duration-300 hover:border-[#58a6ff]',
        className,
      )}
    >
      <motion.div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background }}
        aria-hidden="true"
      />
      <div className="relative">{children}</div>
    </motion.div>
  );
}
