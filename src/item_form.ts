/** The plan page's item form: what the planner types, read into an item for the api. */
import type { ItemInput } from './api_client';
import type { Item, ItemKind } from './api_types';
import { formatLength, parseLength } from './plan_times';
import { isKeyName, normalizeKey } from './song_keys';

/** What the item form holds, as typed. */
export interface ItemFormFields {
  readonly kind: ItemKind;
  readonly title: string;
  /** "4:30", or whole minutes. */
  readonly length: string;
  /** The arrangement's id, or "" for none. */
  readonly arrangementId: string;
  /** The item's own key, or "" to play the arrangement's. */
  readonly key: string;
  readonly scene: string;
  readonly lowerThird: string;
  readonly offStream: boolean;
  readonly notes: string;
}

export type ItemFormErrors = Partial<Record<'title' | 'length' | 'arrangementId' | 'key', string>>;

export type ItemFormResult =
  | { readonly ok: true; readonly item: ItemInput }
  | { readonly ok: false; readonly errors: ItemFormErrors };

export const ITEM_KIND_LABELS: Readonly<Record<ItemKind, string>> = {
  song: 'Song',
  reading: 'Reading',
  sermon: 'Sermon',
  prayer: 'Prayer',
  video: 'Video',
  announcement: 'Announcement',
  header: 'Header',
};

function orNull(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === '' ? null : trimmed;
}

/** The form's fields for editing `item`, or for a new item when it is null. */
export function itemFormFields(item: Item | null): ItemFormFields {
  if (item === null) {
    return {
      kind: 'song',
      title: '',
      length: '',
      arrangementId: '',
      key: '',
      scene: '',
      lowerThird: '',
      offStream: false,
      notes: '',
    };
  }
  return {
    kind: item.kind,
    title: item.title,
    length: formatLength(item.lengthSeconds),
    arrangementId: item.arrangement === null ? '' : String(item.arrangement.id),
    key: item.key ?? '',
    scene: item.scene ?? '',
    lowerThird: item.lowerThird ?? '',
    offStream: item.offStream,
    notes: item.notes,
  };
}

/**
 * Reads the form into an item, or says what to fix. Only a song names an
 * arrangement and a key; a header may leave its length blank and takes no time.
 */
export function parseItemForm(fields: ItemFormFields): ItemFormResult {
  const errors: ItemFormErrors = {};
  const isSong = fields.kind === 'song';
  const title = fields.title.trim();
  if (title === '') {
    errors.title = 'Give the item a title.';
  }
  const lengthSeconds =
    fields.kind === 'header' && fields.length.trim() === '' ? 0 : parseLength(fields.length);
  if (lengthSeconds === null) {
    errors.length = 'Give a length such as 4:30, or minutes.';
  }
  const arrangementId = /^[1-9]\d*$/.test(fields.arrangementId)
    ? Number(fields.arrangementId)
    : null;
  if (isSong && arrangementId === null) {
    errors.arrangementId = 'Choose the arrangement the band plays.';
  }
  const key = orNull(normalizeKey(fields.key));
  if (isSong && key !== null && !isKeyName(key)) {
    errors.key = 'Use a key such as G, Bb or F#m, or leave it blank.';
  }
  if (lengthSeconds === null || Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    item: {
      kind: fields.kind,
      title,
      lengthSeconds,
      arrangementId: isSong ? arrangementId : null,
      key: isSong ? key : null,
      scene: orNull(fields.scene),
      lowerThird: orNull(fields.lowerThird),
      offStream: fields.offStream,
      notes: fields.notes,
    },
  };
}
