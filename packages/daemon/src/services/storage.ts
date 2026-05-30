// ============================================
// TransferVault Daemon — Storage Service
// Manages file system operations for transfers.
// ============================================

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { AppConfig } from '../config.js';

export class StorageService {
  private readonly transfersDir: string;

  constructor(private readonly config: AppConfig) {
    this.transfersDir = config.DATA_DIR;
  }

  /**
   * Initialize storage directories.
   */
  async initialize(): Promise<void> {
    await fs.promises.mkdir(this.transfersDir, { recursive: true });
  }

  /**
   * Get the base transfers directory.
   */
  getTransfersDir(): string {
    return this.transfersDir;
  }

  /**
   * Create a directory for a specific transfer.
   */
  async createTransferDir(pairCode: string): Promise<string> {
    const dirPath = this.getTransferPath(pairCode);
    await fs.promises.mkdir(dirPath, { recursive: true });
    return dirPath;
  }

  /**
   * Get the path for a specific transfer.
   */
  getTransferPath(pairCode: string): string {
    // Strip dashes from pair code for directory name
    const dirName = pairCode.replace(/-/g, '');
    return path.join(this.transfersDir, dirName);
  }

  /**
   * Get the full path for a file within a transfer.
   */
  getFilePath(pairCode: string, filename: string): string {
    const safeRelativePath = filename
      .replace(/\\/g, '/')
      .replace(/^[a-zA-Z]:\//, '')
      .split('/')
      .filter((part) => part && part !== '.' && part !== '..')
      .join(path.sep);

    return path.join(this.getTransferPath(pairCode), safeRelativePath);
  }

  /**
   * Check if a transfer directory exists.
   */
  async transferExists(pairCode: string): Promise<boolean> {
    try {
      const stat = await fs.promises.stat(this.getTransferPath(pairCode));
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * List all files in a transfer directory.
   */
  async listTransferFiles(pairCode: string): Promise<string[]> {
    const dirPath = this.getTransferPath(pairCode);
    try {
      const entries = await fs.promises.readdir(dirPath);
      // Filter out TUS metadata files (.json info files)
      return entries.filter((e) => !e.endsWith('.json'));
    } catch {
      return [];
    }
  }

  /**
   * Get file size.
   */
  async getFileSize(filePath: string): Promise<number> {
    const stat = await fs.promises.stat(filePath);
    return stat.size;
  }

  /**
   * Delete a transfer's files and directory.
   */
  async deleteTransfer(pairCode: string): Promise<void> {
    const dirPath = this.getTransferPath(pairCode);
    try {
      await fs.promises.rm(dirPath, { recursive: true, force: true });
    } catch {
      // Already deleted, ignore
    }
  }

  /**
   * Get disk usage stats.
   */
  async getDiskStats(): Promise<{
    total: number;
    free: number;
    used: number;
    transfersSize: number;
  }> {
    // Get disk stats for the data directory's drive
    const dataPath = path.resolve(this.config.DATA_DIR);

    // Use os to get free memory as a proxy; for actual disk, use statvfs
    // Node.js doesn't have a built-in disk stats API, so we use a workaround
    let total = 0;
    let free = 0;

    try {
      // Node.js 18.15+ has fs.statfs
      const stats = await fs.promises.statfs(dataPath);
      total = stats.bsize * stats.blocks;
      free = stats.bsize * stats.bavail;
    } catch {
      // Fallback: use os info
      total = os.totalmem();
      free = os.freemem();
    }

    // Calculate transfers directory size
    let transfersSize = 0;
    try {
      transfersSize = await this.computeDirSize(this.transfersDir);
    } catch {
      transfersSize = 0;
    }

    return {
      total,
      free,
      used: total - free,
      transfersSize,
    };
  }

  /**
   * Recursively compute directory size.
   */
  private async computeDirSize(dirPath: string): Promise<number> {
    let size = 0;
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isFile()) {
          const stat = await fs.promises.stat(fullPath);
          size += stat.size;
        } else if (entry.isDirectory()) {
          // Skip temporary/system directories to only measure actual transfer storage
          if (entry.name === '.tus-uploads' || entry.name === 'tus-uploads') {
            continue;
          }
          size += await this.computeDirSize(fullPath);
        }
      }
    } catch {
      // Directory doesn't exist or inaccessible
    }
    return size;
  }

  /**
   * Create a read stream for a file (for downloads).
   * Supports range requests.
   */
  createReadStream(
    filePath: string,
    options?: { start?: number; end?: number },
  ): fs.ReadStream {
    return fs.createReadStream(filePath, options);
  }
}
