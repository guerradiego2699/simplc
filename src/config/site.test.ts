import { describe, expect, it } from 'vitest';
import { SITE } from './site';

describe('site config', () => {
  it('has a name and both locales', () => {
    expect(SITE.name.length).toBeGreaterThan(0);
    expect(SITE.locales).toEqual(['es', 'en']);
    expect(SITE.locales).toContain(SITE.defaultLocale);
  });

  it('keeps ads disabled by default', () => {
    expect(SITE.features.ads).toBe(false);
  });
});
