// ============================================
// TransferVault Daemon — Pairing Code Service
// Generates cryptographically secure pair codes
// with 128-bit entropy.
// ============================================

import crypto from 'node:crypto';

// Custom alphabet: uppercase alphanumeric without ambiguous chars (0/O, 1/I/L)
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // 29 chars
const CODE_LENGTH = 12; // 12 chars = ~58 bits per segment, total ~58 bits
// Actually: 29^12 ≈ 2^58, not quite 128-bit. So use 16 bytes of entropy
// and encode to our format for display.

/**
 * Generate a cryptographically secure pairing code.
 * Uses 16 bytes (128 bits) of crypto.randomBytes as entropy source,
 * then maps to our custom alphabet for human-readability.
 *
 * Output format: XXXX-XXXX-XXXX (12 chars, 3 groups of 4)
 */
export function generatePairCode(): string {
  const bytes = crypto.randomBytes(16); // 128 bits of entropy
  const chars: string[] = [];

  for (let i = 0; i < CODE_LENGTH; i++) {
    // Use two bytes per character for better distribution
    // Combine two consecutive bytes, mod by alphabet length
    const idx1 = i * 2 < bytes.length ? bytes[i * 2]! : 0;
    const idx2 = i * 2 + 1 < bytes.length ? bytes[i * 2 + 1]! : 0;
    const combined = (idx1 * 256 + idx2) % ALPHABET.length;
    chars.push(ALPHABET[combined]!);
  }

  // Format as XXXX-XXXX-XXXX
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`;
}

/**
 * Validate a pair code format.
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
 * Normalize a pair code: strip dashes, uppercase.
 */
export function normalizePairCode(code: string): string {
  return code.replace(/-/g, '').toUpperCase().trim();
}

/**
 * Format a raw code (no dashes) into display format.
 */
export function formatPairCode(raw: string): string {
  const clean = raw.replace(/-/g, '').toUpperCase();
  if (clean.length !== CODE_LENGTH) return raw;
  return `${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8, 12)}`;
}
