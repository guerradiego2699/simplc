import { describe, expect, it } from 'vitest';
import es from './es.json';
import en from './en.json';
import {
  isLocale,
  localizePath,
  parsePath,
  pickLocale,
  switchLocalePath,
  getTranslator,
} from './index';

function keysOf(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? keysOf(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe('dictionaries', () => {
  it('es and en have exactly the same keys', () => {
    expect(keysOf(en).sort()).toEqual(keysOf(es).sort());
  });

  it('has no empty strings', () => {
    for (const dict of [es, en]) {
      const empty = keysOf(dict).filter((k) => {
        const value = k
          .split('.')
          .reduce<unknown>((n, p) => (n as Record<string, unknown>)[p], dict);
        return typeof value !== 'string' || value.trim() === '';
      });
      expect(empty).toEqual([]);
    }
  });
});

describe('getTranslator', () => {
  it('translates by dotted key', () => {
    expect(getTranslator('es')('nav.learn')).toBe('Aprender');
    expect(getTranslator('en')('nav.learn')).toBe('Learn');
  });
});

describe('paths', () => {
  it('localizes paths', () => {
    expect(localizePath('es')).toBe('/es/');
    expect(localizePath('en', '/learn')).toBe('/en/learn');
    expect(localizePath('en', 'learn')).toBe('/en/learn');
  });

  it('parses locale-prefixed paths', () => {
    expect(parsePath('/es/')).toEqual({ locale: 'es', path: '/' });
    expect(parsePath('/en/learn/scan-cycle/')).toEqual({ locale: 'en', path: '/learn/scan-cycle' });
    expect(parsePath('/other')).toEqual({ locale: undefined, path: '/other' });
  });

  it('switches locale keeping the current page', () => {
    expect(switchLocalePath('/es/learn/what-is-a-plc', 'en')).toBe('/en/learn/what-is-a-plc');
    expect(switchLocalePath('/en/', 'es')).toBe('/es/');
  });
});

describe('locale detection', () => {
  it('picks the first supported browser language', () => {
    expect(pickLocale(['en-US', 'es'])).toBe('en');
    expect(pickLocale(['es-CL'])).toBe('es');
    expect(pickLocale(['fr-FR', 'en-GB'])).toBe('en');
  });

  it('falls back to Spanish', () => {
    expect(pickLocale(['de-DE'])).toBe('es');
    expect(pickLocale([])).toBe('es');
  });

  it('validates locales', () => {
    expect(isLocale('es')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});
