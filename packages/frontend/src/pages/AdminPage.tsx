import { useState, useEffect } from 'react';
import { formatBytes } from '@/lib/utils';
import { Loader2, Activity, HardDrive, Download, Upload, Settings, CheckCircle2, AlertCircle, RefreshCw, Trash2 } from 'lucide-react';
import { getDaemonUrl, api, discoverDaemonUrl } from '@/lib/api';

export function AdminPage() {
  const [stats, setStats] = useState<any>(null);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [secret, setSecret] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Daemon settings state
  const [daemonUrlInput, setDaemonUrlInput] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'checking' | 'healthy' | 'offline'>('idle');
  const [testError, setTestError] = useState('');

  const fetchStats = async (adminSecret: string) => {
    try {
      await discoverDaemonUrl(); // Fetch dynamic public URL
      const DAEMON_URL = getDaemonUrl();
      if (!DAEMON_URL) {
        throw new Error('No active daemon URL resolved. Ensure your daemon is running and has registered its URL.');
      }
      
      const [statsRes, transfersRes] = await Promise.all([
        fetch(`${DAEMON_URL}/api/admin/stats`, {
          headers: {
            'x-daemon-secret': adminSecret,
            'bypass-tunnel-reminder': 'true', // Bypass localtunnel warning page
          },
        }),
        fetch(`${DAEMON_URL}/api/admin/transfers?limit=100`, {
          headers: {
            'x-daemon-secret': adminSecret,
            'bypass-tunnel-reminder': 'true', // Bypass localtunnel warning page
          },
        })
      ]);
      
      if (!statsRes.ok || !transfersRes.ok) throw new Error('Invalid secret or daemon offline');
      
      const statsData = await statsRes.json();
      const transfersData = await transfersRes.json();
      
      setStats(statsData);
      setTransfers(transfersData);
      setAuthenticated(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch stats');
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const savedSecret = localStorage.getItem('admin_secret');
    if (savedSecret) {
      setSecret(savedSecret);
      fetchStats(savedSecret);
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authenticated) {
      setDaemonUrlInput(getDaemonUrl());
    }
  }, [authenticated]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    localStorage.setItem('admin_secret', secret);
    fetchStats(secret);
  };

  const handleSaveUrl = () => {
    let cleanUrl = daemonUrlInput.trim();
    if (cleanUrl) {
      cleanUrl = cleanUrl.replace(/\/$/, '');
      localStorage.setItem('transfervault_daemon_url', cleanUrl);
    } else {
      localStorage.removeItem('transfervault_daemon_url');
    }
    setTestStatus('idle');
    setTestError('');
    // Fetch stats again with the new URL
    if (secret) fetchStats(secret);
  };

  const handleResetUrl = () => {
    localStorage.removeItem('transfervault_daemon_url');
    setDaemonUrlInput(getDaemonUrl());
    setTestStatus('idle');
    setTestError('');
    if (secret) fetchStats(secret);
  };

  const handleDeleteTransfer = async (transferId: string) => {
    if (!confirm('Are you sure you want to permanently delete this transfer and all its files from disk?')) return;
    try {
      await api.deleteAdminTransfer(transferId, secret);
      fetchStats(secret);
      alert('Transfer deleted successfully');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete transfer');
    }
  };

  const testConnection = async () => {
    setTestStatus('checking');
    setTestError('');
    let url = daemonUrlInput.trim().replace(/\/$/, '');
    
    if (!url) {
      setTestStatus('offline');
      setTestError('Endpoint URL cannot be empty');
      return;
    }

    if (!/^https?:\/\//i.test(url)) {
      url = `http://${url}`;
    }

    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 6000); // 6s timeout

      const res = await fetch(`${url}/health`, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'bypass-tunnel-reminder': 'true', // Bypass localtunnel warning landing page
        }
      });
      clearTimeout(id);

      if (res.ok) {
        setTestStatus('healthy');
      } else {
        setTestStatus('offline');
        setTestError(`Returned status code: ${res.status}`);
      }
    } catch (err) {
      setTestStatus('offline');
      setTestError(
        err instanceof Error && err.name === 'AbortError'
          ? 'Connection timed out after 6 seconds'
          : 'Could not connect. Ensure your daemon is running, tunnel is active, and CORS is enabled.'
      );
    }
  };

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-vault-500" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4">
        <div className="card w-full max-w-md p-8">
          <h2 className="mb-6 text-2xl font-bold text-surface-950">Daemon Admin</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-surface-700">Daemon Secret</label>
              <input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                className="input w-full"
                placeholder="Enter DAEMON_SECRET"
                required
              />
            </div>
            {error && <p className="text-sm text-accent-rose">{error}</p>}
            <button type="submit" className="btn-primary w-full">Access Admin</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-surface-950">System Admin</h1>
          <p className="text-surface-600">Live stats from the laptop daemon.</p>
        </div>
        <button
          onClick={() => {
            localStorage.removeItem('admin_secret');
            setAuthenticated(false);
            setSecret('');
          }}
          className="btn-secondary"
        >
          Lock
        </button>
      </div>

      {/* Daemon Settings Card */}
      <div className="card p-6 mb-8 border border-surface-200 bg-white">
        <h2 className="text-lg font-bold text-surface-900 mb-2 flex items-center gap-2">
          <Settings className="h-5 w-5 text-vault-500" />
          Daemon Connection Settings
        </h2>
        <p className="text-xs text-surface-500 mb-4 leading-relaxed">
          Your laptop serves as the physical storage vault. When hosting live, the frontend automatically discovers the daemon's active tunnel URL from Supabase. You can manually override or test the connection here.
        </p>
        
        <div className="flex flex-col md:flex-row gap-3 items-end">
          <div className="flex-1 w-full space-y-1">
            <label className="text-xs font-semibold text-surface-700">Active Daemon URL</label>
            <input
              type="url"
              value={daemonUrlInput}
              onChange={(e) => {
                setDaemonUrlInput(e.target.value);
                setTestStatus('idle');
              }}
              placeholder="https://your-tunnel.loca.lt"
              className="w-full rounded-xl border border-surface-300 bg-surface-50 px-3.5 py-2 text-sm text-surface-900 focus:outline-none focus:ring-1 focus:ring-vault-500 focus:border-vault-500 shadow-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2 w-full md:w-auto justify-end">
            <button
              onClick={handleSaveUrl}
              className="btn-primary py-2 px-4 text-xs font-medium"
            >
              Save URL
            </button>
            <button
              onClick={handleResetUrl}
              className="btn-secondary py-2 px-4 text-xs font-medium hover:text-accent-rose"
            >
              Reset Default
            </button>
            <button
              disabled={testStatus === 'checking'}
              onClick={testConnection}
              className="btn-secondary py-2 px-4 text-xs font-medium flex items-center gap-1.5"
            >
              {testStatus === 'checking' ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
              Test Connection
            </button>
          </div>
        </div>

        {/* Live check response */}
        {testStatus !== 'idle' && (
          <div className={`mt-4 rounded-xl p-3 border text-xs flex gap-2 ${
            testStatus === 'checking' ? 'bg-surface-50 border-surface-200 text-surface-600' :
            testStatus === 'healthy' ? 'bg-accent-emerald/5 border-accent-emerald/20 text-accent-emerald' :
            'bg-accent-rose/5 border-accent-rose/20 text-accent-rose'
          }`}>
            <div className="mt-0.5 flex-shrink-0">
              {testStatus === 'checking' && <RefreshCw className="h-4 w-4 animate-spin text-surface-500" />}
              {testStatus === 'healthy' && <CheckCircle2 className="h-4 w-4" />}
              {testStatus === 'offline' && <AlertCircle className="h-4 w-4" />}
            </div>
            <div>
              <p className="font-semibold">
                {testStatus === 'checking' && 'Pinging active daemon URL...'}
                {testStatus === 'healthy' && 'Connection healthy and fully operational!'}
                {testStatus === 'offline' && 'Daemon is unreachable'}
              </p>
              {testError && <p className="mt-1 text-[11px] font-mono leading-relaxed opacity-95">{testError}</p>}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {/* Status */}
        <div className="card p-6">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-vault-500/10 text-vault-500">
            <Activity className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-surface-500">Daemon Status</p>
          <p className="text-2xl font-bold text-surface-950">
            {stats?.daemon_online ? (
              <span className="text-accent-emerald">Online</span>
            ) : (
              <span className="text-accent-rose">Offline</span>
            )}
          </p>
          <p className="mt-1 text-xs text-surface-500">Uptime: {Math.floor((stats?.uptime_seconds || 0) / 3600)}h {Math.floor(((stats?.uptime_seconds || 0) % 3600) / 60)}m</p>
        </div>

        {/* Disk Usage */}
        <div className="card p-6">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
            <HardDrive className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-surface-500">Disk Space (Vault)</p>
          <p className="text-2xl font-bold text-surface-950">{formatBytes(stats?.transfers_size_bytes || 0)}</p>
          <div className="mt-2 progress-bar h-1.5">
            <div
              className="progress-bar-fill"
              style={{ width: `${((stats?.disk_used_bytes || 0) / (stats?.disk_total_bytes || 1)) * 100}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-surface-500">{formatBytes(stats?.disk_free_bytes || 0)} free of {formatBytes(stats?.disk_total_bytes || 0)}</p>
        </div>

        {/* Total Transfers */}
        <div className="card p-6">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent-emerald/10 text-accent-emerald">
            <Upload className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-surface-500">Total Transfers</p>
          <p className="text-2xl font-bold text-surface-950">{stats?.total_transfers || 0}</p>
        </div>
      </div>

      <div className="mt-12">
        <h2 className="mb-6 text-xl font-bold text-surface-950">Recent Transfers</h2>
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-100/50 text-surface-500">
                <tr>
                  <th className="px-6 py-4 font-medium">Pair Code</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium">Size</th>
                  <th className="px-6 py-4 font-medium">Files</th>
                  <th className="px-6 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-200">
                {transfers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-surface-500">
                      No transfers found
                    </td>
                  </tr>
                ) : (
                  transfers.map((t) => (
                    <tr key={t.id} className="hover:bg-surface-50/50">
                      <td className="px-6 py-4 font-mono font-medium text-surface-900">
                        {t.pair_code}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                          t.status === 'ready' ? 'bg-accent-emerald/10 text-accent-emerald' :
                          t.status === 'uploading' ? 'bg-vault-500/10 text-vault-500' :
                          t.status === 'deleted' ? 'bg-accent-rose/10 text-accent-rose' :
                          'bg-surface-200 text-surface-600'
                        }`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-surface-600">
                        {formatBytes(t.size_bytes)}
                      </td>
                      <td className="px-6 py-4 text-surface-600">
                        <div className="space-y-2">
                          {t.files?.map((f: any) => (
                            <div key={f.id} className="flex items-center justify-between gap-4">
                              <span className="truncate max-w-[200px]" title={f.filename}>{f.filename}</span>
                              <span className="text-xs text-surface-400">{formatBytes(f.size_bytes)}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex flex-col items-end gap-2.5">
                          {t.status === 'ready' && t.files?.map((f: any) => {
                            const DAEMON_URL = getDaemonUrl();
                            const downloadUrl = `${DAEMON_URL}/api/download/${t.id}/${f.id}?admin_secret=${encodeURIComponent(secret)}`;
                            return (
                              <a
                                key={`dl-${f.id}`}
                                href={downloadUrl}
                                download={f.filename}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-vault-500 hover:text-vault-600 transition-colors"
                              >
                                <Download className="h-3.5 w-3.5" />
                                Download {f.filename.length > 15 ? f.filename.slice(0, 15) + '...' : f.filename}
                              </a>
                            );
                          })}
                          {t.status !== 'deleted' && (
                            <button
                              onClick={() => handleDeleteTransfer(t.id)}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-accent-rose hover:text-rose-600 transition-colors mt-1"
                              title="Delete Transfer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete Transfer
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
