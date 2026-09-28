import type { TranslationKey } from '@/i18n';

export interface NavItem {
  /** Locale-less path, e.g. "/learn". */
  path: string;
  label: TranslationKey;
}

/** Top-level sections shown in the header. */
export const MAIN_NAV: readonly NavItem[] = [
  { path: '/learn', label: 'nav.learn' },
  { path: '/brands', label: 'nav.brands' },
  { path: '/simulator', label: 'nav.simulator' },
  { path: '/examples', label: 'nav.examples' },
  { path: '/challenges', label: 'nav.challenges' },
];

/** Secondary links shown only in the footer. */
export const FOOTER_NAV: readonly NavItem[] = [
  { path: '/glossary', label: 'nav.glossary' },
  { path: '/faq', label: 'nav.faq' },
  { path: '/support', label: 'nav.support' },
];

/**
 * Sections that still render the "under construction" page.
 * Remove a slug from here when its real page is created in a later phase.
 */
export const PLACEHOLDER_SECTIONS = [
  'learn',
  'brands',
  'simulator',
  'examples',
  'challenges',
  'glossary',
  'faq',
  'support',
] as const;
