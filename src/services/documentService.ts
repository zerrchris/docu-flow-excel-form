import { supabase } from '@/integrations/supabase/client';

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
   * Get all documents for a specific runsheet
   */
  static async getDocumentsForRunsheet(runsheetId: string): Promise<DocumentRecord[]> {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('runsheet_id', runsheetId)
      .order('row_index');

    if (error) {
      console.error('Error fetching documents:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Get document for a specific row in a runsheet
   */
  static async getDocumentForRow(runsheetId: string, rowIndex: number): Promise<DocumentRecord | null> {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('runsheet_id', runsheetId)
      .eq('row_index', rowIndex)
      .maybeSingle();

    if (error) {
      console.error('Error fetching document for row:', error);
      return null;
    }

    return data;
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
   * Get documents mapped by row index for easy lookup
   */
  static async getDocumentMapForRunsheet(runsheetId: string): Promise<Map<number, DocumentRecord>> {
    const documents = await this.getDocumentsForRunsheet(runsheetId);
    const documentMap = new Map<number, DocumentRecord>();
    
    documents.forEach(doc => {
      documentMap.set(doc.row_index, doc);
    });
    
    return documentMap;
  }
}