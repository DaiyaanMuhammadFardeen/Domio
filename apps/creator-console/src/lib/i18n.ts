/**
 * Creator console i18n — lightweight translation hook.
 *
 * Uses the shared @domio/i18n locale definitions but provides
 * a simple translate function for console strings.
 */

import { useMemo } from 'react';
import { SUPPORTED_LOCALES, type LocaleId } from '@domio/i18n';

export type Locale = LocaleId;

export const LOCALES = SUPPORTED_LOCALES;

export interface I18nDict {
  [key: string]: string;
}

const en: I18nDict = {
  // Navigation
  'nav.listings': 'Listings',
  'nav.analytics': 'Analytics',
  'nav.statements': 'Statements',
  'nav.settings': 'Settings',

  // Listings page
  'listings.title': 'My Listings',
  'listings.create': 'Create Listing',
  'listings.empty': 'No listings yet',
  'listings.emptyHint': 'Create your first listing to start selling on the marketplace.',
  'listings.table.title': 'Title',
  'listings.table.kind': 'Kind',
  'listings.table.status': 'Status',
  'listings.table.price': 'Price',
  'listings.table.downloads': 'Downloads',
  'listings.table.actions': 'Actions',

  // Create listing flow
  'create.title': 'Create New Listing',
  'create.step.assets': 'Assets',
  'create.step.details': 'Details',
  'create.step.pricing': 'Pricing',
  'create.step.review': 'Review',
  'create.assets.dropzone': 'Drop files here or click to upload',
  'create.assets.hint': 'Supported formats: ZIP, TGZ, JSON',
  'create.details.title': 'Listing Title',
  'create.details.titlePlaceholder': 'My awesome component',
  'create.details.kind': 'Listing Kind',
  'create.details.kind.component': 'Component',
  'create.details.kind.template': 'Template',
  'create.details.kind.theme': 'Theme',
  'create.details.kind.sticker_pack': 'Sticker Pack',
  'create.details.kind.icon_pack': 'Icon Pack',
  'create.details.description': 'Description',
  'create.details.descriptionPlaceholder': 'Describe your listing...',
  'create.details.tags': 'Tags',
  'create.details.tagsPlaceholder': 'Add tags separated by commas',
  'create.pricing.model': 'Pricing Model',
  'create.pricing.model.free': 'Free',
  'create.pricing.model.one_time': 'One-time',
  'create.pricing.model.subscription': 'Subscription',
  'create.pricing.model.team_seats': 'Team Seats',
  'create.pricing.model.enterprise_quote': 'Enterprise Quote',
  'create.pricing.price': 'Price (cents)',
  'create.pricing.pricePlaceholder': '0',
  'create.pricing.currency': 'Currency',
  'create.review.title': 'Review Your Listing',
  'create.review.submit': 'Submit for Review',
  'create.review.saveDraft': 'Save as Draft',
  'create.next': 'Next',
  'create.back': 'Back',
  'create.cancel': 'Cancel',

  // Analytics page
  'analytics.title': 'Analytics',
  'analytics.period': 'Period',
  'analytics.downloads': 'Downloads',
  'analytics.installs': 'Installs',
  'analytics.mrr': 'MRR',
  'analytics.conversion': 'Conversion Rate',
  'analytics.refundRate': 'Refund Rate',
  'analytics.topGeos': 'Top Geographies',
  'analytics.listings': 'Active Listings',
  'analytics.avgRating': 'Average Rating',

  // Statements page
  'statements.title': 'Statements',
  'statements.monthly': 'Monthly',
  'statements.yearly': 'Yearly (1099-K)',
  'statements.period': 'Period',
  'statements.gross': 'Gross',
  'statements.fees': 'Fees',
  'statements.net': 'Net',
  'statements.generated': 'Generated',
  'statements.download': 'Download',
  'statements.generate': 'Generate Statement',
  'statements.empty': 'No statements available',

  // Settings page
  'settings.title': 'Settings',
  'settings.profile': 'Profile',
  'settings.displayName': 'Display Name',
  'settings.bio': 'Bio',
  'settings.country': 'Country',
  'settings.currency': 'Currency',
  'settings.kyc': 'KYC Verification',
  'settings.kyc.status': 'Status',
  'settings.kyc.start': 'Start Verification',
  'settings.kyc.pending': 'Verification pending',
  'settings.kyc.approved': 'Verification approved',
  'settings.kyc.rejected': 'Verification rejected',
  'settings.payouts': 'Payout Methods',
  'settings.payouts.add': 'Add Payout Method',
  'settings.payouts.connect': 'Connect with Stripe',
  'settings.payouts.empty': 'No payout methods configured',
  'settings.save': 'Save Changes',
  'settings.saving': 'Saving...',
};

const bn: I18nDict = {
  'nav.listings': 'লিস্টিং',
  'nav.analytics': 'অ্যানালিটিক্স',
  'nav.statements': 'স্টেটমেন্ট',
  'nav.settings': 'সেটিংস',
  'listings.title': 'আমার লিস্টিং',
  'listings.create': 'লিস্টিং তৈরি করুন',
  'listings.empty': 'এখনো কোনো লিস্টিং নেই',
  'listings.emptyHint': 'মার্কেটপ্লেসে বিক্রি শুরু করতে আপনার প্রথম লিস্টিং তৈরি করুন।',
  'listings.table.title': 'শিরোনাম',
  'listings.table.kind': 'ধরন',
  'listings.table.status': 'স্ট্যাটাস',
  'listings.table.price': 'মূল্য',
  'listings.table.downloads': 'ডাউনলোড',
  'listings.table.actions': 'কার্যক্রম',
  'create.title': 'নতুন লিস্টিং তৈরি করুন',
  'create.step.assets': 'অ্যাসেট',
  'create.step.details': 'বিবরণ',
  'create.step.pricing': 'মূল্য',
  'create.step.review': 'পর্যালোচনা',
  'create.assets.dropzone': 'ফাইল এখানে ড্রপ করুন বা আপলোড করতে ক্লিক করুন',
  'create.assets.hint': 'সমর্থিত ফরম্যাট: ZIP, TGZ, JSON',
  'create.details.title': 'লিস্টিং শিরোনাম',
  'create.details.titlePlaceholder': 'আমার দারুণ কম্পোনেন্ট',
  'create.details.kind': 'লিস্টিং ধরন',
  'create.details.kind.component': 'কম্পোনেন্ট',
  'create.details.kind.template': 'টেমপ্লেট',
  'create.details.kind.theme': 'থিম',
  'create.details.kind.sticker_pack': 'স্টিকার প্যাক',
  'create.details.kind.icon_pack': 'আইকন প্যাক',
  'create.details.description': 'বিবরণ',
  'create.details.descriptionPlaceholder': 'আপনার লিস্টিং বর্ণনা করুন...',
  'create.details.tags': 'ট্যাগ',
  'create.details.tagsPlaceholder': 'কমা দিয়ে আলাদা করে ট্যাগ যোগ করুন',
  'create.pricing.model': 'মূল্য মডেল',
  'create.pricing.model.free': 'বিনামূল্যে',
  'create.pricing.model.one_time': 'এককালীন',
  'create.pricing.model.subscription': 'সাবস্ক্রিপশন',
  'create.pricing.model.team_seats': 'টিম সিটস',
  'create.pricing.model.enterprise_quote': 'এন্টারপ্রাইজ কোট',
  'create.pricing.price': 'মূল্য (সেন্ট)',
  'create.pricing.pricePlaceholder': '0',
  'create.pricing.currency': 'মুদ্রা',
  'create.review.title': 'আপনার লিস্টিং পর্যালোচনা করুন',
  'create.review.submit': 'পর্যালোচনার জন্য জমা দিন',
  'create.review.saveDraft': 'ড্রাফ্ট হিসাবে সংরক্ষণ করুন',
  'create.next': 'পরবর্তী',
  'create.back': 'পূর্ববর্তী',
  'create.cancel': 'বাতিল',
  'analytics.title': 'অ্যানালিটিক্স',
  'analytics.period': 'সময়কাল',
  'analytics.downloads': 'ডাউনলোড',
  'analytics.installs': 'ইনস্টল',
  'analytics.mrr': 'MRR',
  'analytics.conversion': 'রূপান্তর হার',
  'analytics.refundRate': 'রিফান্ড হার',
  'analytics.topGeos': 'শীর্ষ ভৌগোলিক',
  'analytics.listings': 'সক্রিয় লিস্টিং',
  'analytics.avgRating': 'গড় রেটিং',
  'statements.title': 'স্টেটমেন্ট',
  'statements.monthly': 'মাসিক',
  'statements.yearly': 'বার্ষিক (1099-K)',
  'statements.period': 'সময়কাল',
  'statements.gross': 'মোট',
  'statements.fees': 'ফি',
  'statements.net': 'নিট',
  'statements.generated': 'তৈরি',
  'statements.download': 'ডাউনলোড',
  'statements.generate': 'স্টেটমেন্ট তৈরি করুন',
  'statements.empty': 'কোনো স্টেটমেন্ট উপলব্ধ নেই',
  'settings.title': 'সেটিংস',
  'settings.profile': 'প্রোফাইল',
  'settings.displayName': 'প্রদর্শন নাম',
  'settings.bio': 'জীবনবৃত্তান্ত',
  'settings.country': 'দেশ',
  'settings.currency': 'মুদ্রা',
  'settings.kyc': 'KYC যাচাইকরণ',
  'settings.kyc.status': 'স্ট্যাটাস',
  'settings.kyc.start': 'যাচাইকরণ শুরু করুন',
  'settings.kyc.pending': 'যাচাইকরণ মুলতুবি',
  'settings.kyc.approved': 'যাচাইকরণ অনুমোদিত',
  'settings.kyc.rejected': 'যাচাইকরণ প্রত্যাখ্যাত',
  'settings.payouts': 'পেআউট পদ্ধতি',
  'settings.payouts.add': 'পেআউট পদ্ধতি যোগ করুন',
  'settings.payouts.connect': 'Stripe এর সাথে সংযুক্ত করুন',
  'settings.payouts.empty': 'কোনো পেআউট পদ্ধতি কনফিগার করা হয়নি',
  'settings.save': 'পরিবর্তন সংরক্ষণ করুন',
  'settings.saving': 'সংরক্ষণ হচ্ছে...',
};

const DICTS: Record<Locale, I18nDict> = { en, bn, es: en, fr: en, de: en, ja: en, 'zh-CN': en };

export function translate(key: string, locale: Locale): string {
  return DICTS[locale]?.[key] ?? DICTS.en[key] ?? key;
}

export function useI18n(locale: Locale = 'en') {
  return useMemo(() => ({ t: (key: string) => translate(key, locale) }), [locale]);
}
