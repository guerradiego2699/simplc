/**
 * URL helpers that do not load the dictionaries (safe to import from client islands).
 */
import type { Locale } from '@/config/site';

/** Builds a locale-prefixed URL. `path` is locale-less, e.g. "/" or "/learn". */
export function localizePath(locale: Locale, path = '/'): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return clean === '/' ? `/${locale}/` : `/${locale}${clean}`;
}
