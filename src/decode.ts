/**
 * Checks JSON from the api at the boundary. The page trusts no shape it did
 * not check: each decoder returns a typed value or throws a DecodeError that
 * names the path that was wrong.
 */

/** JSON that does not have the shape the contract promises. */
export class DecodeError extends Error {
  constructor(
    readonly path: string,
    expected: string,
    options?: ErrorOptions,
  ) {
    super(`${path}: expected ${expected}`, options);
    this.name = 'DecodeError';
  }
}

/** Reads `value`, found at `path`, as a T or throws a DecodeError. */
export type Decoder<T> = (value: unknown, path: string) => T;

/** Whether `value` is a plain JSON object. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const decodeString: Decoder<string> = (value, path) => {
  if (typeof value !== 'string') {
    throw new DecodeError(path, 'a string');
  }
  return value;
};

export const decodeInteger: Decoder<number> = (value, path) => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new DecodeError(path, 'an integer');
  }
  return value;
};

export const decodeBoolean: Decoder<boolean> = (value, path) => {
  if (typeof value !== 'boolean') {
    throw new DecodeError(path, 'a boolean');
  }
  return value;
};

/** A decoder that also takes null. */
export function nullable<T>(decode: Decoder<T>): Decoder<T | null> {
  return (value, path) => (value === null ? null : decode(value, path));
}

/** A decoder of an array whose every entry `decode` reads. */
export function arrayOf<T>(decode: Decoder<T>): Decoder<T[]> {
  return (value, path) => {
    if (!Array.isArray(value)) {
      throw new DecodeError(path, 'an array');
    }
    return value.map((entry: unknown, index) => decode(entry, `${path}[${String(index)}]`));
  };
}

/** A decoder of one of the strings in `values`. */
export function oneOf<const T extends string>(values: readonly T[]): Decoder<T> {
  return (value, path) => {
    const found = values.find((candidate) => candidate === value);
    if (found === undefined) {
      throw new DecodeError(path, `one of ${values.join(', ')}`);
    }
    return found;
  };
}

/** Reads `value` as a JSON object. */
export function decodeObject(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new DecodeError(path, 'an object');
  }
  return value;
}

/** Reads the field `key` of `record`, found at `path`, with `decode`. */
export function field<T>(
  record: Record<string, unknown>,
  key: string,
  decode: Decoder<T>,
  path: string,
): T {
  return decode(record[key], `${path}.${key}`);
}
