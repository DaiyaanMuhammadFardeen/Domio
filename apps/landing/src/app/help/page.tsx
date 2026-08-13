/**
 * Help center index route (Wave 12 §S12.9).
 *
 * Renders the searchable Help center — categories sidebar + article
 * grid. The actual interactive surface lives in `HelpClient`, which
 * owns the search query and category filter state.
 */

import type { Metadata } from 'next';
import type { JSX } from 'react';
import { HelpClient } from './HelpClient';
import { KB_ARTICLES, KB_CATEGORIES } from '../../lib/help-data';

export const metadata: Metadata = {
  title: 'Help center — Domio',
  description:
    'Search the Domio knowledge base — articles on getting started, the editor, viewer, presenter, analytics, billing, security, and more.',
};

export default function HelpIndexPage(): JSX.Element {
  return <HelpClient initialCategories={KB_CATEGORIES} initialArticles={KB_ARTICLES} />;
}
