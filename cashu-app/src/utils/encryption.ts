import CryptoJS from 'crypto-js';
import { ENCRYPTION_KEY } from '../constants.local';

// Get the encryption key from environment variables

export class Encryption {
  private static getKey(): CryptoJS.lib.WordArray {
    if (!ENCRYPTION_KEY) {
      throw new Error('VITE_ENCRYPTION_KEY is not configured');
    }
    return CryptoJS.enc.Base64.parse(ENCRYPTION_KEY);
  }

  private static constantTimeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  }

  // Generate a secure key using Web Crypto API
  static async generateKey(): Promise<string> {
    const randomBytes = new Uint8Array(32);
    window.crypto.getRandomValues(randomBytes);

    const wordArray = CryptoJS.lib.WordArray.create(Array.from(randomBytes) as unknown as number[]);
    return wordArray.toString(CryptoJS.enc.Base64);
  }

  // Generate random IV using Web Crypto API
  private static async generateRandomIV(): Promise<CryptoJS.lib.WordArray> {
    const randomBytes = new Uint8Array(16);
    window.crypto.getRandomValues(randomBytes);

    return CryptoJS.lib.WordArray.create(Array.from(randomBytes) as unknown as number[]);
  }

  // Encrypt data with AES
  static async encrypt(data: any): Promise<{
    encrypted: string;
    iv: string;
    hmac: string;
    timestamp: number;
  }> {
    try {
      const key = this.getKey();
      const iv = await this.generateRandomIV();
      const dataString = JSON.stringify(data);

      const encrypted = CryptoJS.AES.encrypt(dataString, key, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      }).toString();

      const hmac = CryptoJS.HmacSHA256(dataString, key).toString();

      return {
        encrypted,
        iv: iv.toString(CryptoJS.enc.Hex),
        hmac,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  // Decrypt data
  static async decrypt(encryptedData: string, iv: string, hmac: string): Promise<any> {
    try {
      const key = this.getKey();
      const encrypted = CryptoJS.enc.Base64.parse(encryptedData);
      const ivWordArray = CryptoJS.enc.Hex.parse(iv);

      const decrypted = CryptoJS.AES.decrypt(
        { ciphertext: encrypted } as any,
        key,
        {
          iv: ivWordArray,
          mode: CryptoJS.mode.CBC,
          padding: CryptoJS.pad.Pkcs7,
        }
      );

      const decryptedString = decrypted.toString(CryptoJS.enc.Utf8);
      const calculatedHmac = CryptoJS.HmacSHA256(decryptedString, key).toString();

      if (!this.constantTimeEqual(calculatedHmac, hmac)) {
        throw new Error('HMAC verification failed - data may have been tampered with');
      }

      return JSON.parse(decryptedString);
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Failed to decrypt data');
    }
  }
}
