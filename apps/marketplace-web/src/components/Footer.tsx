'use client';

import { useLocale } from '@/hooks/useLocale';

export function Footer() {
  const { t } = useLocale();

  return (
    <footer className="border-t border-border/60 bg-surface py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-xs text-muted">
            {t('footer.madeBy')}
          </p>
          <p className="text-xs text-muted/60">
            &copy; {new Date().getFullYear()} Domio
          </p>
        </div>
      </div>
    </footer>
  );
}
