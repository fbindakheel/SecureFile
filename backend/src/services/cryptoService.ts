import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const ALGORITHM = 'aes-256-gcm';
// In a real app, this should be a secure, randomly generated 32-byte key stored securely.
// For this simple demo, we use a fixed key based on an env var or a default.
const SECRET_KEY = crypto.scryptSync(process.env.ENCRYPTION_SECRET || 'my-super-secret-encryption-key-for-files', 'salt', 32);

export const encryptFile = (inputPath: string, outputPath: string): Promise<{ iv: string, authTag: string }> => {
  return new Promise((resolve, reject) => {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv);
    
    const input = fs.createReadStream(inputPath);
    const output = fs.createWriteStream(outputPath);

    input.pipe(cipher).pipe(output);

    output.on('finish', () => {
      const authTag = cipher.getAuthTag();
      resolve({
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex')
      });
    });

    output.on('error', reject);
    input.on('error', reject);
    cipher.on('error', reject);
  });
};

export const decryptFileStream = (inputPath: string, ivHex: string, authTagHex: string): any => {
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, SECRET_KEY, iv);
  decipher.setAuthTag(authTag);
  
  return decipher;
};
