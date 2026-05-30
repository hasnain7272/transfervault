import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Download,
  FileIcon,
  Lock,
  Clock,
  ArrowDown,
  Loader2,
  AlertCircle,
  Shield,
  Check,
} from 'lucide-react';
import { useDownloadStore } from '@/stores/download';
import {
  formatBytes,
  formatPairCodeInput,
  normalizePairCode,
  validatePairCode,
  formatRelativeTime,
} from '@/lib/utils';
import { api, discoverDaemonUrl } from '@/lib/api';

export function DownloadPage() {
  const store = useDownloadStore();
  const [loading, setLoading] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const handleLookup = useCallback(async () => {
    const normalized = normalizePairCode(store.pairCode);
    if (!validatePairCode(normalized)) return;

    setLoading(true);
    store.setStatus('looking_up');

    try {
      // Dynamic matchmaking: fetch the absolute latest daemon URL from Supabase before looking up
      await discoverDaemonUrl();
      const transfer = await api.lookupTransfer(normalized);
      store.setTransfer(transfer);
    } catch {
      store.setStatus('not_found');
    } finally {
      setLoading(false);
    }
  }, [store]);

  const handlePasswordVerify = useCallback(async () => {
    if (!store.transfer) return;
    setPasswordError(null);

    try {
      const result = await api.verifyPassword(store.transfer.id, passwordInput);
      if (result.valid) {
        store.setPassword(passwordInput);
        store.setPasswordVerified(true);
      } else {
        setPasswordError('Incorrect password');
      }
    } catch {
      setPasswordError('Verification failed');
    }
  }, [store, passwordInput]);

  const handleDownload = useCallback(
    (fileId: string) => {
      if (!store.transfer) return;

      const url = api.getDownloadUrl(
        store.transfer.id,
        fileId,
        store.password || undefined,
      );

      // Open download in new tab/trigger browser download
      const link = document.createElement('a');
      link.href = url;
      link.download = '';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Mark as complete immediately (we can't track external browser download progress)
      store.setFileStatus(fileId, 'complete');
    },
    [store],
  );

  const handleDownloadAll = useCallback(() => {
    if (!store.transfer) return;

    const url = api.getArchiveDownloadUrl(
      store.transfer.id,
      store.password || undefined,
    );

    const link = document.createElement('a');
    link.href = url;
    link.download = '';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    store.setStatus('complete');
    for (const file of store.files) {
      store.setFileStatus(file.id, 'complete');
    }
  }, [store]);

  const handlePairCodeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const formatted = formatPairCodeInput(e.target.value);
      store.setPairCode(formatted);
    },
    [store],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        void handleLookup();
      }
    },
    [handleLookup],
  );

  // ── Transfer found ──
  if (store.transfer && (store.status === 'ready' || store.status === 'downloading' || store.status === 'complete')) {
    const transfer = store.transfer;
    const expiresAt = new Date(transfer.expires_at);

    return (
      <div className="min-h-[80vh] py-12 px-4">
        <div className="mx-auto max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-8"
          >
            <div className="inline-flex items-center gap-2 rounded-full bg-accent-emerald/10 border border-accent-emerald/20 px-4 py-1.5 text-xs font-medium text-accent-emerald mb-4">
              <Check className="h-3.5 w-3.5" />
              Transfer Found
            </div>
            <h1 className="text-3xl font-bold text-surface-950 mb-2">
              {transfer.title || 'Shared Files'}
            </h1>
            {transfer.message && (
              <p className="text-surface-600">{transfer.message}</p>
            )}
          </motion.div>

          {/* Transfer info */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex items-center justify-center gap-6 text-sm text-surface-500 mb-8"
          >
            <span className="flex items-center gap-1.5">
              <FileIcon className="h-4 w-4" />
              {transfer.file_count} file{transfer.file_count > 1 ? 's' : ''}
            </span>
            <span>·</span>
            <span>{formatBytes(transfer.size_bytes)}</span>
            <span>·</span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              Expires {formatRelativeTime(expiresAt)}
            </span>
            {transfer.is_encrypted && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1.5 text-vault-400">
                  <Shield className="h-4 w-4" />
                  Encrypted
                </span>
              </>
            )}
          </motion.div>

          {/* File list */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-2 mb-8"
          >
            {store.files.map((file, i) => (
              <motion.div
                key={file.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.05 }}
                className="card flex items-center gap-4 p-4"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-200">
                  <FileIcon className="h-5 w-5 text-surface-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-surface-800 truncate">
                    {file.filename}
                  </p>
                  <p className="text-xs text-surface-500">
                    {formatBytes(file.size_bytes)}
                    {file.mime_type && ` · ${file.mime_type}`}
                  </p>
                </div>
                <button
                  onClick={() => handleDownload(file.id)}
                  disabled={file.status === 'downloading'}
                  className="btn-secondary flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-50"
                >
                  {file.status === 'downloading' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : file.status === 'complete' ? (
                    <Check className="h-4 w-4 text-accent-emerald" />
                  ) : (
                    <ArrowDown className="h-4 w-4" />
                  )}
                  {file.status === 'complete' ? 'Done' : 'Download'}
                </button>
              </motion.div>
            ))}
          </motion.div>

          {/* Download All */}
          {store.files.length > 1 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-center"
            >
              <button
                onClick={handleDownloadAll}
                className="btn-primary inline-flex items-center gap-2.5 px-8 py-3.5 text-base"
              >
                <Download className="h-5 w-5" />
                Download All ({formatBytes(transfer.size_bytes)})
              </button>
            </motion.div>
          )}

          {/* New lookup */}
          <div className="mt-8 text-center">
            <button
              onClick={() => store.reset()}
              className="text-sm text-surface-500 hover:text-surface-700 transition-colors"
            >
              Look up another transfer
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Password required ──
  if (store.status === 'password_required') {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md text-center"
        >
          <div className="glass rounded-3xl p-10">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-vault-500/10 border border-vault-500/20 mb-6">
              <Lock className="h-7 w-7 text-vault-400" />
            </div>
            <h2 className="text-2xl font-bold text-surface-950 mb-2">
              Password Required
            </h2>
            <p className="text-surface-600 mb-6">
              This transfer is password-protected. Enter the password to access files.
            </p>

            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void handlePasswordVerify()}
              placeholder="Enter password"
              className="input w-full mb-4"
              autoFocus
            />

            {passwordError && (
              <p className="text-sm text-accent-rose mb-4">{passwordError}</p>
            )}

            <button
              onClick={() => void handlePasswordVerify()}
              className="btn-primary w-full py-3"
            >
              Unlock Transfer
            </button>

            <button
              onClick={() => store.reset()}
              className="mt-4 text-sm text-surface-500 hover:text-surface-700"
            >
              Try a different code
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Pair code input ──
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-lg text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl sm:text-4xl font-bold text-surface-950 mb-3">
            Download Files
          </h1>
          <p className="text-surface-600 text-lg mb-10">
            Enter the pairing code you received to access your files.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <input
            type="text"
            value={store.pairCode}
            onChange={handlePairCodeChange}
            onKeyDown={handleKeyDown}
            placeholder="XXXX-XXXX-XXXX"
            className="pair-code-input"
            maxLength={14}
            autoFocus
            spellCheck={false}
            autoComplete="off"
          />
        </motion.div>

        {/* Not found error */}
        {store.status === 'not_found' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-center gap-2 text-accent-rose text-sm mb-6"
          >
            <AlertCircle className="h-4 w-4" />
            Transfer not found or expired
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <button
            onClick={() => void handleLookup()}
            disabled={loading || normalizePairCode(store.pairCode).length < 12}
            className="btn-primary inline-flex items-center gap-2.5 px-10 py-4 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Looking up...
              </>
            ) : (
              <>
                <Download className="h-5 w-5" />
                Access Files
              </>
            )}
          </button>
        </motion.div>
      </div>
    </div>
  );
}
