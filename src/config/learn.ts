/**
 * The "Learn" course outline (spec section 5.2), in reading order.
 * A topic becomes a real page when `src/content/learn/{es,en}/<slug>.mdx` exists;
 * until then it is listed as "coming soon" using the title in `learn.upcoming.<slug>`.
 */
export const LEARN_GROUPS = ['fundamentals', 'hardware', 'programming'] as const;
export type LearnGroup = (typeof LEARN_GROUPS)[number];

export const LEARN_TOPICS = [
  { slug: 'what-is-a-plc', group: 'fundamentals' },
  { slug: 'how-a-plc-works', group: 'fundamentals' },
  { slug: 'plc-types', group: 'fundamentals' },
  { slug: 'inputs-and-outputs', group: 'hardware' },
  { slug: 'wiring', group: 'hardware' },
  { slug: 'ports-and-communications', group: 'hardware' },
  { slug: 'memory-and-addressing', group: 'programming' },
  { slug: 'iec-61131-3-languages', group: 'programming' },
  { slug: 'basic-instructions', group: 'programming' },
  { slug: 'best-practices', group: 'programming' },
] as const satisfies readonly { slug: string; group: LearnGroup }[];

export type LearnSlug = (typeof LEARN_TOPICS)[number]['slug'];

/** Average reading speed used for the "N min read" label. */
export const WORDS_PER_MINUTE = 200;

export function readingMinutes(text: string): number {
  const words = text
    .replace(/^import .*$/gm, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[#>*_`|[\]()-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}
