// ============================================
// TransferVault — Pairing Code Utilities
// ============================================

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 12;

/**
 * Validate a pair code string.
 * Accepts with or without dashes.
 */
export function validatePairCode(code: string): boolean {
  const clean = normalizePairCode(code);
  if (clean.length !== CODE_LENGTH) return false;

  for (const char of clean) {
    if (!ALPHABET.includes(char)) return false;
  }

  return true;
}

/**
 * Normalize: strip dashes, uppercase, trim.
 */
export function normalizePairCode(code: string): string {
  return code.replace(/[-\s]/g, '').toUpperCase().trim();
}

/**
 * Format raw code into display format: XXXX-XXXX-XXXX
 */
export function formatPairCode(raw: string): string {
  const clean = normalizePairCode(raw);
  if (clean.length <= 4) return clean;
  if (clean.length <= 8)
    return `${clean.slice(0, 4)}-${clean.slice(4)}`;
  return `${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8, 12)}`;
}

/**
 * Format a raw input value with auto-dashes as user types.
 */
export function formatPairCodeInput(input: string): string {
  // Strip everything except valid chars
  const clean = input
    .toUpperCase()
    .replace(/[^23456789ABCDEFGHJKMNPQRSTUVWXYZ]/g, '')
    .slice(0, CODE_LENGTH);

  return formatPairCode(clean);
}

/**
 * Format file size for display.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${units[i]}`;
}

/**
 * Format duration for display.
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  if (seconds < 3600)
    return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

/**
 * Format speed for display.
 */
export function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

/**
 * Format relative time (e.g., "2 hours ago", "in 3 days").
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const absDiffMs = Math.abs(diffMs);

  const seconds = Math.floor(absDiffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const isFuture = diffMs > 0;
  const prefix = isFuture ? 'in ' : '';
  const suffix = isFuture ? '' : ' ago';

  if (days > 0) return `${prefix}${days}d${suffix}`;
  if (hours > 0) return `${prefix}${hours}h${suffix}`;
  if (minutes > 0) return `${prefix}${minutes}m${suffix}`;
  return `${prefix}${seconds}s${suffix}`;
}
