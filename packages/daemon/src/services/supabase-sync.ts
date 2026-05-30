// ============================================
// TransferVault Daemon — Supabase Sync Service
// Syncs metadata between daemon and Supabase.
// ============================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AppConfig } from '../config.js';
import type {
  TransferRecord,
  FileRecord,
  AuditLogEntry,
  DaemonStatus,
} from '../types/transfer.js';

export class SupabaseSyncService {
  private readonly client: SupabaseClient;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly config: AppConfig) {
    this.client = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    });
  }

  /**
   * Get the raw Supabase client for direct queries.
   */
  getClient(): SupabaseClient {
    return this.client;
  }

  // ──────────────────────────────────────────
  // Transfers
  // ──────────────────────────────────────────

  async createTransfer(
    transfer: Omit<TransferRecord, 'id' | 'created_at' | 'download_count'>,
  ): Promise<TransferRecord> {
    const { data, error } = await this.client
      .from('transfers')
      .insert(transfer)
      .select()
      .single();

    if (error) throw new Error(`Failed to create transfer: ${error.message}`);
    return data;
  }

  async getTransferByPairCode(pairCode: string): Promise<TransferRecord | null> {
    const { data, error } = await this.client
      .from('transfers')
      .select('*')
      .eq('pair_code', pairCode)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(`Failed to get transfer: ${error.message}`);
    }
    return data;
  }

  async getTransferById(id: string): Promise<TransferRecord | null> {
    const { data, error } = await this.client
      .from('transfers')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get transfer: ${error.message}`);
    }
    return data;
  }

  async updateTransfer(
    id: string,
    updates: Partial<TransferRecord>,
  ): Promise<void> {
    const { error } = await this.client
      .from('transfers')
      .update(updates)
      .eq('id', id);

    if (error) throw new Error(`Failed to update transfer: ${error.message}`);
  }

  async getExpiredTransfers(): Promise<TransferRecord[]> {
    const { data, error } = await this.client
      .from('transfers')
      .select('*')
      .lt('expires_at', new Date().toISOString())
      .neq('status', 'expired')
      .neq('status', 'deleted');

    if (error) throw new Error(`Failed to get expired transfers: ${error.message}`);
    return data ?? [];
  }

  async getTransfersByOwner(ownerId: string): Promise<TransferRecord[]> {
    const { data, error } = await this.client
      .from('transfers')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to get transfers: ${error.message}`);
    return data ?? [];
  }

  async incrementDownloadCount(transferId: string): Promise<void> {
    // Atomic increment using optimistic concurrency control (compare-and-swap).
    // Prevents race conditions when multiple downloads happen simultaneously.
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: transfer } = await this.client
        .from('transfers')
        .select('download_count')
        .eq('id', transferId)
        .single();

      if (!transfer) return;

      const { data } = await this.client
        .from('transfers')
        .update({ download_count: transfer.download_count + 1 })
        .eq('id', transferId)
        .eq('download_count', transfer.download_count) // CAS: only succeeds if unchanged
        .select('id');

      if (data && data.length > 0) return; // Increment succeeded
      // Another concurrent request modified the count — retry
    }
  }

  // ──────────────────────────────────────────
  // Files
  // ──────────────────────────────────────────

  async addFile(file: Omit<FileRecord, 'id'>): Promise<FileRecord> {
    const { data, error } = await this.client
      .from('files')
      .insert(file)
      .select()
      .single();

    if (error) throw new Error(`Failed to add file: ${error.message}`);
    return data;
  }

  async getFilesByTransfer(transferId: string): Promise<FileRecord[]> {
    const { data, error } = await this.client
      .from('files')
      .select('*')
      .eq('transfer_id', transferId)
      .order('sort_order', { ascending: true });

    if (error) throw new Error(`Failed to get files: ${error.message}`);
    return data ?? [];
  }

  async getFileById(fileId: string): Promise<FileRecord | null> {
    const { data, error } = await this.client
      .from('files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get file: ${error.message}`);
    }
    return data;
  }

  // ──────────────────────────────────────────
  // Audit Logs
  // ──────────────────────────────────────────

  async logAudit(entry: AuditLogEntry): Promise<void> {
    const { error } = await this.client.from('audit_logs').insert(entry);
    if (error) {
      // Don't throw on audit log failures — just log locally
      console.error('Failed to write audit log:', error.message);
    }
  }

  // ──────────────────────────────────────────
  // Daemon Status / Heartbeat
  // ──────────────────────────────────────────

  async updateDaemonStatus(status: Partial<DaemonStatus>): Promise<void> {
    const { error } = await this.client
      .from('daemon_status')
      .upsert({
        id: 'main',
        ...status,
        last_heartbeat: new Date().toISOString(),
      });

    if (error) {
      console.error('Failed to update daemon status:', error.message);
    }
  }

  /**
   * Start periodic heartbeat to Supabase.
   */
  startHeartbeat(getStatus: () => Promise<Partial<DaemonStatus>>): void {
    // Send immediately
    void getStatus().then((s) => this.updateDaemonStatus({ ...s, is_online: true }));

    this.heartbeatInterval = setInterval(async () => {
      try {
        const status = await getStatus();
        await this.updateDaemonStatus({ ...status, is_online: true });
      } catch (err) {
        console.error('Heartbeat failed:', err);
      }
    }, this.config.HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Stop heartbeat and mark daemon as offline.
   */
  async stopHeartbeat(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    await this.updateDaemonStatus({ is_online: false });
  }

  // ──────────────────────────────────────────
  // Stats
  // ──────────────────────────────────────────

  async getTransferStats(): Promise<{
    total: number;
    byStatus: Record<string, number>;
  }> {
    const { data, error } = await this.client
      .from('transfers')
      .select('status');

    if (error) throw new Error(`Failed to get stats: ${error.message}`);

    const byStatus: Record<string, number> = {};
    for (const row of data ?? []) {
      byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    }

    return {
      total: data?.length ?? 0,
      byStatus,
    };
  }
}
