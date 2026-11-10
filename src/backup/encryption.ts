import { z } from 'zod';
import { canonicalize } from './canonicalize';
const schema = z
  .object({
    format: z.literal('papyrus-encrypted-backup'),
    version: z.literal(1),
    cipher: z.literal('AES-256-GCM'),
    kdf: z.literal('PBKDF2-SHA256'),
    iterations: z.literal(600000),
    salt: z.string().max(100),
    nonce: z.string().max(100),
    contentType: z.enum(['application/json', 'application/zip']),
    ciphertext: z.string().max(90 * 1024 * 1024),
  })
  .strict();
function encode(bytes: Uint8Array) {
  let str = '';
  for (let i = 0; i < bytes.length; i += 32768)
    str += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(str);
}
function decode(str: string) {
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
}
async function key(password: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: new Uint8Array(salt), iterations: 600000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
export async function encryptBackup(
  bytes: Uint8Array,
  password: string,
  contentType: 'application/json' | 'application/zip',
) {
  if (password.length < 10) throw Error('Use a backup password of at least 10 characters.');
  const salt = crypto.getRandomValues(new Uint8Array(16)),
    nonce = crypto.getRandomValues(new Uint8Array(12));
  const metadata = {
    format: 'papyrus-encrypted-backup' as const,
    version: 1 as const,
    cipher: 'AES-256-GCM' as const,
    kdf: 'PBKDF2-SHA256' as const,
    iterations: 600000 as const,
    salt: encode(salt),
    nonce: encode(nonce),
    contentType,
  };
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: nonce,
      additionalData: new TextEncoder().encode(canonicalize(metadata)),
      tagLength: 128,
    },
    await key(password, salt),
    new Uint8Array(bytes),
  );
  return { ...metadata, ciphertext: encode(new Uint8Array(ciphertext)) };
}
export async function decryptBackup(input: unknown, password: string) {
  const parsed = schema.parse(input);
  const { ciphertext, ...metadata } = parsed;
  const salt = decode(parsed.salt),
    nonce = decode(parsed.nonce);
  if (salt.length !== 16 || nonce.length !== 12) throw Error('Invalid encryption parameters.');
  try {
    const result = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: nonce,
        additionalData: new TextEncoder().encode(canonicalize(metadata)),
        tagLength: 128,
      },
      await key(password, salt),
      decode(ciphertext),
    );
    return { bytes: new Uint8Array(result), contentType: parsed.contentType };
  } catch {
    throw Error('Incorrect password or corrupted encrypted backup. No data was changed.');
  }
}
