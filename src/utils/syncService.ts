import { supabase } from '@/integrations/supabase/client';
import { offlineStorage, OfflineImage, OfflineDocument } from './offlineStorage';
import { toast } from '@/hooks/use-toast';

export class SyncService {
  private syncInProgress = false;
  private syncCallbacks: Array<(status: SyncStatus) => void> = [];

  async syncAll(): Promise<void> {
    if (this.syncInProgress) {
      console.log('Sync already in progress');
      return;
    }

    if (!navigator.onLine) {
      console.log('Device is offline, cannot sync');
      return;
    }

    this.syncInProgress = true;
    this.notifyCallbacks({ status: 'syncing', progress: 0 });

    try {
      const { images, documents } = await offlineStorage.getAllStoredItems();
      const unsyncedImages = images.filter(img => !img.synced);
      const unsyncedDocuments = documents.filter(doc => !doc.synced);
      
      const totalItems = unsyncedImages.length + unsyncedDocuments.length;
      
      if (totalItems === 0) {
        this.notifyCallbacks({ status: 'completed', progress: 100 });
        this.syncInProgress = false;
        return;
      }

      let syncedCount = 0;

      // Sync images first
      for (const image of unsyncedImages) {
        try {
          await this.syncImage(image);
          await offlineStorage.markImageAsSynced(image.id);
          syncedCount++;
          this.notifyCallbacks({ 
            status: 'syncing', 
            progress: (syncedCount / totalItems) * 100 
          });
        } catch (error) {
          console.error('Failed to sync image:', error);
          this.notifyCallbacks({ 
            status: 'error', 
            error: `Failed to sync image: ${image.fileName}` 
          });
        }
      }

      // Sync documents
      for (const document of unsyncedDocuments) {
        try {
          await this.syncDocument(document);
          await offlineStorage.markDocumentAsSynced(document.id);
          syncedCount++;
          this.notifyCallbacks({ 
            status: 'syncing', 
            progress: (syncedCount / totalItems) * 100 
          });
        } catch (error) {
          console.error('Failed to sync document:', error);
          this.notifyCallbacks({ 
            status: 'error', 
            error: `Failed to sync document: ${document.fileName}` 
          });
        }
      }

      this.notifyCallbacks({ status: 'completed', progress: 100 });
      
      if (syncedCount > 0) {
        toast({
          title: "Sync Complete",
          description: `Successfully synced ${syncedCount} items to cloud storage.`,
        });
      }

    } catch (error) {
      console.error('Sync failed:', error);
      this.notifyCallbacks({ 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Unknown sync error' 
      });
    } finally {
      this.syncInProgress = false;
    }
  }

  private async syncImage(image: OfflineImage): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Convert data URL to blob
    const response = await fetch(image.dataUrl);
    const blob = await response.blob();

    // Create file path
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `mobile-captured/${user.id}/${timestamp}-${image.fileName}`;

    // Upload to Supabase storage
    const { error } = await supabase.storage
      .from('documents')
      .upload(fileName, blob, {
        contentType: blob.type,
        upsert: false
      });

    if (error) {
      throw error;
    }
  }

  private async syncDocument(document: OfflineDocument): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    // For documents, we need to recreate the PDF from the pages
    // This is a simplified version - you might want to use the same PDF creation logic
    const response = await fetch(document.pages[0]); // Use first page for now
    const blob = await response.blob();

    // Create file path
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `mobile-captured/${user.id}/${timestamp}-${document.fileName}`;

    // Upload to Supabase storage
    const { error } = await supabase.storage
      .from('documents')
      .upload(fileName, blob, {
        contentType: 'application/pdf',
        upsert: false
      });

    if (error) {
      throw error;
    }
  }

  onSyncStatusChange(callback: (status: SyncStatus) => void): () => void {
    this.syncCallbacks.push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = this.syncCallbacks.indexOf(callback);
      if (index > -1) {
        this.syncCallbacks.splice(index, 1);
      }
    };
  }

  private notifyCallbacks(status: SyncStatus): void {
    this.syncCallbacks.forEach(callback => callback(status));
  }

  async getPendingSyncCount(): Promise<number> {
    const { images, documents } = await offlineStorage.getAllStoredItems();
    const unsyncedImages = images.filter(img => !img.synced);
    const unsyncedDocuments = documents.filter(doc => !doc.synced);
    return unsyncedImages.length + unsyncedDocuments.length;
  }

  isSyncing(): boolean {
    return this.syncInProgress;
  }
}

export interface SyncStatus {
  status: 'syncing' | 'completed' | 'error' | 'idle';
  progress?: number;
  error?: string;
}

export const syncService = new SyncService();

// Auto-sync when coming online
window.addEventListener('online', () => {
  console.log('Device came online, starting auto-sync');
  syncService.syncAll();
});