/**
 * Browser-based AES-GCM encryption for large files.
 * Uses the native Web Crypto API for high performance.
 */

export async function encryptFileClient(file: File) {
  const key = await window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const fileBuffer = await file.arrayBuffer();

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
    ivHex
  };
}
