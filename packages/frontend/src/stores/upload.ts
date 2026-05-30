import { create } from 'zustand';

export interface UploadFile {
  id: string;
  file: File;
  progress: number;
  speed: number; // bytes/sec
  eta: number; // seconds
  status: 'pending' | 'uploading' | 'complete' | 'error' | 'paused';
  error?: string;
  tusId?: string;
  fileId?: string;
}

interface UploadState {
  files: UploadFile[];
  transferId: string | null;
  pairCode: string | null;
  expiresAt: string | null;
  overallProgress: number;
  status: 'idle' | 'configuring' | 'uploading' | 'finalizing' | 'complete' | 'error';
  expirationHours: number;
  title: string;
  message: string;
  password: string;
  maxDownloads: number | null;
  isEncrypted: boolean;

  // Actions
  addFiles: (files: File[]) => void;
  removeFile: (id: string) => void;
  clearFiles: () => void;
  updateFileProgress: (id: string, progress: number, speed: number, eta: number) => void;
  setFileStatus: (id: string, status: UploadFile['status'], error?: string) => void;
  setTransferInfo: (transferId: string, pairCode: string, expiresAt: string) => void;
  setStatus: (status: UploadState['status']) => void;
  setConfig: (config: Partial<Pick<UploadState, 'expirationHours' | 'title' | 'message' | 'password' | 'maxDownloads' | 'isEncrypted'>>) => void;
  reset: () => void;
}

const initialState = {
  files: [],
  transferId: null,
  pairCode: null,
  expiresAt: null,
  overallProgress: 0,
  status: 'idle' as const,
  expirationHours: 72, // 3 days default
  title: '',
  message: '',
  password: '',
  maxDownloads: null,
  isEncrypted: false,
};

export const useUploadStore = create<UploadState>((set) => ({
  ...initialState,

  addFiles: (newFiles: File[]) =>
    set((state) => ({
      files: [
        ...state.files,
        ...newFiles.map((file) => ({
          id: `${file.name}-${file.size}-${Date.now()}`,
          file,
          progress: 0,
          speed: 0,
          eta: 0,
          status: 'pending' as const,
        })),
      ],
    })),

  removeFile: (id: string) =>
    set((state) => ({
      files: state.files.filter((f) => f.id !== id),
    })),

  clearFiles: () => set({ files: [] }),

  updateFileProgress: (id, progress, speed, eta) =>
    set((state) => {
      const files = state.files.map((f) =>
        f.id === id ? { ...f, progress, speed, eta, status: 'uploading' as const } : f,
      );
      const overallProgress =
        files.length > 0
          ? files.reduce((sum, f) => sum + f.progress, 0) / files.length
          : 0;
      return { files, overallProgress };
    }),

  setFileStatus: (id, status, error) =>
    set((state) => ({
      files: state.files.map((f) =>
        f.id === id ? { ...f, status, error } : f,
      ),
    })),

  setTransferInfo: (transferId, pairCode, expiresAt) =>
    set({ transferId, pairCode, expiresAt }),

  setStatus: (status) => set({ status }),

  setConfig: (config) => set(config),

  reset: () => set(initialState),
}));
