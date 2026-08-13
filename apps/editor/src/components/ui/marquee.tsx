/**
 * Marquee — adapted from Magic UI (magicui.design/marquee).
 * CSS-only infinite scroll strip.
 */

import type { ReactElement, ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface MarqueeProps {
  className?: string;
  reverse?: boolean;
  pauseOnHover?: boolean;
  children: ReactNode;
}

export function Marquee({
  className,
  reverse = false,
  pauseOnHover = false,
  children,
}: MarqueeProps): ReactElement {
  return (
    <div className={cn('group flex overflow-hidden [--gap:1rem] [--duration:40s]', className)}>
      {[0, 1].map((copy) => (
        <div
          key={copy}
          aria-hidden={copy === 1}
          className={cn(
            'flex shrink-0 items-center gap-[--gap] animate-marquee pr-[--gap]',
            reverse && '[animation-direction:reverse]',
            pauseOnHover && 'group-hover:[animation-play-state:paused]',
          )}
        >
          {children}
        </div>
      ))}
    </div>
  );
}
