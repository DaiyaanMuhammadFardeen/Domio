import { EN_STOPWORDS } from './en.js';
import { BN_STOPWORDS } from './bn.js';
import { ES_STOPWORDS } from './es.js';

export type SupportedLocale = 'en' | 'bn' | 'es';

export function getStopwords(locale: SupportedLocale): ReadonlySet<string> {
  switch (locale) {
    case 'en':
      return EN_STOPWORDS;
    case 'bn':
      return BN_STOPWORDS;
    case 'es':
      return ES_STOPWORDS;
  }
}

export function getCombinedStopwords(locales: ReadonlyArray<SupportedLocale>): ReadonlySet<string> {
  const out = new Set<string>();
  for (const locale of locales) {
    const set = getStopwords(locale);
    for (const w of set) out.add(w);
  }
  return out;
}

export { EN_STOPWORDS, BN_STOPWORDS, ES_STOPWORDS };