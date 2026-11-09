/**
 * Returns a copy of `list` with the entry at `from` moved to `to`, the others
 * closing up. An index outside the list moves nothing.
 */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const moved = [...list];
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) {
    return moved;
  }
  const [entry] = moved.splice(from, 1);
  if (entry !== undefined) {
    moved.splice(to, 0, entry);
  }
  return moved;
}
