// ============================================
// TransferVault Daemon — ZIP Stream (ZIP64)
// Streaming ZIP archive creation with full ZIP64
// support for files larger than 4 GB.
// ============================================

import fs from 'node:fs';
import { Readable } from 'node:stream';

interface ZipFileEntry {
  sourcePath: string;
  archivePath: string;
}

// ── CRC-32 lookup table ───────────────────────

const CRC_TABLE = new Uint32Array(256);

for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c >>> 0;
}

function updateCrc32(previous: number, chunk: Buffer): number {
  let crc = previous;
  for (const byte of chunk) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return crc >>> 0;
}

// ── DOS date/time encoding ────────────────────

function dosDateTime(date = new Date()): { date: number; time: number } {
  const year = Math.max(date.getFullYear(), 1980);
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  };
}

// ── ZIP64-aware record builders ───────────────

/**
 * Local file header (30 bytes + filename + 20 bytes ZIP64 extra).
 *
 * Always includes a ZIP64 extended information extra field so the
 * trailing data descriptor uses 8-byte sizes — required for files > 4 GB.
 */
function localFileHeader(filename: Buffer): Buffer {
  const { date, time } = dosDateTime();

  // ZIP64 extended information extra field (sizes = 0; actual values in data descriptor)
  const zip64Extra = Buffer.alloc(20);
  zip64Extra.writeUInt16LE(0x0001, 0); // ZIP64 extra field header ID
  zip64Extra.writeUInt16LE(16, 2);     // data size: 8 (uncompressed) + 8 (compressed)
  // remaining 16 bytes are 0 (filled by data descriptor)

  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);    // local file header signature
  header.writeUInt16LE(45, 4);            // version needed to extract (4.5 = ZIP64)
  header.writeUInt16LE(0x0808, 6);        // flags: UTF-8 filenames + data descriptor
  header.writeUInt16LE(0, 8);             // compression method: stored (no compression)
  header.writeUInt16LE(time, 10);
  header.writeUInt16LE(date, 12);
  header.writeUInt32LE(0, 14);            // CRC-32: 0 (data descriptor follows)
  header.writeUInt32LE(0xFFFFFFFF, 18);   // compressed size: see ZIP64 extra field
  header.writeUInt32LE(0xFFFFFFFF, 22);   // uncompressed size: see ZIP64 extra field
  header.writeUInt16LE(filename.length, 26);
  header.writeUInt16LE(zip64Extra.length, 28);

  return Buffer.concat([header, filename, zip64Extra]);
}

/**
 * ZIP64 data descriptor (24 bytes).
 * Uses 8-byte sizes to correctly represent files larger than 4 GB.
 */
function dataDescriptor(crc: number, size: number): Buffer {
  const buf = Buffer.alloc(24);
  buf.writeUInt32LE(0x08074b50, 0);       // data descriptor signature
  buf.writeUInt32LE(crc >>> 0, 4);        // CRC-32
  buf.writeBigUInt64LE(BigInt(size), 8);  // compressed size (64-bit)
  buf.writeBigUInt64LE(BigInt(size), 16); // uncompressed size (same — stored, no compression)
  return buf;
}

/**
 * Central directory file header (46 bytes + filename + 28 bytes ZIP64 extra).
 */
function centralDirectoryHeader(entry: {
  filename: Buffer;
  crc: number;
  size: number;
  offset: number;
}): Buffer {
  const { date, time } = dosDateTime();

  // ZIP64 extra: uncompressed(8) + compressed(8) + local header offset(8)
  const zip64Extra = Buffer.alloc(28);
  zip64Extra.writeUInt16LE(0x0001, 0);
  zip64Extra.writeUInt16LE(24, 2);
  zip64Extra.writeBigUInt64LE(BigInt(entry.size), 4);    // uncompressed
  zip64Extra.writeBigUInt64LE(BigInt(entry.size), 12);   // compressed
  zip64Extra.writeBigUInt64LE(BigInt(entry.offset), 20); // local header offset

  // Use 0xFFFFFFFF placeholders when values exceed 32-bit range
  const size32 = entry.size > 0xFFFFFFFE ? 0xFFFFFFFF : entry.size;
  const offset32 = entry.offset > 0xFFFFFFFE ? 0xFFFFFFFF : entry.offset;

  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);        // central directory header signature
  header.writeUInt16LE(45, 4);                // version made by (4.5)
  header.writeUInt16LE(45, 6);                // version needed to extract (4.5)
  header.writeUInt16LE(0x0808, 8);            // flags: UTF-8 + data descriptor
  header.writeUInt16LE(0, 10);                // compression: stored
  header.writeUInt16LE(time, 12);
  header.writeUInt16LE(date, 14);
  header.writeUInt32LE(entry.crc >>> 0, 16);  // CRC-32
  header.writeUInt32LE(size32 >>> 0, 20);     // compressed size
  header.writeUInt32LE(size32 >>> 0, 24);     // uncompressed size
  header.writeUInt16LE(entry.filename.length, 28);
  header.writeUInt16LE(zip64Extra.length, 30); // extra field length
  header.writeUInt16LE(0, 32);                // file comment length
  header.writeUInt16LE(0, 34);                // disk number start
  header.writeUInt16LE(0, 36);                // internal file attributes
  header.writeUInt32LE(0, 38);                // external file attributes
  header.writeUInt32LE(offset32 >>> 0, 42);   // relative offset of local header

  return Buffer.concat([header, entry.filename, zip64Extra]);
}

/**
 * ZIP64 End of Central Directory Record (56 bytes)
 * + ZIP64 End of Central Directory Locator (20 bytes)
 * + Standard End of Central Directory Record (22 bytes).
 */
function endOfCentralDirectory(
  fileCount: number,
  centralSize: number,
  centralOffset: number,
): Buffer {
  // ── ZIP64 End of Central Directory Record (56 bytes) ──
  const zip64Eocd = Buffer.alloc(56);
  zip64Eocd.writeUInt32LE(0x06064b50, 0);                  // signature
  zip64Eocd.writeBigUInt64LE(BigInt(44), 4);                // size of remaining record (56 - 12)
  zip64Eocd.writeUInt16LE(45, 12);                          // version made by
  zip64Eocd.writeUInt16LE(45, 14);                          // version needed
  zip64Eocd.writeUInt32LE(0, 16);                           // number of this disk
  zip64Eocd.writeUInt32LE(0, 20);                           // disk where CD starts
  zip64Eocd.writeBigUInt64LE(BigInt(fileCount), 24);        // entries on this disk
  zip64Eocd.writeBigUInt64LE(BigInt(fileCount), 32);        // total entries
  zip64Eocd.writeBigUInt64LE(BigInt(centralSize), 40);      // size of central directory
  zip64Eocd.writeBigUInt64LE(BigInt(centralOffset), 48);    // offset of central directory

  // ── ZIP64 End of Central Directory Locator (20 bytes) ──
  const locator = Buffer.alloc(20);
  locator.writeUInt32LE(0x07064b50, 0);                                     // signature
  locator.writeUInt32LE(0, 4);                                              // disk with ZIP64 EOCD
  locator.writeBigUInt64LE(BigInt(centralOffset + centralSize), 8);         // offset of ZIP64 EOCD
  locator.writeUInt32LE(1, 16);                                             // total number of disks

  // ── Standard End of Central Directory Record (22 bytes) ──
  // Uses 0xFFFF / 0xFFFFFFFF when values overflow 16/32-bit fields
  const count16 = fileCount > 0xFFFF ? 0xFFFF : fileCount;
  const cdSize32 = centralSize > 0xFFFFFFFE ? 0xFFFFFFFF : centralSize;
  const cdOff32 = centralOffset > 0xFFFFFFFE ? 0xFFFFFFFF : centralOffset;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);           // signature
  eocd.writeUInt16LE(0, 4);                    // number of this disk
  eocd.writeUInt16LE(0, 6);                    // disk where CD starts
  eocd.writeUInt16LE(count16, 8);              // entries on this disk
  eocd.writeUInt16LE(count16, 10);             // total entries
  eocd.writeUInt32LE(cdSize32 >>> 0, 12);      // size of central directory
  eocd.writeUInt32LE(cdOff32 >>> 0, 16);       // offset of central directory
  eocd.writeUInt16LE(0, 20);                   // ZIP file comment length

  return Buffer.concat([zip64Eocd, locator, eocd]);
}

// ── Public API ────────────────────────────────

export function sanitizeArchivePath(relativePath: string): string {
  return relativePath
    .replace(/\\/g, '/')
    .replace(/^[a-zA-Z]:\//, '')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');
}

/**
 * Create a streaming ZIP archive from a list of files.
 * Fully ZIP64-compatible — handles files and archives larger than 4 GB.
 */
export function createZipStream(files: ZipFileEntry[]): Readable {
  async function* generate(): AsyncGenerator<Buffer> {
    const centralEntries: Array<{ filename: Buffer; crc: number; size: number; offset: number }> = [];
    let offset = 0;

    for (const file of files) {
      const filename = Buffer.from(sanitizeArchivePath(file.archivePath), 'utf8');
      const header = localFileHeader(filename);
      const fileOffset = offset;
      offset += header.length;
      yield header;

      let crc = 0xffffffff;
      let size = 0;

      for await (const chunk of fs.createReadStream(file.sourcePath)) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        crc = updateCrc32(crc, buffer);
        size += buffer.length;
        offset += buffer.length;
        yield buffer;
      }

      crc = (crc ^ 0xffffffff) >>> 0;
      const descriptor = dataDescriptor(crc, size);
      offset += descriptor.length;
      yield descriptor;

      centralEntries.push({ filename, crc, size, offset: fileOffset });
    }

    const centralOffset = offset;
    const centralBuffers = centralEntries.map(centralDirectoryHeader);
    for (const buffer of centralBuffers) {
      offset += buffer.length;
      yield buffer;
    }

    yield endOfCentralDirectory(centralEntries.length, offset - centralOffset, centralOffset);
  }

  return Readable.from(generate());
}

export function archiveNameFromTitle(title: string | null | undefined, fallback: string): string {
  const name = sanitizeArchivePath(title || fallback)
    .replace(/\//g, '-')
    .replace(/[<>:"|?*]/g, '-')
    .trim();
  return name || fallback;
}
