import CryptoJS from 'crypto-js';
import { ENCRYPTION_KEY } from '../constants.local';

// Get the encryption key from environment variables

export class Encryption {
  private static key = CryptoJS.enc.Base64.parse(ENCRYPTION_KEY);

  // Generate a secure key using Web Crypto API
  static async generateKey(): Promise<string> {
    try {
      const randomBytes = new Uint8Array(32);
      window.crypto.getRandomValues(randomBytes);

      const wordArray = CryptoJS.lib.WordArray.create(Array.from(randomBytes) as unknown as number[]);
      return wordArray.toString(CryptoJS.enc.Base64);
    } catch (error) {
      console.error('Error generating key:', error);
      return CryptoJS.lib.WordArray.random(32).toString(CryptoJS.enc.Base64);
    }
  }

  // Generate random IV using Web Crypto API
  private static async generateRandomIV(): Promise<CryptoJS.lib.WordArray> {
    try {
      const randomBytes = new Uint8Array(16);
      window.crypto.getRandomValues(randomBytes);

      return CryptoJS.lib.WordArray.create(Array.from(randomBytes) as unknown as number[]);
    } catch (error) {
      console.warn('Web Crypto failed, falling back to CryptoJS random:', error);
      return CryptoJS.lib.WordArray.random(16);
    }
  }

  // Encrypt data with AES
  static async encrypt(data: any): Promise<{
    encrypted: string;
    iv: string;
    hmac: string;
    timestamp: number;
  }> {
    try {
      const iv = await this.generateRandomIV();
      const dataString = JSON.stringify(data);

      const encrypted = CryptoJS.AES.encrypt(dataString, this.key, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      }).toString();

      const hmac = CryptoJS.HmacSHA256(dataString, this.key).toString();

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
      const encrypted = CryptoJS.enc.Base64.parse(encryptedData);
      const ivWordArray = CryptoJS.enc.Hex.parse(iv);

      const decrypted = CryptoJS.AES.decrypt(
        { ciphertext: encrypted } as any,
        this.key,
        {
          iv: ivWordArray,
          mode: CryptoJS.mode.CBC,
          padding: CryptoJS.pad.Pkcs7,
        }
      );

      const decryptedString = decrypted.toString(CryptoJS.enc.Utf8);
      const calculatedHmac = CryptoJS.HmacSHA256(decryptedString, this.key).toString();

      if (calculatedHmac !== hmac) {
        throw new Error('HMAC verification failed - data may have been tampered with');
      }

      return JSON.parse(decryptedString);
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Failed to decrypt data');
    }
  }
}
