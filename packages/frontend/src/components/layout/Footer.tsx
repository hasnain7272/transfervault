import { Shield } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t border-surface-300 bg-surface-50/50 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-vault-600 to-vault-500">
              <Shield className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-surface-700">
              TransferVault
            </span>
          </div>

          {/* Info */}
          <div className="flex items-center gap-6 text-xs text-surface-500">
            <span>Private file transfer</span>
            <span className="hidden sm:inline">·</span>
            <span className="hidden sm:inline">End-to-end encrypted</span>
            <span className="hidden sm:inline">·</span>
            <span className="hidden sm:inline">No cloud storage</span>
          </div>

          {/* Copyright */}
          <p className="text-xs text-surface-500">
            &copy; {new Date().getFullYear()} TransferVault
          </p>
        </div>
      </div>
    </footer>
  );
}
