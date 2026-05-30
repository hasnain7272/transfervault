// ============================================
// TransferVault Daemon — Checksum Service
// SHA-256 for file integrity verification.
// ============================================

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Compute SHA-256 hash of a file using streaming.
 * Never loads the full file into memory.
 */
export async function computeFileChecksum(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Compute SHA-256 hash of a buffer (for chunk verification).
 */
export function computeBufferChecksum(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Verify a file's checksum matches the expected value.
 */
export async function verifyChecksum(
  filePath: string,
  expectedChecksum: string,
): Promise<boolean> {
  const actual = await computeFileChecksum(filePath);
  return actual === expectedChecksum.toLowerCase();
}

/**
 * Compute the total size of all files in a directory.
 */
export async function computeDirectorySize(dirPath: string): Promise<number> {
  let totalSize = 0;

  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isFile()) {
      const stat = await fs.promises.stat(fullPath);
      totalSize += stat.size;
    } else if (entry.isDirectory()) {
      totalSize += await computeDirectorySize(fullPath);
    }
  }

  return totalSize;
}
