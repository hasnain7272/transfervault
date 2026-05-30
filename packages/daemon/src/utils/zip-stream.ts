import fs from 'node:fs';
import { Readable } from 'node:stream';

interface ZipFileEntry {
  sourcePath: string;
  archivePath: string;
}

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

function dosDateTime(date = new Date()): { date: number; time: number } {
  const year = Math.max(date.getFullYear(), 1980);
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  };
}

function localFileHeader(filename: Buffer): Buffer {
  const { date, time } = dosDateTime();
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0808, 6); // UTF-8 filenames + trailing data descriptor.
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(time, 10);
  header.writeUInt16LE(date, 12);
  header.writeUInt16LE(0, 14);
  header.writeUInt32LE(0, 18);
  header.writeUInt32LE(0, 22);
  header.writeUInt16LE(filename.length, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, filename]);
}

function dataDescriptor(crc: number, size: number): Buffer {
  const descriptor = Buffer.alloc(16);
  descriptor.writeUInt32LE(0x08074b50, 0);
  descriptor.writeUInt32LE(crc >>> 0, 4);
  descriptor.writeUInt32LE(size >>> 0, 8);
  descriptor.writeUInt32LE(size >>> 0, 12);
  return descriptor;
}

function centralDirectoryHeader(entry: {
  filename: Buffer;
  crc: number;
  size: number;
  offset: number;
}): Buffer {
  const { date, time } = dosDateTime();
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0808, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(time, 12);
  header.writeUInt16LE(date, 14);
  header.writeUInt32LE(entry.crc >>> 0, 16);
  header.writeUInt32LE(entry.size >>> 0, 20);
  header.writeUInt32LE(entry.size >>> 0, 24);
  header.writeUInt16LE(entry.filename.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(entry.offset >>> 0, 42);
  return Buffer.concat([header, entry.filename]);
}

function endOfCentralDirectory(fileCount: number, centralSize: number, centralOffset: number): Buffer {
  const header = Buffer.alloc(22);
  header.writeUInt32LE(0x06054b50, 0);
  header.writeUInt16LE(0, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(fileCount, 8);
  header.writeUInt16LE(fileCount, 10);
  header.writeUInt32LE(centralSize >>> 0, 12);
  header.writeUInt32LE(centralOffset >>> 0, 16);
  header.writeUInt16LE(0, 20);
  return header;
}

export function sanitizeArchivePath(relativePath: string): string {
  return relativePath
    .replace(/\\/g, '/')
    .replace(/^[a-zA-Z]:\//, '')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');
}

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
