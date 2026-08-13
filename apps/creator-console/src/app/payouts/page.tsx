'use client';

import { useEffect, useState } from 'react';
import { PayoutSettingsForm } from '../../components/payouts/PayoutSettingsForm';
import { useI18n } from '../../lib/i18n';
import {
  getPayoutSettings,
  updatePayoutSettings,
} from '../../lib/payout-service';
import type { PayoutSettings } from '../../lib/types';

const CREATOR_ID = 'creator-demo';

export default function PayoutsPage() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<PayoutSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getPayoutSettings(CREATOR_ID).then((s) => {
      if (!cancelled) {
        setSettings(s);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !settings) {
    return (
      <div
        data-testid="payouts-page"
        className="flex items-center justify-center py-20 text-sm text-slate-500"
      >
        Loading…
      </div>
    );
  }

  return (
    <div data-testid="payouts-page" className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('creator.payouts.heading')}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {t('creator.payouts.subheading')}
        </p>
      </header>

      <PayoutSettingsForm
        settings={settings}
        onSave={async (input) => {
          const updated = await updatePayoutSettings(CREATOR_ID, input);
          setSettings(updated);
        }}
      />
    </div>
  );
}