// ============================================
// TransferVault Daemon — Transfer Service
// Business logic for transfer operations.
// ============================================

import { hash, verify } from '@node-rs/argon2';
import type { AppConfig } from '../config.js';
import type { SupabaseSyncService } from './supabase-sync.js';
import type { StorageService } from './storage.js';
import { generatePairCode, normalizePairCode } from './pairing.js';
// Checksums are now computed in the TUS upload hook (routes/upload.ts)
import type {
  CreateTransferRequest,
  CreateTransferResponse,
  TransferLookupResponse,
} from '../types/transfer.js';

export class TransferService {
  constructor(
    _config: AppConfig,
    private readonly supabase: SupabaseSyncService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Create a new transfer with file metadata.
   */
  async createTransfer(req: CreateTransferRequest): Promise<CreateTransferResponse> {
    const pairCode = generatePairCode();
    const expiresAt = new Date(
      Date.now() + req.expires_in_hours * 60 * 60 * 1000,
    ).toISOString();

    // Hash password if provided
    let passwordHash: string | null = null;
    if (req.password) {
      passwordHash = await hash(req.password, {
        algorithm: 2, // Argon2id default
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });
    }

    // Total size
    const totalSize = req.files.reduce((sum, f) => sum + f.size_bytes, 0);

    // Create transfer record in Supabase
    const transfer = await this.supabase.createTransfer({
      pair_code: pairCode,
      status: 'pending',
      expires_at: expiresAt,
      owner_id: req.owner_id ?? null,
      max_downloads: req.max_downloads ?? null,
      password_hash: passwordHash,
      size_bytes: totalSize,
      file_count: req.files.length,
      title: req.title ?? null,
      message: req.message ?? null,
      is_encrypted: req.is_encrypted ?? false,
      daemon_confirmed: false,
    });

    // Create transfer directory on disk
    await this.storage.createTransferDir(pairCode);

    // Add file records
    const uploadUrls = [];
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i]!;
      const fileRecord = await this.supabase.addFile({
        transfer_id: transfer.id,
        filename: file.filename,
        size_bytes: file.size_bytes,
        mime_type: file.mime_type ?? null,
        checksum: null,
        storage_path: file.filename,
        sort_order: i,
      });

      uploadUrls.push({
        file_id: fileRecord.id,
        filename: file.filename,
        tus_endpoint: `/api/uploads/${normalizePairCode(pairCode)}/${fileRecord.id}`,
      });
    }

    // Update status to uploading
    await this.supabase.updateTransfer(transfer.id, { status: 'uploading' });

    // Log audit
    await this.supabase.logAudit({
      transfer_id: transfer.id,
      event_type: 'upload_started',
      ip_address: null,
      user_agent: null,
      metadata: {
        pair_code: pairCode,
        file_count: req.files.length,
        total_size: totalSize,
      },
    });

    return {
      transfer_id: transfer.id,
      pair_code: pairCode,
      upload_urls: uploadUrls,
      expires_at: expiresAt,
    };
  }

  /**
   * Mark a transfer as ready after all files are uploaded.
   */
  async finalizeTransfer(transferId: string): Promise<void> {
    const transfer = await this.supabase.getTransferById(transferId);
    if (!transfer) throw new Error('Transfer not found');

    // Verify all files exist on disk
    const files = await this.supabase.getFilesByTransfer(transferId);
    let totalSize = 0;

    for (const file of files) {
      const filePath = this.storage.getFilePath(
        transfer.pair_code,
        file.storage_path ?? file.filename,
      );

      try {
        const size = await this.storage.getFileSize(filePath);
        totalSize += size;
      } catch {
        throw new Error(`File not found on disk: ${file.filename}`);
      }
    }

    // Update transfer
    await this.supabase.updateTransfer(transferId, {
      status: 'ready',
      daemon_confirmed: true,
      size_bytes: totalSize,
    });

    // Log audit
    await this.supabase.logAudit({
      transfer_id: transferId,
      event_type: 'upload_completed',
      ip_address: null,
      user_agent: null,
      metadata: {
        pair_code: transfer.pair_code,
        total_size: totalSize,
        file_count: files.length,
      },
    });
  }

  /**
   * Look up a transfer by pair code for download.
   */
  async lookupTransfer(pairCode: string): Promise<TransferLookupResponse | null> {
    const normalized = normalizePairCode(pairCode);
    const formatted = `${normalized.slice(0, 4)}-${normalized.slice(4, 8)}-${normalized.slice(8, 12)}`;

    const transfer = await this.supabase.getTransferByPairCode(formatted);
    if (!transfer) return null;

    // Check expiration
    if (new Date(transfer.expires_at) < new Date()) {
      return null;
    }

    // Check max downloads
    if (transfer.max_downloads !== null && transfer.download_count >= transfer.max_downloads) {
      return null;
    }

    // Get files
    const files = await this.supabase.getFilesByTransfer(transfer.id);

    return {
      id: transfer.id,
      pair_code: transfer.pair_code,
      status: transfer.status,
      created_at: transfer.created_at,
      expires_at: transfer.expires_at,
      download_count: transfer.download_count,
      max_downloads: transfer.max_downloads,
      size_bytes: transfer.size_bytes,
      file_count: transfer.file_count,
      title: transfer.title,
      message: transfer.message,
      is_encrypted: transfer.is_encrypted,
      has_password: !!transfer.password_hash,
      files: files.map((f) => ({
        id: f.id,
        filename: f.filename,
        size_bytes: f.size_bytes,
        mime_type: f.mime_type,
      })),
    };
  }

  /**
   * Verify transfer password using Argon2.
   */
  async verifyPassword(transferId: string, password: string): Promise<boolean> {
    const transfer = await this.supabase.getTransferById(transferId);
    if (!transfer?.password_hash) return true; // No password set

    try {
      return await verify(transfer.password_hash, password);
    } catch {
      return false;
    }
  }

  /**
   * Get file path for download, with validation.
   */
  async getDownloadPath(
    transferId: string,
    fileId: string,
  ): Promise<{ path: string; filename: string; size: number; mime: string | null } | null> {
    const transfer = await this.supabase.getTransferById(transferId);
    if (!transfer || transfer.status !== 'ready') return null;

    const file = await this.supabase.getFileById(fileId);
    if (!file || file.transfer_id !== transferId) return null;

    const filePath = this.storage.getFilePath(
      transfer.pair_code,
      file.storage_path ?? file.filename,
    );

    // Verify file exists
    const exists = await this.storage.transferExists(transfer.pair_code);
    if (!exists) return null;

    return {
      path: filePath,
      filename: file.filename,
      size: file.size_bytes,
      mime: file.mime_type,
    };
  }

  /**
   * Get all files for a transfer so the download route can stream an archive.
   */
  async getDownloadArchiveFiles(
    transferId: string,
  ): Promise<Array<{ path: string; filename: string; size: number; mime: string | null }> | null> {
    const transfer = await this.supabase.getTransferById(transferId);
    if (!transfer || transfer.status !== 'ready') return null;

    const exists = await this.storage.transferExists(transfer.pair_code);
    if (!exists) return null;

    const files = await this.supabase.getFilesByTransfer(transferId);
    return files.map((file) => ({
      path: this.storage.getFilePath(
        transfer.pair_code,
        file.storage_path ?? file.filename,
      ),
      filename: file.filename,
      size: file.size_bytes,
      mime: file.mime_type,
    }));
  }

  /**
   * Delete a transfer (by owner).
   */
  async deleteTransfer(transferId: string, ownerId: string): Promise<boolean> {
    const transfer = await this.supabase.getTransferById(transferId);
    if (!transfer) return false;
    if (transfer.owner_id !== ownerId) return false;

    // Delete from disk
    await this.storage.deleteTransfer(transfer.pair_code);

    // Update Supabase
    await this.supabase.updateTransfer(transferId, { status: 'deleted' });

    // Log
    await this.supabase.logAudit({
      transfer_id: transferId,
      event_type: 'transfer_deleted',
      ip_address: null,
      user_agent: null,
    });

    return true;
  }

  /**
   * Delete a transfer as Admin (bypasses owner check).
   */
  async deleteTransferAsAdmin(transferId: string): Promise<boolean> {
    const transfer = await this.supabase.getTransferById(transferId);
    if (!transfer) return false;

    // Delete from disk
    await this.storage.deleteTransfer(transfer.pair_code);

    // Update Supabase
    await this.supabase.updateTransfer(transferId, { status: 'deleted' });

    // Log
    await this.supabase.logAudit({
      transfer_id: transferId,
      event_type: 'transfer_deleted',
      ip_address: null,
      user_agent: null,
      metadata: { admin: true },
    });

    return true;
  }
}
