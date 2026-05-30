import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Menu, X } from 'lucide-react';
import { useState } from 'react';

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  const navLinks = [
    { path: '/', label: 'Home' },
    { path: '/upload', label: 'Upload' },
    { path: '/download', label: 'Download' },
  ];

  return (
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
          </nav>

          {/* Mobile Actions */}
          <div className="flex items-center gap-1 md:hidden">
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
  );
}
