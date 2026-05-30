import { useState, useEffect } from 'react';
import { formatBytes } from '@/lib/utils';
import { Loader2, Activity, HardDrive, Download, Upload } from 'lucide-react';
import { getDaemonUrl } from '@/lib/api';

export function AdminPage() {
  const [stats, setStats] = useState<any>(null);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [secret, setSecret] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async (adminSecret: string) => {
    try {
      const DAEMON_URL = getDaemonUrl();
      
      const [statsRes, transfersRes] = await Promise.all([
        fetch(`${DAEMON_URL}/api/admin/stats`, { headers: { 'x-daemon-secret': adminSecret } }),
        fetch(`${DAEMON_URL}/api/admin/transfers?limit=100`, { headers: { 'x-daemon-secret': adminSecret } })
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

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    localStorage.setItem('admin_secret', secret);
    fetchStats(secret);
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

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
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
                        <div className="flex flex-col items-end gap-2">
                          {t.status === 'ready' && t.files?.map((f: any) => {
                            const DAEMON_URL = getDaemonUrl();
                            const downloadUrl = `${DAEMON_URL}/api/download/${t.id}/${f.id}?admin_secret=${encodeURIComponent(secret)}`;
                            return (
                              <a
                                key={`dl-${f.id}`}
                                href={downloadUrl}
                                download={f.filename}
                                className="inline-flex items-center gap-1.5 text-sm font-medium text-vault-500 hover:text-vault-600 transition-colors"
                              >
                                <Download className="h-4 w-4" />
                                Download {f.filename.length > 15 ? f.filename.slice(0, 15) + '...' : f.filename}
                              </a>
                            );
                          })}
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
