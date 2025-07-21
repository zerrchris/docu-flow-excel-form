interface OfflineImage {
  id: string;
  dataUrl: string;
  fileName: string;
  projectCode?: string;
  projectName?: string;
  documentName?: string;
  timestamp: number;
  synced: boolean;
}

interface OfflineDocument {
  id: string;
  pages: string[]; // Array of image data URLs
  fileName: string;
  projectCode?: string;
  projectName?: string;
  documentName?: string;
  timestamp: number;
  synced: boolean;
}

class OfflineStorageManager {
  private dbName = 'MobileCaptureDB';
  private dbVersion = 1;
  private db: IDBDatabase | null = null;

  async initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Store for individual images
        if (!db.objectStoreNames.contains('images')) {
          const imageStore = db.createObjectStore('images', { keyPath: 'id' });
          imageStore.createIndex('timestamp', 'timestamp');
          imageStore.createIndex('synced', 'synced');
        }
        
        // Store for combined documents
        if (!db.objectStoreNames.contains('documents')) {
          const docStore = db.createObjectStore('documents', { keyPath: 'id' });
          docStore.createIndex('timestamp', 'timestamp');
          docStore.createIndex('synced', 'synced');
        }
      };
    });
  }

  async storeImage(image: Omit<OfflineImage, 'id' | 'timestamp' | 'synced'>): Promise<string> {
    await this.ensureDB();
    
    const offlineImage: OfflineImage = {
      ...image,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      synced: false
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['images'], 'readwrite');
      const store = transaction.objectStore('images');
      const request = store.add(offlineImage);
      
      request.onsuccess = () => resolve(offlineImage.id);
      request.onerror = () => reject(request.error);
    });
  }

  async storeDocument(document: Omit<OfflineDocument, 'id' | 'timestamp' | 'synced'>): Promise<string> {
    await this.ensureDB();
    
    const offlineDocument: OfflineDocument = {
      ...document,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      synced: false
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['documents'], 'readwrite');
      const store = transaction.objectStore('documents');
      const request = store.add(offlineDocument);
      
      request.onsuccess = () => resolve(offlineDocument.id);
      request.onerror = () => reject(request.error);
    });
  }

  async getUnsyncedImages(): Promise<OfflineImage[]> {
    await this.ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['images'], 'readonly');
      const store = transaction.objectStore('images');
      const index = store.index('synced');
      const request = index.getAll(IDBKeyRange.only(false));
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getUnsyncedDocuments(): Promise<OfflineDocument[]> {
    await this.ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['documents'], 'readonly');
      const store = transaction.objectStore('documents');
      const index = store.index('synced');
      const request = index.getAll(IDBKeyRange.only(false));
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async markImageAsSynced(id: string): Promise<void> {
    await this.ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['images'], 'readwrite');
      const store = transaction.objectStore('images');
      const getRequest = store.get(id);
      
      getRequest.onsuccess = () => {
        const image = getRequest.result;
        if (image) {
          image.synced = true;
          const putRequest = store.put(image);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          resolve();
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async markDocumentAsSynced(id: string): Promise<void> {
    await this.ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['documents'], 'readwrite');
      const store = transaction.objectStore('documents');
      const getRequest = store.get(id);
      
      getRequest.onsuccess = () => {
        const document = getRequest.result;
        if (document) {
          document.synced = true;
          const putRequest = store.put(document);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          resolve();
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async getAllStoredItems(): Promise<{ images: OfflineImage[], documents: OfflineDocument[] }> {
    await this.ensureDB();
    
    const images = await new Promise<OfflineImage[]>((resolve, reject) => {
      const transaction = this.db!.transaction(['images'], 'readonly');
      const store = transaction.objectStore('images');
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const documents = await new Promise<OfflineDocument[]>((resolve, reject) => {
      const transaction = this.db!.transaction(['documents'], 'readonly');
      const store = transaction.objectStore('documents');
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return { images, documents };
  }

  async deleteItem(type: 'images' | 'documents', id: string): Promise<void> {
    await this.ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([type], 'readwrite');
      const store = transaction.objectStore(type);
      const request = store.delete(id);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async ensureDB(): Promise<void> {
    if (!this.db) {
      await this.initDB();
    }
  }

  isOnline(): boolean {
    return navigator.onLine;
  }
}

export const offlineStorage = new OfflineStorageManager();
export type { OfflineImage, OfflineDocument };