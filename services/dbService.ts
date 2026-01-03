
const DB_NAME = 'CKM_MS_DB';
const DB_VERSION = 1;

export class DBService {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('chats')) {
          db.createObjectStore('chats', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('messages')) {
          db.createObjectStore('messages', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('kv')) {
          db.createObjectStore('kv');
        }
      };

      request.onsuccess = (event: any) => {
        this.db = event.target.result;
        resolve();
      };

      request.onerror = (event: any) => reject(event);
    });
  }

  async setKV(key: string, value: any): Promise<void> {
    return this.runTransaction('kv', 'readwrite', (store) => store.put(value, key));
  }

  async getKV(key: string): Promise<any> {
    return this.runTransaction('kv', 'readonly', (store) => store.get(key));
  }

  async saveChat(chat: any): Promise<void> {
    return this.runTransaction('chats', 'readwrite', (store) => store.put(chat));
  }

  async getChats(): Promise<any[]> {
    return this.runTransaction('chats', 'readonly', (store) => store.getAll());
  }

  async saveMessage(msg: any): Promise<void> {
    return this.runTransaction('messages', 'readwrite', (store) => store.put(msg));
  }

  async getMessages(): Promise<any[]> {
    return this.runTransaction('messages', 'readonly', (store) => store.getAll());
  }

  private async runTransaction(
    storeName: string,
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest
  ): Promise<any> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      const request = operation(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e);
    });
  }
}

export const dbService = new DBService();
