import { create } from 'zustand';
import type { TransferLookup } from '@/lib/api';

interface DownloadFile {
  id: string;
  filename: string;
  size_bytes: number;
  mime_type: string | null;
  progress: number;
  status: 'idle' | 'downloading' | 'complete' | 'error';
  error?: string;
}

interface DownloadState {
  pairCode: string;
  transfer: TransferLookup | null;
  files: DownloadFile[];
  password: string;
  passwordVerified: boolean;
  status: 'idle' | 'looking_up' | 'found' | 'password_required' | 'ready' | 'downloading' | 'complete' | 'error' | 'not_found';
  error: string | null;

  // Actions
  setPairCode: (code: string) => void;
  setTransfer: (transfer: TransferLookup) => void;
  setPassword: (password: string) => void;
  setPasswordVerified: (verified: boolean) => void;
  setStatus: (status: DownloadState['status']) => void;
  setError: (error: string | null) => void;
  updateFileProgress: (fileId: string, progress: number) => void;
  setFileStatus: (fileId: string, status: DownloadFile['status'], error?: string) => void;
  reset: () => void;
}

export const useDownloadStore = create<DownloadState>((set) => ({
  pairCode: '',
  transfer: null,
  files: [],
  password: '',
  passwordVerified: false,
  status: 'idle',
  error: null,

  setPairCode: (code) => set({ pairCode: code }),

  setTransfer: (transfer) =>
    set({
      transfer,
      files: transfer.files.map((f) => ({
        ...f,
        progress: 0,
        status: 'idle' as const,
      })),
      status: transfer.has_password ? 'password_required' : 'ready',
    }),

  setPassword: (password) => set({ password }),
  setPasswordVerified: (verified) =>
    set({ passwordVerified: verified, status: verified ? 'ready' : 'password_required' }),

  setStatus: (status) => set({ status }),
  setError: (error) => set({ error, status: error ? 'error' : 'idle' }),

  updateFileProgress: (fileId, progress) =>
    set((state) => ({
      files: state.files.map((f) =>
        f.id === fileId ? { ...f, progress, status: 'downloading' as const } : f,
      ),
    })),

  setFileStatus: (fileId, status, error) =>
    set((state) => ({
      files: state.files.map((f) =>
        f.id === fileId ? { ...f, status, error } : f,
      ),
    })),

  reset: () =>
    set({
      pairCode: '',
      transfer: null,
      files: [],
      password: '',
      passwordVerified: false,
      status: 'idle',
      error: null,
    }),
}));
