import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Menu, X, Settings, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';
import { getDaemonUrl } from '@/lib/api';

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [daemonUrl, setDaemonUrl] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'checking' | 'healthy' | 'offline'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const location = useLocation();

  useEffect(() => {
    // Initialize daemon URL state from the api helper
    setDaemonUrl(getDaemonUrl());
  }, [settingsOpen]);

  const navLinks = [
    { path: '/', label: 'Home' },
    { path: '/upload', label: 'Upload' },
    { path: '/download', label: 'Download' },
  ];

  const handleSave = () => {
    let cleanUrl = daemonUrl.trim();
    if (cleanUrl) {
      // Remove trailing slash
      cleanUrl = cleanUrl.replace(/\/$/, '');
      localStorage.setItem('transfervault_daemon_url', cleanUrl);
    } else {
      localStorage.removeItem('transfervault_daemon_url');
    }
    setSettingsOpen(false);
    // Reload page to apply URL globally to api instance
    window.location.reload();
  };

  const handleReset = () => {
    localStorage.removeItem('transfervault_daemon_url');
    setDaemonUrl((import.meta.env.VITE_DAEMON_URL as string) || 'http://localhost:3001');
    setTestStatus('idle');
    setErrorMessage('');
  };

  const testConnection = async () => {
    setTestStatus('checking');
    setErrorMessage('');
    let url = daemonUrl.trim().replace(/\/$/, '');
    
    if (!url) {
      setTestStatus('offline');
      setErrorMessage('Endpoint URL cannot be empty');
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
        headers: { 'Accept': 'application/json' }
      });
      clearTimeout(id);

      if (res.ok) {
        setTestStatus('healthy');
      } else {
        setTestStatus('offline');
        setErrorMessage(`Returned status code: ${res.status}`);
      }
    } catch (err) {
      setTestStatus('offline');
      setErrorMessage(
        err instanceof Error && err.name === 'AbortError'
          ? 'Connection timed out after 6 seconds'
          : 'Could not connect. Ensure your daemon is running, tunnel is active, and CORS is enabled.'
      );
    }
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 glass">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2.5 group">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-vault-600 to-vault-400 shadow-lg shadow-vault-500/20 transition-transform group-hover:scale-105">
                <Shield className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-bold tracking-tight text-surface-900">
                Transfer<span className="gradient-text">Vault</span>
              </span>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-1.5">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    location.pathname === link.path
                      ? 'text-vault-400 bg-vault-500/10'
                      : 'text-surface-600 hover:text-surface-800 hover:bg-surface-200'
                  }`}
                >
                  {link.label}
                </Link>
              ))}

              {/* Settings Button */}
              <button
                onClick={() => setSettingsOpen(true)}
                className="ml-2 p-2 rounded-lg text-surface-500 hover:text-surface-800 hover:bg-surface-200 transition-colors"
                title="Daemon Settings"
              >
                <Settings className="h-5 w-5" />
              </button>
            </nav>

            {/* Mobile Actions */}
            <div className="flex items-center gap-1 md:hidden">
              <button
                onClick={() => setSettingsOpen(true)}
                className="p-2 rounded-lg text-surface-500 hover:text-surface-800 hover:bg-surface-200"
                title="Daemon Settings"
              >
                <Settings className="h-5 w-5" />
              </button>
              
              <button
                className="p-2 rounded-lg text-surface-600 hover:text-surface-800 hover:bg-surface-200"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="md:hidden border-t border-surface-300 bg-surface-50 px-4 py-3"
          >
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === link.path
                    ? 'text-vault-400 bg-vault-500/10'
                    : 'text-surface-600 hover:text-surface-800 hover:bg-surface-200'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </motion.div>
        )}
      </header>

      {/* ── Settings Modal ── */}
      <AnimatePresence>
        {settingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSettingsOpen(false)}
              className="absolute inset-0 bg-surface-950/40 backdrop-blur-sm"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white border border-surface-200 p-6 shadow-2xl z-10"
            >
              <div className="flex items-center justify-between border-b border-surface-100 pb-4 mb-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-vault-500/10 text-vault-500">
                    <Settings className="h-4.5 w-4.5" />
                  </div>
                  <h3 className="text-lg font-bold text-surface-900">Daemon Connection Settings</h3>
                </div>
                <button
                  onClick={() => setSettingsOpen(false)}
                  className="rounded-lg p-1 text-surface-400 hover:bg-surface-100 hover:text-surface-600 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <p className="text-xs text-surface-500 leading-relaxed">
                  Your laptop serves as the physical storage vault. When hosting live, the frontend communicates with the daemon over an HTTPS tunnel (e.g. cloudflared or localtunnel). Specify your active public URL below.
                </p>

                {/* Input block */}
                <div className="space-y-1.5">
                  <label htmlFor="daemon-url-input" className="text-xs font-semibold text-surface-700">
                    Laptop Daemon Endpoint URL
                  </label>
                  <input
                    id="daemon-url-input"
                    type="url"
                    value={daemonUrl}
                    onChange={(e) => {
                      setDaemonUrl(e.target.value);
                      if (testStatus !== 'idle') setTestStatus('idle');
                    }}
                    placeholder="https://your-tunnel.loca.lt or http://localhost:3001"
                    className="w-full rounded-xl border border-surface-300 bg-surface-50 px-3.5 py-2 text-sm text-surface-900 placeholder-surface-400 focus:border-vault-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-vault-500 transition-all shadow-sm"
                  />
                </div>

                {/* Status indicator */}
                <AnimatePresence mode="wait">
                  {testStatus !== 'idle' && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className={`flex gap-2 rounded-xl p-3 text-xs leading-normal border ${
                        testStatus === 'checking' ? 'bg-surface-50 border-surface-200 text-surface-600' :
                        testStatus === 'healthy' ? 'bg-accent-emerald/5 border-accent-emerald/20 text-accent-emerald' :
                        'bg-accent-rose/5 border-accent-rose/20 text-accent-rose'
                      }`}
                    >
                      <div className="mt-0.5 flex-shrink-0">
                        {testStatus === 'checking' && <RefreshCw className="h-4 w-4 animate-spin text-surface-500" />}
                        {testStatus === 'healthy' && <CheckCircle2 className="h-4 w-4" />}
                        {testStatus === 'offline' && <AlertCircle className="h-4 w-4" />}
                      </div>
                      <div>
                        <p className="font-semibold">
                          {testStatus === 'checking' && 'Pinging daemon...'}
                          {testStatus === 'healthy' && 'Connection fully operational!'}
                          {testStatus === 'offline' && 'Daemon unreachable'}
                        </p>
                        {errorMessage && (
                          <p className="mt-1 text-[11px] opacity-90 leading-relaxed font-mono">{errorMessage}</p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Actions */}
                <div className="flex gap-2.5 pt-3">
                  <button
                    type="button"
                    onClick={testConnection}
                    disabled={testStatus === 'checking'}
                    className="flex-1 btn-secondary text-xs py-2 px-3 flex items-center justify-center gap-1.5"
                  >
                    {testStatus === 'checking' ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        Testing...
                      </>
                    ) : (
                      'Check Status'
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="btn-secondary text-xs py-2 px-3 hover:text-accent-rose hover:border-accent-rose/30"
                  >
                    Reset Default
                  </button>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 border-t border-surface-100 mt-6 pt-4">
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  className="btn-secondary text-xs py-2 px-4"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="btn-primary text-xs py-2 px-4 shadow-md shadow-vault-500/10"
                >
                  Save & Apply
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
