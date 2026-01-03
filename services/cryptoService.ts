
export class CryptoService {
  private keyPair: CryptoKeyPair | null = null;
  private sharedKeys: Map<string, CryptoKey> = new Map();

  async generateIdentity(): Promise<string> {
    this.keyPair = await window.crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey']
    );
    const publicKey = await window.crypto.subtle.exportKey('spki', this.keyPair.publicKey);
    return this.arrayBufferToBase64(publicKey);
  }

  async importPublicKey(peerId: string, base64Key: string): Promise<void> {
    if (!this.keyPair) await this.generateIdentity();
    const importedKey = await window.crypto.subtle.importKey(
      'spki',
      this.base64ToArrayBuffer(base64Key),
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      []
    );

    const sharedKey = await window.crypto.subtle.deriveKey(
      { name: 'ECDH', public: importedKey },
      this.keyPair!.privateKey,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    this.sharedKeys.set(peerId, sharedKey);
  }

  async encrypt(peerId: string, text: string): Promise<string> {
    const key = this.sharedKeys.get(peerId);
    if (!key) return text; // Fallback if no handshake yet

    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(text);
    const encrypted = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoded
    );

    return JSON.stringify({
      iv: this.arrayBufferToBase64(iv),
      data: this.arrayBufferToBase64(encrypted)
    });
  }

  async decrypt(peerId: string, encryptedJson: string): Promise<string> {
    const key = this.sharedKeys.get(peerId);
    if (!key) return encryptedJson;

    try {
      const { iv, data } = JSON.parse(encryptedJson);
      const decrypted = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: this.base64ToArrayBuffer(iv) },
        key,
        this.base64ToArrayBuffer(data)
      );
      return new TextDecoder().decode(decrypted);
    } catch (e) {
      return encryptedJson; // Return original if not valid encrypted JSON
    }
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }
}

export const cryptoService = new CryptoService();
