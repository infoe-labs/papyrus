import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { domainFromEnvelope, validateData, validateJournal } from './validate';
import { envelopeSchema, LIMITS } from './schema';
import { payloadHash, sha256 } from './checksum';
import { jsonData } from './canonicalize';
import type { BackupEnvelope, MediaEntry, ValidatedBackup } from './types';
function base64(bytes: Uint8Array) {
  let result = '';
  for (let i = 0; i < bytes.length; i += 32768)
    result += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(result);
}
function imageBytes(data: string) {
  const match = data.match(/^(data:(image\/[a-z0-9.+-]+);base64,)([A-Za-z0-9+/=]+)$/i);
  if (!match)
    throw Error('Unsupported attachment encoding. Keep the original data and contact support.');
  const bytes = Uint8Array.from(atob(match[3]), (c) => c.charCodeAt(0));
  if (bytes.length > 16 * 1024 * 1024) throw Error('An attachment exceeds 16 MB.');
  return { bytes, prefix: match[1], mime: match[2] };
}
export async function archiveBackup(input: BackupEnvelope) {
  const envelope = jsonData(input);
  const files: Record<string, Uint8Array> = {};
  const manifest: MediaEntry[] = [];
  async function store(id: string, kind: MediaEntry['kind'], data: string) {
    const { bytes, prefix, mime } = imageBytes(data);
    const path = 'media/' + (await sha256(strToU8(kind + ':' + id))) + '.bin';
    manifest.push({
      id,
      kind,
      path,
      sha256: await sha256(bytes),
      size: bytes.length,
      mime,
      prefix,
    });
    files[path] = bytes;
    return 'archive:' + path;
  }
  for (const record of envelope.payload.media)
    record.data = await store(record.id, 'media', record.data);
  for (const child of envelope.payload.children)
    if (child.photo) child.photo = await store(child.id, 'child-photo', child.photo);
  envelope.payload.mediaManifest = manifest;
  envelope.payloadHash = await payloadHash(envelope.payload);
  files['backup.json'] = strToU8(
    JSON.stringify({ archiveFormat: 'papyrus-media', archiveVersion: 1, envelope }),
  );
  return { envelope, bytes: zipSync(files, { level: 0 }) };
}
export async function inspectArchive(bytes: Uint8Array): Promise<ValidatedBackup> {
  let total = 0;
  const seen = new Set<string>();
  const entries = unzipSync(bytes, {
    filter: (file) => {
      if (seen.has(file.name)) throw Error('Duplicate archive entry.');
      seen.add(file.name);
      if (file.name !== 'backup.json' && !/^media\/[a-f0-9]{64}\.bin$/.test(file.name))
        throw Error('Unsafe or unexpected archive path.');
      if (file.compression !== 0)
        throw Error(
          'Compressed media archives are unsupported. Select the original Papyrus stored ZIP archive.',
        );
      total += file.originalSize;
      if (total > LIMITS.uncompressedBytes || file.originalSize > LIMITS.fileBytes)
        throw Error('Expanded archive exceeds the resource limit.');
      return true;
    },
  });
  if (!entries['backup.json']) throw Error('Archive has no backup manifest.');
  const wrapper = JSON.parse(strFromU8(entries['backup.json']));
  if (Object.keys(wrapper).sort().join(',') !== 'archiveFormat,archiveVersion,envelope')
    throw Error('Unsupported future archive fields.');
  if (wrapper.archiveFormat !== 'papyrus-media' || wrapper.archiveVersion !== 1)
    throw Error('Unsupported media archive version.');
  const envelope = envelopeSchema.parse(wrapper.envelope) as BackupEnvelope;
  if ((await payloadHash(envelope.payload)) !== envelope.payloadHash)
    throw Error('Backup checksum mismatch.');
  validateJournal(envelope);
  const data = jsonData(domainFromEnvelope(envelope));
  const paths = new Set<string>(['backup.json']);
  const identities = new Set<string>();
  for (const item of envelope.payload.mediaManifest) {
    if (paths.has(item.path) || identities.has(item.kind + ':' + item.id))
      throw Error('Duplicate attachment in manifest.');
    paths.add(item.path);
    identities.add(item.kind + ':' + item.id);
    const content = entries[item.path];
    if (!content || content.length !== item.size || (await sha256(content)) !== item.sha256)
      throw Error('Attachment checksum mismatch or missing media.');
    const reconstructed = item.prefix + base64(content);
    if (item.kind === 'media') {
      const record = data.media.find((r) => r.id === item.id);
      if (!record || record.data !== 'archive:' + item.path)
        throw Error('Orphaned media manifest reference.');
      record.data = reconstructed;
    } else {
      const record = data.children.find((c) => c.id === item.id);
      if (!record || record.photo !== 'archive:' + item.path)
        throw Error('Orphaned profile photo.');
      record.photo = reconstructed;
    }
  }
  if (Object.keys(entries).some((path) => !paths.has(path)))
    throw Error('Unmapped archive entries.');
  validateData(data);
  return {
    envelope,
    data,
    changeJournal: envelope.payload.changeJournal,
    legacy: false,
    warnings: [],
  };
}
