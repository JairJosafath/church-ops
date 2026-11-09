/** The song page's song form: title, authors, CCLI number and tags, read for the api. */
import type { SongChange } from './api_client';
import type { Song } from './api_types';

export interface SongFormFields {
  readonly title: string;
  readonly authors: string;
  readonly ccli: string;
  /** Tags as typed, separated by commas: "hymn, advent". */
  readonly tags: string;
}

export type SongFormResult =
  | { readonly ok: true; readonly song: SongChange }
  | { readonly ok: false; readonly errors: { readonly title: string } };

/** Reads "hymn, Advent ,, hymn" as ["hymn", "Advent"]: trimmed, once each whatever the case. */
export function parseTags(text: string): string[] {
  const seen = new Set<string>();
  return text
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => {
      const folded = tag.toLocaleLowerCase();
      if (tag === '' || seen.has(folded)) {
        return false;
      }
      seen.add(folded);
      return true;
    });
}

/** Reads the form into the song's fields, or says what to fix. */
export function parseSongForm(fields: SongFormFields): SongFormResult {
  const title = fields.title.trim();
  if (title === '') {
    return { ok: false, errors: { title: 'Give the song a title.' } };
  }
  const ccli = fields.ccli.trim();
  return {
    ok: true,
    song: {
      title,
      authors: fields.authors.trim(),
      ccli: ccli === '' ? null : ccli,
      tags: parseTags(fields.tags),
    },
  };
}

/** The form's fields for editing `song`. */
export function songFormFields(song: Song): SongFormFields {
  return {
    title: song.title,
    authors: song.authors,
    ccli: song.ccli ?? '',
    tags: song.tags.join(', '),
  };
}

/** "6 times", "Once", "Not at all": how often a song was played. */
export function formatTimesUsed(count: number): string {
  switch (count) {
    case 0:
      return 'Not at all';
    case 1:
      return 'Once';
    default:
      return `${String(count)} times`;
  }
}
