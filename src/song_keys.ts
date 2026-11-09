/**
 * Keys. The arrangement has a default key and a service item may set its own
 * for that week; the item's key wins. The key is never stored on the song.
 */

const KEY_PATTERN = /^[A-G][#b]?m?$/;

/** Whether `key` is a key name the api takes: "G", "Bb", "F#m". */
export function isKeyName(key: string): boolean {
  return KEY_PATTERN.test(key);
}

/** A key as typed ("bb", " f#m") with its letter in capitals ("Bb", "F#m"). */
export function normalizeKey(typed: string): string {
  const trimmed = typed.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/** The key a song item is played in: its own key, else its arrangement's. */
export function effectiveKey(itemKey: string | null, arrangementKey: string): string {
  return itemKey ?? arrangementKey;
}
