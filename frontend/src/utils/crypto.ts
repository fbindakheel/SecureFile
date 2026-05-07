/**
 * Browser-based AES-GCM encryption and SHA-256 hashing for large files.
 * Uses the native Web Crypto API for high performance.
 */

export async function encryptFileClient(file: File) {
  const fileBuffer = await file.arrayBuffer();

  // 1. Calculate SHA-256 Hash for Deduplication
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', fileBuffer);
  const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

  // 2. Generate Encryption Key
  const key = await window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  // 3. Encrypt
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    fileBuffer
  );

  const exportedKey = await window.crypto.subtle.exportKey('raw', key);
  
  // Convert to hex for storage
  const keyHex = Array.from(new Uint8Array(exportedKey)).map(b => b.toString(16).padStart(2, '0')).join('');
  const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');

  return {
    encryptedBlob: new Blob([encryptedBuffer]),
    keyHex,
    ivHex,
    hashHex
  };
}
