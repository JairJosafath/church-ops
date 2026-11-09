/**
 * The Rehearse view's songs: each song item of a plan, in order, with its
 * chart in the key the item is played in. The chart is written in the
 * arrangement's default key, and the item's key wins (services-and-planning),
 * so the chart moves from the one to the other.
 */
import type { Arrangement, Item, ItemArrangement, Song, TeamNote } from './api_types';
import { parseChart, transposeChart, type Chart } from './chordpro';

export interface RehearsalSong {
  readonly item: Item & { readonly arrangement: ItemArrangement };
  /** The arrangement as the song library has it (notes, recording), when it was found. */
  readonly arrangement: Arrangement | undefined;
  /** The key the item is played in. */
  readonly key: string;
  /** The key the chart is written in; null when it is not known, and the chart is as written. */
  readonly writtenIn: string | null;
  /** The chart, in `key` when `writtenIn` is known. */
  readonly chart: Chart;
}

function isSongItem(item: Item): item is Item & { readonly arrangement: ItemArrangement } {
  return item.kind === 'song' && item.arrangement !== null;
}

/**
 * The plan's song items in order, each with its chart in its key. `songs` is
 * the song library, where each arrangement's default key is; null when it
 * could not be loaded.
 */
export function rehearsalSongs(
  items: readonly Item[],
  songs: readonly Song[] | null,
): RehearsalSong[] {
  const arrangements = new Map(
    (songs ?? []).flatMap((song) => song.arrangements.map((entry) => [entry.id, entry] as const)),
  );
  return [...items]
    .sort((a, b) => a.position - b.position)
    .filter(isSongItem)
    .map((item) => {
      const arrangement = arrangements.get(item.arrangement.id);
      const key = item.arrangement.key;
      // With no key of its own, the item plays the arrangement's: the chart's own key.
      const writtenIn = arrangement?.key ?? (item.key === null ? key : null);
      const chart = parseChart(item.arrangement.chart);
      return {
        item,
        arrangement,
        key,
        writtenIn,
        chart: writtenIn === null ? chart : transposeChart(chart, writtenIn, key),
      };
    });
}

/** The item's notes for the team `teamId`, or for every team when it is null. */
export function teamNotesFor(item: Item, teamId: number | null): readonly TeamNote[] {
  return item.teamNotes.filter(
    (entry) => entry.note !== '' && (teamId === null || entry.teamId === teamId),
  );
}
