// ============================================
// TransferVault — Web Crypto Helpers
// AES-256-GCM encryption/decryption in browser.
// ============================================

const PBKDF2_ITERATIONS = 600_000;
const SALT_LENGTH = 16; // bytes
const IV_LENGTH = 12; // bytes (AES-GCM standard)
const CHUNK_SIZE = 16 * 1024 * 1024; // 16MB chunks for encryption

/**
 * Derive an AES-256-GCM key from a password using PBKDF2.
 */
export async function deriveKey(
  password: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Generate a random salt.
 */
export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

/**
 * Encrypt a chunk with AES-256-GCM.
 * Uses a unique IV per chunk and includes chunk index in AAD.
 */
export async function encryptChunk(
  key: CryptoKey,
  data: ArrayBuffer,
  chunkIndex: number,
): Promise<{ iv: Uint8Array; ciphertext: ArrayBuffer }> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // Include chunk index in additional authenticated data (AAD)
  // This prevents chunk reordering attacks
  const aad = new Uint8Array(4);
  new DataView(aad.buffer).setUint32(0, chunkIndex, true);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    key,
    data,
  );

  return { iv, ciphertext };
}

/**
 * Decrypt a chunk with AES-256-GCM.
 */
export async function decryptChunk(
  key: CryptoKey,
  ciphertext: ArrayBuffer,
  iv: Uint8Array,
  chunkIndex: number,
): Promise<ArrayBuffer> {
  const aad = new Uint8Array(4);
  new DataView(aad.buffer).setUint32(0, chunkIndex, true);

  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    key,
    ciphertext,
  );
}

/**
 * Encrypt an entire file by splitting into chunks.
 * Returns metadata + encrypted blob.
 */
export async function encryptFile(
  file: File,
  password: string,
): Promise<{ encryptedBlob: Blob; salt: Uint8Array; chunkCount: number }> {
  const salt = generateSalt();
  const key = await deriveKey(password, salt);

  const chunks: Blob[] = [];
  let offset = 0;
  let chunkIndex = 0;

  while (offset < file.size) {
    const end = Math.min(offset + CHUNK_SIZE, file.size);
    const slice = await file.slice(offset, end).arrayBuffer();

    const { iv, ciphertext } = await encryptChunk(key, slice, chunkIndex);

    // Pack: [iv_length(1) | iv | ciphertext]
    const packed = new Uint8Array(1 + iv.length + ciphertext.byteLength);
    packed[0] = iv.length;
    packed.set(iv, 1);
    packed.set(new Uint8Array(ciphertext), 1 + iv.length);

    chunks.push(new Blob([packed]));

    offset = end;
    chunkIndex++;
  }

  return {
    encryptedBlob: new Blob(chunks),
    salt,
    chunkCount: chunkIndex,
  };
}

/**
 * Decrypt an encrypted blob back to original file data.
 */
export async function decryptBlob(
  blob: Blob,
  password: string,
  salt: Uint8Array,
): Promise<Blob> {
  const key = await deriveKey(password, salt);
  const buffer = await blob.arrayBuffer();

  const decryptedChunks: ArrayBuffer[] = [];
  let offset = 0;
  let chunkIndex = 0;

  while (offset < buffer.byteLength) {
    const ivLength = new Uint8Array(buffer, offset, 1)[0]!;
    offset += 1;

    const iv = new Uint8Array(buffer, offset, ivLength);
    offset += ivLength;

    // Determine ciphertext length: either to next chunk or end of buffer
    // AES-GCM ciphertext = plaintext + 16 bytes (auth tag)
    const remainingInChunk = Math.min(
      CHUNK_SIZE + 16, // max encrypted chunk size
      buffer.byteLength - offset,
    );

    const ciphertext = buffer.slice(offset, offset + remainingInChunk);
    offset += remainingInChunk;

    const plaintext = await decryptChunk(key, ciphertext, iv, chunkIndex);
    decryptedChunks.push(plaintext);
    chunkIndex++;
  }

  return new Blob(decryptedChunks);
}

export { CHUNK_SIZE };
