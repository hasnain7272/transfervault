// ============================================
// TransferVault Daemon — Cleanup Service
// Periodically removes expired transfers.
// ============================================

import cron from 'node-cron';
import fs from 'node:fs';
import path from 'node:path';
import type { SupabaseSyncService } from './supabase-sync.js';
import type { StorageService } from './storage.js';
import type { AppConfig } from '../config.js';

export class CleanupService {
  private task: cron.ScheduledTask | null = null;
  private isRunning = false;

  constructor(
    private readonly config: AppConfig,
    private readonly supabase: SupabaseSyncService,
    private readonly storage: StorageService,
    private readonly logger: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void },
  ) {}

  /**
   * Start the cleanup cron job.
   * Runs every 5 minutes by default.
   */
  start(): void {
    // Convert interval to cron expression (every N minutes)
    const intervalMinutes = Math.max(1, Math.floor(this.config.CLEANUP_INTERVAL_MS / 60_000));
    const cronExpression = `*/${intervalMinutes} * * * *`;

    this.logger.info(`Cleanup service started (every ${intervalMinutes} minutes)`);

    this.task = cron.schedule(cronExpression, () => {
      void this.runCleanup();
    });

    // Run once immediately on start
    void this.runCleanup();
  }

  /**
   * Stop the cleanup cron job.
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
    }
  }

  /**
   * Run a single cleanup cycle.
   */
  async runCleanup(): Promise<number> {
    if (this.isRunning) {
      this.logger.info('Cleanup already running, skipping');
      return 0;
    }

    this.isRunning = true;
    let cleanedCount = 0;

    try {
      const expiredTransfers = await this.supabase.getExpiredTransfers();

      if (expiredTransfers.length === 0) {
        return 0;
      }

      this.logger.info(`Found ${expiredTransfers.length} expired transfers to clean up`);

      for (const transfer of expiredTransfers) {
        try {
          // Delete files from disk
          await this.storage.deleteTransfer(transfer.pair_code);

          // Update status in Supabase
          await this.supabase.updateTransfer(transfer.id, { status: 'expired' });

          // Log the event
          await this.supabase.logAudit({
            transfer_id: transfer.id,
            event_type: 'transfer_expired',
            ip_address: null,
            user_agent: null,
            metadata: {
              pair_code: transfer.pair_code,
              size_bytes: transfer.size_bytes,
              file_count: transfer.file_count,
            },
          });

          cleanedCount++;
          this.logger.info(
            `Cleaned up transfer ${transfer.pair_code} (${transfer.size_bytes} bytes)`,
          );
        } catch (err) {
          this.logger.error(`Failed to clean up transfer ${transfer.pair_code}:`, err);
        }
      }

      this.logger.info(`Cleanup complete: ${cleanedCount}/${expiredTransfers.length} transfers`);
    } catch (err) {
      this.logger.error('Cleanup cycle failed:', err);
    } finally {
      // Always clean stale TUS partial uploads (older than 24 hours)
      try {
        await this.cleanStaleTusUploads();
      } catch {
        // Non-critical cleanup, ignore errors
      }
      this.isRunning = false;
    }

    return cleanedCount;
  }

  /**
   * Remove stale partial TUS uploads older than 24 hours.
   * These accumulate when uploads are abandoned mid-transfer.
   */
  private async cleanStaleTusUploads(): Promise<void> {
    const tusDir = path.join(this.config.DATA_DIR, '.tus-uploads');
    try {
      const entries = await fs.promises.readdir(tusDir, { withFileTypes: true });
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      let cleaned = 0;
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const filePath = path.join(tusDir, entry.name);
        try {
          const stat = await fs.promises.stat(filePath);
          if (now - stat.mtimeMs > maxAge) {
            await fs.promises.unlink(filePath);
            cleaned++;
          }
        } catch {
          // File might have been deleted concurrently
        }
      }

      if (cleaned > 0) {
        this.logger.info(`Cleaned ${cleaned} stale TUS upload(s)`);
      }
    } catch {
      // TUS directory might not exist yet
    }
  }
}
