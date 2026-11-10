/** papyrus-json-v1: JSON primitives only, finite numbers, no sparse arrays, plain objects,
 * own keys sorted by UTF-16 code units, JSON.stringify primitive escaping/number formatting.
 * Object undefined is rejected, never dropped. Maximum 64 nesting levels. No Unicode normalization.
 */
export function canonicalize(value: unknown, depth = 0): string {
  if (depth > 64) throw Error('Backup nesting exceeds 64 levels.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw Error('Non-finite number in backup.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length)
      throw Error('Sparse or extended arrays are unsupported.');
    return '[' + value.map((v) => canonicalize(v, depth + 1)).join(',') + ']';
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  ) {
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map(
          (k) =>
            JSON.stringify(k) +
            ':' +
            canonicalize((value as Record<string, unknown>)[k], depth + 1),
        )
        .join(',') +
      '}'
    );
  }
  throw Error('Backup contains a non-JSON value.');
}
// IndexedDB records may have optional undefined properties. Match JSON serialization deliberately.
export function jsonData<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => {
      if (typeof v === 'number' && !Number.isFinite(v)) throw Error('Invalid numeric value.');
      if (typeof v === 'bigint') throw Error('BigInt is not a supported storage value.');
      return v;
    }),
  ) as T;
}
