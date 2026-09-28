import { getCollection, type CollectionEntry } from 'astro:content';
import { LEARN_TOPICS, readingMinutes, type LearnGroup, type LearnSlug } from '@/config/learn';
import { defaultLocale } from '@/i18n';
import type { Locale } from '@/config/site';

export interface LearnPage {
  slug: LearnSlug;
  group: LearnGroup;
  entry: CollectionEntry<'learn'>;
  minutes: number;
  /** True when this locale has no translation and the Spanish text is shown instead. */
  isFallback: boolean;
}

export interface LearnTopic {
  slug: LearnSlug;
  group: LearnGroup;
  page: LearnPage | undefined;
}

function splitId(id: string): { locale: string; slug: string } {
  const [locale = '', ...rest] = id.split('/');
  return { locale, slug: rest.join('/') };
}

/** Every topic of the course for a locale, in reading order, with its page if written. */
export async function getLearnTopics(locale: Locale): Promise<LearnTopic[]> {
  const entries = await getCollection('learn');
  const find = (l: string, slug: string) =>
    entries.find((e) => {
      const id = splitId(e.id);
      return id.locale === l && id.slug === slug;
    });

  return LEARN_TOPICS.map(({ slug, group }) => {
    const own = find(locale, slug);
    const entry = own ?? find(defaultLocale, slug);
    const page: LearnPage | undefined = entry && {
      slug,
      group,
      entry,
      minutes: readingMinutes(entry.body ?? ''),
      isFallback: !own,
    };
    return { slug, group, page };
  });
}

/** Only the topics that have a page, in reading order. */
export async function getLearnPages(locale: Locale): Promise<LearnPage[]> {
  return (await getLearnTopics(locale)).flatMap((t) => (t.page ? [t.page] : []));
}
