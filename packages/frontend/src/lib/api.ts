// ============================================
// TransferVault — API Client
// Communicates with the laptop daemon.
// ============================================

import { supabase } from './supabase';

export function getDaemonUrl(): string {
  const manual = localStorage.getItem('transfervault_daemon_url');
  if (manual) return manual.replace(/\/$/, '');

  const discovered = localStorage.getItem('transfervault_discovered_daemon_url');
  if (discovered) return discovered.replace(/\/$/, '');

  // Fallback to localhost ONLY when running locally in development.
  // This stops public HTTPS pages from querying localhost and triggering confusing 'Private Network Access' prompts for end-users.
  const isLocalOrigin = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (isLocalOrigin) {
    const envUrl = (import.meta.env.VITE_DAEMON_URL as string) || '';
    return envUrl.replace(/\/$/, '') || 'http://localhost:3001';
  }

  return '';
}

export async function discoverDaemonUrl(): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('daemon_status')
      .select('public_url, is_online')
      .eq('id', 'main')
      .single();

    if (error) throw error;
    if (data && data.is_online && data.public_url) {
      const cleanUrl = data.public_url.replace(/\/$/, '');
      localStorage.setItem('transfervault_discovered_daemon_url', cleanUrl);
      return cleanUrl;
    }
  } catch (err) {
    console.error('Failed to auto-discover daemon url from supabase:', err);
  }
  return null;
}

interface CreateTransferRequest {
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

interface CreateTransferResponse {
  transfer_id: string;
  pair_code: string;
  upload_urls: Array<{
    file_id: string;
    filename: string;
    tus_endpoint: string;
  }>;
  expires_at: string;
}

interface TransferLookup {
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

async function fetchApi<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${getDaemonUrl()}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'bypass-tunnel-reminder': 'true', // Bypass localtunnel reminder landing page
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }

  return res.json() as T;
}

export const api = {
  /** Create a new transfer and get upload URLs */
  createTransfer(data: CreateTransferRequest): Promise<CreateTransferResponse> {
    return fetchApi('/api/transfers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /** Look up a transfer by pair code */
  lookupTransfer(pairCode: string): Promise<TransferLookup> {
    return fetchApi(`/api/transfers/lookup/${encodeURIComponent(pairCode)}`);
  },

  /** Finalize a transfer after upload */
  finalizeTransfer(transferId: string): Promise<{ status: string }> {
    return fetchApi(`/api/transfers/${transferId}/finalize`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  /** Verify transfer password */
  verifyPassword(
    transferId: string,
    password: string,
  ): Promise<{ valid: boolean }> {
    return fetchApi(`/api/transfers/${transferId}/verify-password`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  },

  /** Delete a transfer */
  deleteTransfer(
    transferId: string,
    ownerId: string,
  ): Promise<{ deleted: boolean }> {
    return fetchApi(`/api/transfers/${transferId}`, {
      method: 'DELETE',
      headers: { 'x-owner-id': ownerId },
    });
  },

  /** Get download URL */
  getDownloadUrl(
    transferId: string,
    fileId: string,
    password?: string,
  ): string {
    const base = `${getDaemonUrl()}/api/download/${transferId}/${fileId}`;
    if (password) {
      return `${base}?password=${encodeURIComponent(password)}`;
    }
    return base;
  },

  /** Get TUS endpoint URL */
  getTusEndpoint(): string {
    return `${getDaemonUrl()}/api/tus`;
  },

  /** Admin: Get all transfers */
  getAdminTransfers(adminSecret: string): Promise<any[]> {
    return fetchApi('/api/admin/transfers', {
      headers: { 'x-daemon-secret': adminSecret },
    });
  },

  /** Admin: Get secure download URL bypassing password */
  getAdminDownloadUrl(
    transferId: string,
    fileId: string,
    adminSecret: string,
  ): string {
    return `${getDaemonUrl()}/api/download/${transferId}/${fileId}?admin_secret=${encodeURIComponent(adminSecret)}`;
  },

  /** Admin: Delete any transfer */
  deleteAdminTransfer(
    transferId: string,
    adminSecret: string,
  ): Promise<{ deleted: boolean }> {
    return fetchApi(`/api/admin/transfers/${transferId}`, {
      method: 'DELETE',
      headers: { 'x-daemon-secret': adminSecret },
    });
  },
};

export type { CreateTransferRequest, CreateTransferResponse, TransferLookup };
