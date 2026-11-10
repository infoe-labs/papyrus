import { canonicalize } from './canonicalize';
export async function sha256(bytes: Uint8Array) {
  const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}
export function payloadHash(value: unknown) {
  return sha256(new TextEncoder().encode(canonicalize(value)));
}
