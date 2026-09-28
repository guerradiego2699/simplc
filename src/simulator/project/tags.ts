/**
 * Variable table: validation and operand resolution (tag name or direct address → address).
 * IEC 61131-3 identifiers are case-insensitive, so lookups ignore case.
 */
import { normalizeAddress } from '@/simulator/engine';
import { newId } from '@/simulator/languages/ladder/model';
import type { Tag } from './types';

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type TagProblem = 'INVALID_TAG_NAME' | 'DUPLICATE_TAG' | 'INVALID_TAG_ADDRESS';

export const tag = (name: string, address: string, comment = ''): Tag => ({
  id: newId('t'),
  name,
  address,
  comment,
});

/** A name is valid if it is an identifier and cannot be confused with an address. */
export function isValidTagName(name: string): boolean {
  return IDENTIFIER.test(name) && normalizeAddress(name) === null;
}

/** Problems of each tag, by tag id (empty map = table is valid). */
export function validateTags(tags: readonly Tag[]): Map<string, TagProblem[]> {
  const problems = new Map<string, TagProblem[]>();
  const add = (id: string, p: TagProblem) => problems.set(id, [...(problems.get(id) ?? []), p]);
  const seen = new Map<string, string>();

  for (const t of tags) {
    if (!isValidTagName(t.name)) add(t.id, 'INVALID_TAG_NAME');
    const key = t.name.toUpperCase();
    const first = seen.get(key);
    if (first !== undefined) {
      add(t.id, 'DUPLICATE_TAG');
      if (!problems.get(first)?.includes('DUPLICATE_TAG')) add(first, 'DUPLICATE_TAG');
    } else {
      seen.set(key, t.id);
    }
    if (normalizeAddress(t.address) === null) add(t.id, 'INVALID_TAG_ADDRESS');
  }
  return problems;
}

export type Resolution =
  | { ok: true; address: string; tag?: Tag }
  | { ok: false; problem: 'MISSING_OPERAND' | 'UNKNOWN_SYMBOL' };

/** Resolves what the user typed in an element: a direct address or a tag name. */
export function resolveOperand(operand: string, tags: readonly Tag[]): Resolution {
  const text = operand.trim();
  if (text === '') return { ok: false, problem: 'MISSING_OPERAND' };
  const direct = normalizeAddress(text);
  if (direct) {
    const known = tags.find((t) => normalizeAddress(t.address) === direct);
    return known ? { ok: true, address: direct, tag: known } : { ok: true, address: direct };
  }
  const upper = text.toUpperCase();
  const found = tags.find((t) => t.name.toUpperCase() === upper);
  const address = found && normalizeAddress(found.address);
  return address && found
    ? { ok: true, address, tag: found }
    : { ok: false, problem: 'UNKNOWN_SYMBOL' };
}

/** Tag for an address, if the table has one (for showing symbols next to addresses). */
export function tagForAddress(address: string, tags: readonly Tag[]): Tag | undefined {
  const canonical = normalizeAddress(address);
  return canonical ? tags.find((t) => normalizeAddress(t.address) === canonical) : undefined;
}
