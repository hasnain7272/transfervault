// ============================================
// TransferVault Daemon — Types
// ============================================

export interface TransferRecord {
  id: string;
  pair_code: string;
  status: 'pending' | 'uploading' | 'ready' | 'expired' | 'deleted';
  created_at: string;
  expires_at: string;
  owner_id: string | null;
  download_count: number;
  max_downloads: number | null;
  password_hash: string | null;
  size_bytes: number;
  file_count: number;
  title: string | null;
  message: string | null;
  is_encrypted: boolean;
  daemon_confirmed: boolean;
}

export interface FileRecord {
  id: string;
  transfer_id: string;
  filename: string;
  size_bytes: number;
  mime_type: string | null;
  checksum: string | null;
  storage_path: string | null;
  sort_order: number;
}

export interface AuditLogEntry {
  transfer_id: string | null;
  event_type: AuditEventType;
  ip_address: string | null;
  user_agent: string | null;
  metadata?: Record<string, unknown>;
}

export type AuditEventType =
  | 'upload_started'
  | 'upload_completed'
  | 'upload_failed'
  | 'download_started'
  | 'download_completed'
  | 'download_failed'
  | 'transfer_expired'
  | 'transfer_deleted'
  | 'password_attempt_failed'
  | 'pair_code_lookup_failed';

export interface SessionRecord {
  id: string;
  transfer_id: string;
  client_id: string;
  session_type: 'upload' | 'download';
  connected_at: string;
  last_seen: string;
  bytes_transferred: number;
  is_active: boolean;
}

export interface DaemonStatus {
  is_online: boolean;
  last_heartbeat: string;
  disk_total_bytes: number;
  disk_free_bytes: number;
  active_uploads: number;
  active_downloads: number;
  version: string | null;
}

export interface CreateTransferRequest {
  expires_in_hours: number;
  title?: string;
  message?: string;
  password?: string;
  max_downloads?: number;
  is_encrypted?: boolean;
  owner_id?: string;
  files: Array<{
    filename: string;
    size_bytes: number;
    mime_type?: string;
  }>;
}

export interface CreateTransferResponse {
  transfer_id: string;
  pair_code: string;
  upload_urls: Array<{
    file_id: string;
    filename: string;
    tus_endpoint: string;
  }>;
  expires_at: string;
}

export interface TransferLookupResponse {
  id: string;
  pair_code: string;
  status: string;
  created_at: string;
  expires_at: string;
  download_count: number;
  max_downloads: number | null;
  size_bytes: number;
  file_count: number;
  title: string | null;
  message: string | null;
  is_encrypted: boolean;
  has_password: boolean;
  files: Array<{
    id: string;
    filename: string;
    size_bytes: number;
    mime_type: string | null;
  }>;
}

export interface DownloadRequest {
  transfer_id: string;
  file_id: string;
  password?: string;
}

export interface AdminStats {
  daemon_online: boolean;
  uptime_seconds: number;
  disk_total_bytes: number;
  disk_free_bytes: number;
  disk_used_bytes: number;
  active_uploads: number;
  active_downloads: number;
  total_transfers: number;
  total_files_stored: number;
  total_bytes_stored: number;
  transfers_by_status: Record<string, number>;
}
