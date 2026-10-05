/**
 * Single source of truth for site-wide settings.
 * Change the project name ONLY here.
 */
export const SITE = {
  name: 'PLCampus',
  /** Public URL (without trailing slash). */
  url: 'https://plcampus.com',
  repoUrl: 'https://github.com/guerradiego2699/simplc',
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
    /** Vercel Web Analytics (cookieless). Only loaded in builds made on Vercel. */
    analytics: true,
  },
} as const;

export type Locale = (typeof SITE.locales)[number];

/** localStorage keys (always accessed through try/catch). */
export const STORAGE_KEYS = {
  locale: 'plcampus:locale',
  theme: 'plcampus:theme',
} as const;
