'use client';

import { useEffect, useState } from 'react';
import { Save, RefreshCw, CreditCard, Shield, User } from 'lucide-react';
import { Badge, toneForKycStatus } from '../../components/Badge';
import { useI18n } from '../../lib/i18n';
import type { CreatorProfile, CreatorProfileUpdate, CreatorPayoutMethod } from '../../lib/types';
import { fetcher } from '../../lib/fetcher';

const API_BASE = process.env['NEXT_PUBLIC_API_BASE'] ?? 'http://localhost:8080';

const COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'JP', name: 'Japan' },
  { code: 'BD', name: 'Bangladesh' },
  { code: 'IN', name: 'India' },
  { code: 'BR', name: 'Brazil' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
];

const CURRENCIES = ['USD', 'EUR', 'GBP', 'BDT', 'JPY', 'INR'];

export default function SettingsPage() {
  const { t } = useI18n();
  const [profile, setProfile] = useState<CreatorProfile | null>(null);

  const [payoutMethods, setPayoutMethods] = useState<CreatorPayoutMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [currency, setCurrency] = useState('USD');

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [profileData, payoutData] = await Promise.allSettled([
          fetcher<CreatorProfile>(API_BASE, '/v1/creator/profile'),
          fetcher<CreatorPayoutMethod[]>(API_BASE, '/v1/creator/payout-methods'),
        ]);

        if (profileData.status === 'fulfilled') {
          setProfile(profileData.value);
          setDisplayName(profileData.value.display_name);
          setBio(profileData.value.bio ?? '');
          setCountryCode(profileData.value.country_code ?? '');
          setCurrency(profileData.value.currency);
        }

        if (payoutData.status === 'fulfilled') {
          setPayoutMethods(payoutData.value);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load settings');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSaveProfile() {
    try {
      setSaving(true);
      setError(null);

      const update: CreatorProfileUpdate = {
        display_name: displayName,
        bio: bio || null,
        country_code: countryCode || null,
        currency,
      };

      const updated = await fetcher<CreatorProfile>(API_BASE, '/v1/creator/profile', {
        method: 'PATCH',
        body: update,
      });

      setProfile(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  }

  async function handleStartKyc() {
    try {
      const result = await fetcher<{ session_url: string }>(API_BASE, '/v1/creator/kyc/start', {
        method: 'POST',
        body: { vendor: 'persona' },
      });
      window.open(result.session_url, '_blank');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start KYC verification');
    }
  }

  async function handleConnectStripe() {
    try {
      const result = await fetcher<{ connect_url: string }>(
        API_BASE,
        '/v1/creator/payout/connect-link',
        {
          method: 'POST',
          body: { return_url: window.location.href },
        },
      );
      window.open(result.connect_url, '_blank');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate Stripe connect link');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-slate-500">Loading settings...</div>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6">
        <h3 className="text-sm font-semibold text-rose-800">Error loading settings</h3>
        <p className="mt-1 text-sm text-rose-700">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('settings.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage your creator profile, verification, and payout settings.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Profile Section */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-200 px-6 py-4">
          <User className="h-5 w-5 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900">{t('settings.profile')}</h2>
        </div>
        <div className="space-y-4 p-6">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              {t('settings.displayName')}
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">{t('settings.bio')}</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              className="mt-1 w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              placeholder="Tell us about yourself..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-slate-700">
                {t('settings.country')}
              </label>
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              >
                <option value="">Select country</option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                {t('settings.currency')}
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            onClick={handleSaveProfile}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? t('settings.saving') : t('settings.save')}
          </button>
        </div>
      </section>

      {/* KYC Section */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-200 px-6 py-4">
          <Shield className="h-5 w-5 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900">{t('settings.kyc')}</h2>
        </div>
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-900">{t('settings.kyc.status')}</p>
              <p className="mt-1 text-sm text-slate-500">
                {profile?.kyc_status === 'approved'
                  ? t('settings.kyc.approved')
                  : profile?.kyc_status === 'rejected'
                    ? t('settings.kyc.rejected')
                    : t('settings.kyc.pending')}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge tone={toneForKycStatus(profile?.kyc_status ?? 'pending')}>
                {profile?.kyc_status ?? 'pending'}
              </Badge>
              {profile?.kyc_status !== 'approved' && (
                <button
                  onClick={handleStartKyc}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  {t('settings.kyc.start')}
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Payout Methods Section */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-200 px-6 py-4">
          <CreditCard className="h-5 w-5 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900">{t('settings.payouts')}</h2>
        </div>
        <div className="p-6">
          {payoutMethods.length === 0 ? (
            <div className="text-center">
              <p className="text-sm text-slate-500">{t('settings.payouts.empty')}</p>
              <button
                onClick={handleConnectStripe}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
              >
                <CreditCard className="h-4 w-4" />
                {t('settings.payouts.connect')}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {payoutMethods.map((method) => (
                <div
                  key={method.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 p-4"
                >
                  <div className="flex items-center gap-3">
                    <CreditCard className="h-5 w-5 text-slate-400" />
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {method.kind === 'stripe_connect'
                          ? 'Stripe Connect'
                          : method.kind === 'bkash'
                            ? 'bKash'
                            : method.kind === 'nagad'
                              ? 'Nagad'
                              : 'Bank Transfer'}
                      </p>
                      <p className="text-xs text-slate-500">{method.external_account_id}</p>
                    </div>
                  </div>
                  <Badge tone={method.verified ? 'green' : 'amber'}>
                    {method.verified ? 'Verified' : 'Pending'}
                  </Badge>
                </div>
              ))}
              <button
                onClick={handleConnectStripe}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <CreditCard className="h-4 w-4" />
                {t('settings.payouts.add')}
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
