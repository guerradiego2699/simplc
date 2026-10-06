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
  /**
   * Google AdSense (spec section 10), prepared but OFF. To turn it on: set `features.ads` to true,
   * fill `client` ("ca-pub-…") and the slot ids from the AdSense account. Ads only appear on
   * content pages (max one per page, with reserved height), never in the simulator or challenges,
   * and only after the cookie notice has been answered.
   */
  ads: {
    client: '',
    slots: {
      /** Responsive slot shown after the main content of lessons, examples, glossary and FAQ. */
      content: '',
    },
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
  /** Answer to the cookie notice ('personalized' | 'non-personalized'); only used with ads on. */
  consent: 'plcampus:consent',
} as const;

/** True when ads are switched on AND configured (a client id is set). */
export const adsEnabled = (): boolean => SITE.features.ads && SITE.ads.client.trim() !== '';
