/**
 * Single source of truth for site-wide settings.
 * The project name is still provisional: change it ONLY here.
 */
export const SITE = {
  name: 'SimPLC',
  /** Public URL (without trailing slash). Update when the domain is purchased. */
  url: 'https://example.com',
  defaultLocale: 'es',
  locales: ['es', 'en'],
  /** Donation links (section 10). Empty string = hidden. */
  donations: {
    koFi: '',
    buyMeACoffee: '',
    mercadoPago: '',
  },
  /** Feature flags for future monetization. Keep disabled for now. */
  features: {
    ads: false,
  },
} as const;

export type Locale = (typeof SITE.locales)[number];
