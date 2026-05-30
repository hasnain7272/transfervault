import { useCallback, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  X,
  FileIcon,
  Clock,
  Lock,
  Hash,
  Copy,
  Check,
  Loader2,
  Shield,
} from 'lucide-react';
import { useUploadStore } from '@/stores/upload';
import { formatBytes, formatPairCode } from '@/lib/utils';
import { api, discoverDaemonUrl } from '@/lib/api';
import * as tus from 'tus-js-client';

const EXPIRATION_OPTIONS = [
  { label: '1 hour', hours: 1 },
  { label: '1 day', hours: 24 },
  { label: '3 days', hours: 72 },
  { label: '7 days', hours: 168 },
  { label: '30 days', hours: 720 },
];

export function UploadPage() {
  const store = useUploadStore();
  const [dragActive, setDragActive] = useState(false);
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length > 0) {
        store.addFiles(droppedFiles);
      }
    },
    [store],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files;
      if (selected && selected.length > 0) {
        store.addFiles(Array.from(selected));
      }
      // Reset value so same file can be selected again
      e.target.value = '';
    },
    [store],
  );

  const handleUpload = useCallback(async () => {
    if (store.files.length === 0) return;

    setUploading(true);
    setError(null);

    try {
      // Refresh daemon URL registry from Supabase dynamically right before uploading!
      // This handles cases where the daemon has restarted or localtunnel has assigned a new dynamic HTTPS URL.
      await discoverDaemonUrl();

      // 1. Create transfer on daemon
      const result = await api.createTransfer({
        expires_in_hours: store.expirationHours,
        title: store.title || undefined,
        message: store.message || undefined,
        password: store.password || undefined,
        max_downloads: store.maxDownloads ?? undefined,
        is_encrypted: store.isEncrypted,
        files: store.files.map((f) => ({
          filename: f.path,
          size_bytes: f.file.size,
          mime_type: f.file.type || undefined,
        })),
      });

      store.setTransferInfo(result.transfer_id, result.pair_code, result.expires_at);

      // 2. Upload each file via TUS
      const tusEndpoint = api.getTusEndpoint();

      for (let i = 0; i < store.files.length; i++) {
        const uploadFile = store.files[i]!;
        const uploadUrl = result.upload_urls[i]!;

        store.setFileStatus(uploadFile.id, 'uploading');

        try {
          await new Promise<void>((resolve, reject) => {
            const startTime = Date.now();
            
            const upload = new tus.Upload(uploadFile.file, {
              endpoint: tusEndpoint,
              retryDelays: [0, 1000, 3000, 5000],
              headers: {
                'bypass-tunnel-reminder': 'true',
              },
              metadata: {
                filename: uploadFile.path || uploadFile.file.name,
                filetype: uploadFile.file.type || 'application/octet-stream',
                pair_code: result.pair_code.replace(/-/g, ''),
                file_id: uploadUrl.file_id
              },
              onError: (error) => {
                reject(error);
              },
              onProgress: (bytesUploaded, bytesTotal) => {
                const progress = (bytesUploaded / bytesTotal) * 100;
                const speed = bytesUploaded / Math.max(0.1, (Date.now() - startTime) / 1000);
                const eta = (bytesTotal - bytesUploaded) / speed;
                store.updateFileProgress(uploadFile.id, progress, speed, eta);
              },
              onSuccess: () => {
                store.setFileStatus(uploadFile.id, 'complete');
                resolve();
              }
            });

            upload.start();
          });
        } catch (err) {
          store.setFileStatus(uploadFile.id, 'error', String(err));
          throw err;
        }
      }

      // 3. Finalize transfer
      await api.finalizeTransfer(result.transfer_id);
      store.setStatus('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      store.setStatus('error');
    } finally {
      setUploading(false);
    }
  }, [store]);

  const copyPairCode = useCallback(() => {
    if (store.pairCode) {
      void navigator.clipboard.writeText(store.pairCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [store.pairCode]);

  const totalSize = store.files.reduce((sum, f) => sum + f.file.size, 0);

  // ── Complete state ──
  if (store.status === 'complete' && store.pairCode) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-lg text-center"
        >
          <div className="glass rounded-3xl p-10">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
              className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-accent-emerald to-green-600 mb-6 shadow-lg shadow-accent-emerald/30"
            >
              <Check className="h-10 w-10 text-white" />
            </motion.div>

            <h2 className="text-2xl font-bold text-surface-950 mb-2">
              Upload Complete!
            </h2>
            <p className="text-surface-600 mb-8">
              Share this pairing code to let others download your files.
            </p>

            {/* Pair Code */}
            <div className="relative mb-6">
              <div className="pair-code text-3xl sm:text-4xl py-4">
                {formatPairCode(store.pairCode)}
              </div>
            </div>

            <button
              onClick={copyPairCode}
              className="btn-primary inline-flex items-center gap-2 px-8 py-3"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy Pair Code
                </>
              )}
            </button>

            <div className="mt-8 flex items-center justify-center gap-6 text-sm text-surface-500">
              <span>{store.files.length} file{store.files.length > 1 ? 's' : ''}</span>
              <span>·</span>
              <span>{formatBytes(totalSize)}</span>
              <span>·</span>
              <span>
                Expires {new Date(store.expiresAt!).toLocaleDateString()}
              </span>
            </div>

            <button
              onClick={() => store.reset()}
              className="mt-6 text-sm text-vault-400 hover:text-vault-300 transition-colors"
            >
              Upload more files
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Upload form ──
  return (
    <div className="min-h-[80vh] py-12 px-4">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <h1 className="text-3xl sm:text-4xl font-bold text-surface-950 mb-3">
            Upload Files
          </h1>
          <p className="text-surface-600 text-lg">
            Drop your files here. They'll be stored on your own machine.
          </p>
        </motion.div>

        {/* Drop Zone */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div
            className={`dropzone p-12 text-center border-2 border-dashed rounded-3xl transition-colors ${dragActive ? 'border-vault-500 bg-vault-500/5' : 'border-surface-300 hover:border-vault-400'}`}
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            {/* Folder select input */}
            <input
              ref={folderInputRef}
              type="file"
              multiple
              {...({ webkitdirectory: "", directory: "" } as any)}
              className="hidden"
              onChange={handleFileSelect}
            />
            <div className="flex flex-col items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-vault-500/10 border border-vault-500/20">
                <Upload className="h-7 w-7 text-vault-400" />
              </div>
              <div>
                <p className="text-lg font-semibold text-surface-800">
                  Drop files and folders here
                </p>
                <p className="mt-1 text-sm text-surface-500 mb-6">
                  Any file type · No size limit
                </p>
                <div className="flex items-center justify-center gap-4">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="btn-secondary"
                  >
                    Select Files
                  </button>
                  <button
                    onClick={() => folderInputRef.current?.click()}
                    className="btn-secondary"
                  >
                    Select Folder
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* File List */}
        <AnimatePresence>
          {store.files.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-6 space-y-2"
            >
              {store.files.map((f) => (
                <motion.div
                  key={f.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="card flex items-center gap-4 p-4"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-200">
                    <FileIcon className="h-5 w-5 text-surface-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-800 truncate" title={f.path}>
                      {f.path}
                    </p>
                    <p className="text-xs text-surface-500">
                      {formatBytes(f.file.size)}
                    </p>
                    {f.status === 'uploading' && (
                      <div className="mt-2 progress-bar">
                        <div
                          className="progress-bar-fill"
                          style={{ width: `${f.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                  {f.status === 'complete' ? (
                    <Check className="h-5 w-5 text-accent-emerald" />
                  ) : f.status === 'uploading' ? (
                    <span className="text-xs text-vault-400 font-mono">
                      {Math.round(f.progress)}%
                    </span>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        store.removeFile(f.id);
                      }}
                      className="p-1.5 rounded-lg hover:bg-surface-200 text-surface-500 hover:text-surface-700 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </motion.div>
              ))}

              {/* Total */}
              <div className="flex items-center justify-between px-4 py-2 text-sm text-surface-600">
                <span>
                  {store.files.length} file{store.files.length > 1 ? 's' : ''}
                </span>
                <span className="font-medium">{formatBytes(totalSize)}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Settings */}
        {store.files.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 card p-6 space-y-5"
          >
            <h3 className="text-sm font-semibold text-surface-700 uppercase tracking-wider">
              Transfer Settings
            </h3>

            {/* Expiration */}
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-2">
                <Clock className="inline h-4 w-4 mr-1.5 text-surface-500" />
                Expiration
              </label>
              <div className="flex flex-wrap gap-2">
                {EXPIRATION_OPTIONS.map((opt) => (
                  <button
                    key={opt.hours}
                    onClick={() => store.setConfig({ expirationHours: opt.hours })}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      store.expirationHours === opt.hours
                        ? 'bg-vault-500/15 text-vault-400 border border-vault-500/30'
                        : 'bg-surface-200 text-surface-600 border border-transparent hover:bg-surface-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-2">
                <Lock className="inline h-4 w-4 mr-1.5 text-surface-500" />
                Password Protection{' '}
                <span className="text-surface-500 font-normal">(optional)</span>
              </label>
              <input
                type="password"
                value={store.password}
                onChange={(e) => store.setConfig({ password: e.target.value })}
                placeholder="Enter a password to protect this transfer"
                className="input w-full"
              />
            </div>

            {/* Max Downloads */}
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-2">
                <Hash className="inline h-4 w-4 mr-1.5 text-surface-500" />
                Download Limit{' '}
                <span className="text-surface-500 font-normal">(optional)</span>
              </label>
              <input
                type="number"
                min={1}
                value={store.maxDownloads ?? ''}
                onChange={(e) =>
                  store.setConfig({
                    maxDownloads: e.target.value ? parseInt(e.target.value) : null,
                  })
                }
                placeholder="Unlimited"
                className="input w-full max-w-xs"
              />
            </div>

            {/* Encrypt toggle */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => store.setConfig({ isEncrypted: !store.isEncrypted })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  store.isEncrypted ? 'bg-vault-500' : 'bg-surface-400'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                    store.isEncrypted ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <label className="text-sm font-medium text-surface-700">
                <Shield className="inline h-4 w-4 mr-1 text-surface-500" />
                End-to-end encrypt files
              </label>
            </div>
          </motion.div>
        )}

        {/* Error */}
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 p-4 rounded-xl bg-accent-rose/10 border border-accent-rose/20 text-accent-rose text-sm"
          >
            {error}
          </motion.div>
        )}

        {/* Upload Button */}
        {store.files.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 text-center"
          >
            <button
              onClick={() => void handleUpload()}
              disabled={uploading || store.files.length === 0}
              className="btn-primary inline-flex items-center gap-2.5 px-10 py-4 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-5 w-5" />
                  Upload {store.files.length} File
                  {store.files.length > 1 ? 's' : ''}
                  <span className="text-vault-200 ml-1">
                    ({formatBytes(totalSize)})
                  </span>
                </>
              )}
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
