import type { Nodepod, VolumeSnapshot } from '@r1ck404/nodepod';

interface FileVolumeEntry {
  path: string;
  kind: 'file';
  data?: string;
  mtimeMs?: number;
}

interface DirectoryVolumeEntry {
  path: string;
  kind: 'directory';
  mtimeMs?: number;
}

interface SymlinkVolumeEntry {
  path: string;
  kind: 'symlink';
  target: string;
}

type LocalVolumeEntry = FileVolumeEntry | DirectoryVolumeEntry | SymlinkVolumeEntry;
export interface ZipOptions {
  pathPrefix?: string;
}

function isUnderPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function relativeEntryPath(path: string, prefix?: string): string {
  if (prefix && path.startsWith(`${prefix}/`)) {
    return path.slice(prefix.length + 1);
  }

  return path.startsWith('/') ? path.slice(1) : path;
}

const SIG_LFH = 0x04034b50;
const SIG_CDH = 0x02014b50;
const SIG_EOCD = 0x06054b50;

let crcTable: Uint32Array | undefined;

function getCrcTable(): Uint32Array {
  if (crcTable) {
    return crcTable;
  }

  const table = new Uint32Array(256);

  for (let i = 0; i < 256; i++) {
    let crc = i;

    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }

    table[i] = crc >>> 0;
  }

  crcTable = table;

  return table;
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeBase64(input: string): Uint8Array {
  const lookup = new Int8Array(128);

  for (let i = 0; i < BASE64_ALPHABET.length; i++) {
    lookup[BASE64_ALPHABET.charCodeAt(i)] = i;
  }

  const cleaned = input.replace(/=+$/, '');
  const outputLength = Math.floor((cleaned.length * 6) / 8);
  const bytes = new Uint8Array(outputLength);
  let byteIndex = 0;
  let buffer = 0;
  let bits = 0;

  for (let i = 0; i < cleaned.length; i++) {
    const lookupIndex = lookup[cleaned.charCodeAt(i)];

    if (lookupIndex < 0) {
      throw new Error('Invalid base64 input');
    }

    buffer = (buffer << 6) | lookupIndex;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      bytes[byteIndex++] = (buffer >> bits) & 0xff;
    }
  }

  return bytes;
}

function crc32(bytes: Uint8Array): number {
  const table = getCrcTable();
  let crc = 0xffffffff;

  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ bytes[i]) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(timestamp: number): { date: number; time: number } {
  if (!Number.isFinite(timestamp)) {
    return { date: 0, time: 0 };
  }

  const date = new Date(timestamp);

  return {
    date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
  };
}

interface WrittenFile {
  name: Uint8Array;
  bytes: Uint8Array;
  crc: number;
  size: number;
  modified: number;
  externalAttrs: number;
}

function writeFilesFromSnapshot(snapshot: VolumeSnapshot, prefix?: string): WrittenFile[] {
  const out: WrittenFile[] = [];

  for (const candidate of snapshot.entries as LocalVolumeEntry[]) {
    if (candidate.kind !== 'file' && candidate.kind !== 'directory') {
      continue;
    }

    if (prefix && !isUnderPrefix(candidate.path, prefix)) {
      continue;
    }

    const name = relativeEntryPath(candidate.path, prefix);

    if (candidate.kind === 'file') {
      const raw = candidate.data ? decodeBase64(candidate.data) : new Uint8Array();

      out.push({
        name: encodeName(name),
        bytes: raw,
        crc: crc32(raw),
        size: raw.length,
        modified: candidate.mtimeMs ?? Date.now(),
        externalAttrs: 0o644 << 16,
      });
    } else {
      out.push({
        name: encodeName(name),
        bytes: new Uint8Array(0),
        crc: 0,
        size: 0,
        modified: candidate.mtimeMs ?? Date.now(),
        externalAttrs: 0o755 << 16,
      });
    }
  }

  return out;
}

function encodeName(name: string): Uint8Array {
  return new TextEncoder().encode(name.replaceAll('\\', '/').replace(/^\/+/, ''));
}

function buildZip(files: WrittenFile[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localSize = 0;

  for (const file of files) {
    const { date, time } = dosDateTime(file.modified);
    const local = new Uint8Array(30 + file.name.length + file.bytes.length);
    const localView = new DataView(local.buffer);

    localView.setUint32(0, SIG_LFH, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, time, true);
    localView.setUint16(12, date, true);
    localView.setUint32(14, file.crc, true);
    localView.setUint32(18, file.size, true);
    localView.setUint32(22, file.name.length, true);
    localView.setUint32(26, 0, true);
    local.set(file.name, 30);
    local.set(file.bytes, 30 + file.name.length);

    localParts.push(local);

    const central = new Uint8Array(46 + file.name.length);
    const centralView = new DataView(central.buffer);

    centralView.setUint32(0, SIG_CDH, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, time, true);
    centralView.setUint16(14, date, true);
    centralView.setUint32(16, file.crc, true);
    centralView.setUint32(20, file.size, true);
    centralView.setUint32(24, file.name.length, true);
    centralView.setUint32(28, 0, true);
    centralView.setUint32(32, 0, true);
    centralView.setUint32(36, file.externalAttrs >>> 0, true);
    centralView.setUint32(40, 0, true);
    central.set(file.name, 46);

    centralParts.push(central);

    localSize += local.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);

  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);

  eocdView.setUint32(0, SIG_EOCD, true);
  eocdView.setUint16(4, 0, true);
  eocdView.setUint16(6, 0, true);
  eocdView.setUint16(8, files.length, true);
  eocdView.setUint16(10, files.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, localSize, true);
  eocdView.setUint16(20, 0, true);

  const buffer = new Uint8Array(localSize + centralSize + eocd.length);
  let cursor = 0;

  for (const part of localParts) {
    buffer.set(part, cursor);
    cursor += part.length;
  }

  for (const part of centralParts) {
    buffer.set(part, cursor);
    cursor += part.length;
  }

  buffer.set(eocd, cursor);

  return buffer;
}

export function serializeSnapshotToZip(snapshot: VolumeSnapshot, opts: ZipOptions = {}): Uint8Array {
  return buildZip(writeFilesFromSnapshot(snapshot, opts.pathPrefix));
}

export async function exportSnapshotAsZip(pod: Nodepod, opts: ZipOptions = {}): Promise<Uint8Array> {
  const snapshot = await pod.snapshot({ shallow: true, autoInstall: true });

  return serializeSnapshotToZip(snapshot, { pathPrefix: pod.cwd, ...opts });
}
