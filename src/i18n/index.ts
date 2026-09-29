import { SITE, type Locale } from '@/config/site';
import es from './es.json';
import en from './en.json';

export type Dictionary = typeof es;

const dictionaries: Record<Locale, Dictionary> = { es, en };

/** Dotted paths to every string leaf of the dictionary, e.g. "home.hero.title". */
type Leaves<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type TranslationKey = Leaves<Dictionary>;

export const locales: readonly Locale[] = SITE.locales;
export const defaultLocale: Locale = SITE.defaultLocale;

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

function lookup(dict: Dictionary, key: string): string | undefined {
  let node: unknown = dict;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/** Returns a translator bound to a locale. Falls back to Spanish, then to the key itself. */
export function getTranslator(locale: Locale) {
  return function t(key: TranslationKey): string {
    return lookup(dictionaries[locale], key) ?? lookup(dictionaries[defaultLocale], key) ?? key;
  };
}

import { localizePath } from './paths';

export { localizePath };

/** Splits "/es/learn/x" into { locale: "es", path: "/learn/x" }. */
export function parsePath(pathname: string): { locale: Locale | undefined; path: string } {
  const [, first = '', ...rest] = pathname.split('/');
  if (isLocale(first)) {
    const path = `/${rest.join('/')}`.replace(/\/+$/, '') || '/';
    return { locale: first, path };
  }
  return { locale: undefined, path: pathname || '/' };
}

/** Same page in another locale (used by the language selector). */
export function switchLocalePath(pathname: string, target: Locale): string {
  return localizePath(target, parsePath(pathname).path);
}

/** Picks the best supported locale from the browser's preference list. */
export function pickLocale(preferred: readonly string[]): Locale {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return defaultLocale;
}

/** Locale of the page being rendered, from its URL (used by components inside MDX). */
export function localeFromUrl(url: URL): Locale {
  return parsePath(url.pathname).locale ?? defaultLocale;
}

/** Replaces {name} placeholders: format('{n} min', { n: 5 }) → '5 min'. */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
