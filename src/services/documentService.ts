import { supabase } from '@/integrations/supabase/client';
import { withRetry, DataSyncError, getDocumentsForRunsheet } from '@/utils/dataSync';

export interface DocumentRecord {
  id: string;
  user_id: string;
  runsheet_id: string;
  row_index: number;
  original_filename: string;
  stored_filename: string;
  file_path: string;
  file_size: number;
  content_type: string;
  created_at: string;
  updated_at: string;
}

export class DocumentService {
  
  /**
   * Get all documents for a specific runsheet with enhanced error handling
   */
  static async getDocumentsForRunsheet(runsheetId: string): Promise<DocumentRecord[]> {
    const result = await getDocumentsForRunsheet(runsheetId);
    
    if (!result.success) {
      console.error('Error fetching documents:', result.error);
      return [];
    }
    
    return result.data || [];
  }

  /**
   * Get document for a specific row in a runsheet with retry logic
   */
  static async getDocumentForRow(runsheetId: string, rowIndex: number): Promise<DocumentRecord | null> {
    const result = await withRetry(async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('runsheet_id', runsheetId)
        .eq('row_index', rowIndex)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        throw new DataSyncError(
          'Fetch failed',
          'Failed to load document for this row.',
          true,
          error
        );
      }

      return data;
    });

    return result.success ? result.data : null;
  }

  /**
   * Get public URL for a document
   */
  static getDocumentUrl(filePath: string): string {
    const { data } = supabase.storage
      .from('documents')
      .getPublicUrl(filePath);
    
    return data.publicUrl;
  }

  /**
   * Rename documents when spreadsheet data changes
   */
  static async updateDocumentFilenames(runsheetId: string, spreadsheetData: Record<string, string>[]): Promise<void> {
    try {
      // Get current documents for this runsheet
      const documents = await this.getDocumentsForRunsheet(runsheetId);
      
      for (const doc of documents) {
        // Skip if row index is out of bounds
        if (doc.row_index >= spreadsheetData.length) continue;
        
        // Generate new filename based on current spreadsheet data
        const { data: newFilename, error } = await supabase
          .rpc('generate_document_filename', {
            runsheet_data: spreadsheetData,
            row_index: doc.row_index,
            original_filename: doc.original_filename
          });

        if (error || !newFilename || newFilename === doc.stored_filename) {
          continue; // Skip if error or no change needed
        }

        // Construct new file path
        const pathParts = doc.file_path.split('/');
        const newFilePath = `${pathParts[0]}/${pathParts[1]}/${newFilename}`;

        // Move file in storage
        const { error: moveError } = await supabase.storage
          .from('documents')
          .move(doc.file_path, newFilePath);

        if (moveError) {
          console.error('Error moving file:', moveError);
          continue;
        }

        // Update document record
        const { error: updateError } = await supabase
          .from('documents')
          .update({
            stored_filename: newFilename,
            file_path: newFilePath,
            updated_at: new Date().toISOString()
          })
          .eq('id', doc.id);

        if (updateError) {
          console.error('Error updating document record:', updateError);
          // Try to move file back
          await supabase.storage
            .from('documents')
            .move(newFilePath, doc.file_path);
        } else {
          console.log(`Renamed document: ${doc.stored_filename} -> ${newFilename}`);
        }
      }
    } catch (error) {
      console.error('Error updating document filenames:', error);
    }
  }

  /**
   * Delete document and its file
   */
  static async deleteDocument(documentId: string): Promise<boolean> {
    try {
      // Get document details first
      const { data: doc, error: fetchError } = await supabase
        .from('documents')
        .select('file_path')
        .eq('id', documentId)
        .single();

      if (fetchError || !doc) {
        console.error('Error fetching document for deletion:', fetchError);
        return false;
      }

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('documents')
        .remove([doc.file_path]);

      if (storageError) {
        console.error('Error deleting file from storage:', storageError);
      }

      // Delete database record
      const { error: dbError } = await supabase
        .from('documents')
        .delete()
        .eq('id', documentId);

      if (dbError) {
        console.error('Error deleting document record:', dbError);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in deleteDocument:', error);
      return false;
    }
  }

  /**
   * Upload a document file and link it to a runsheet row
   */
  static async uploadDocument(
    file: File, 
    runsheetId: string, 
    rowIndex: number, 
    onProgress?: (progress: number) => void,
    useSmartNaming?: boolean
  ): Promise<{ success: boolean; document?: DocumentRecord; error?: string }> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('runsheetId', runsheetId);
      formData.append('rowIndex', rowIndex.toString());
      formData.append('originalFilename', file.name);
      formData.append('useSmartNaming', useSmartNaming ? 'true' : 'false');

      // Get auth token for the request
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await supabase.functions.invoke('store-document', {
        body: formData,
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (response.error) {
        console.error('Upload error:', response.error);
        return { success: false, error: response.error.message };
      }

      if (!response.data.success) {
        return { success: false, error: response.data.error || 'Upload failed' };
      }

      return { 
        success: true, 
        document: response.data.document 
      };
    } catch (error) {
      console.error('Error uploading document:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Upload failed' 
      };
    }
  }

  /**
   * Analyze document using advanced AI extraction with structured outputs
   */
  static async analyzeDocumentAdvanced(
    filePath: string,
    fileName: string, 
    contentType: string,
    columnInstructions?: Record<string, string>,
    useVision?: boolean
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      // Get the public URL for the document
      const fileUrl = this.getDocumentUrl(filePath);
      
      const { data } = await supabase.functions.invoke('analyze-document-advanced', {
        body: {
          fileUrl,
          fileName,
          contentType,
          columnInstructions: columnInstructions || {},
          useVision: useVision || false
        }
      });

      if (!data?.success) {
        throw new Error(data?.error || 'Analysis failed');
      }

      return {
        success: true,
        data: data.data
      };

    } catch (error) {
      console.error('Error in advanced document analysis:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Analysis failed'
      };
    }
  }

  /**
   * Organize documents into runsheet-named folders
   */
  static async organizeDocumentsByRunsheet(
    runsheetId: string, 
    runsheetName: string, 
    documentIds: string[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await supabase.functions.invoke('organize-documents-by-runsheet', {
        body: {
          runsheetId,
          runsheetName,
          documentIds
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (response.error) {
        console.error('Organization error:', response.error);
        return { success: false, error: response.error.message };
      }

      if (!response.data.success) {
        return { success: false, error: response.data.error || 'Organization failed' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error organizing documents:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Organization failed' 
      };
    }
  }

  /**
   * Get documents mapped by row index for easy lookup
   */
  static async getDocumentMapForRunsheet(runsheetId: string): Promise<Map<number, DocumentRecord>> {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('runsheet_id', runsheetId)
      .order('row_index')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching documents for map:', error);
      return new Map();
    }

    const documentMap = new Map<number, DocumentRecord>();
    
    (data || []).forEach(doc => {
      // Only set if not already set, so we keep the most recent document for each row
      if (!documentMap.has(doc.row_index)) {
        documentMap.set(doc.row_index, doc);
      }
    });
    
    return documentMap;
  }
}