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
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching document for row:', error);
      return null;
    }

    return data;
  }

  /**
   * Get public URL for a document with error handling
   * For batch processing, use getDocumentUrlFast instead
   */
  static async getDocumentUrl(filePath: string): Promise<string> {
    // If the path is already a full URL, return it as-is
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      return filePath;
    }
    
    try {
      // For interactive use, still provide signed URLs for security
      // But skip the file existence check to reduce latency
      const { data, error } = await supabase.storage
        .from('documents')
        .createSignedUrl(filePath, 3600); // 1 hour expiry

      if (error || !data?.signedUrl) {
        console.error('Failed to generate signed URL:', error);
        // Fallback to public URL if signed URL fails
        const { data: publicData } = supabase.storage
          .from('documents')
          .getPublicUrl(filePath);
        
        return publicData.publicUrl;
      }

      return data.signedUrl;
    } catch (error) {
      console.error('Error generating document URL:', error);
      // Fallback to public URL if signed URL fails
      const { data } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);
      
      return data.publicUrl;
    }
  }

  /**
   * Fast document URL getter for batch processing - uses public URLs only
   */
  static getDocumentUrlFast(filePath: string): string {
    // If the path is already a full URL, return it as-is
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      return filePath;
    }
    
    // Generate public URL directly - no network calls needed
    const { data } = supabase.storage
      .from('documents')
      .getPublicUrl(filePath);
    
    return data.publicUrl;
  }

  /**
   * Get public URL for a document (synchronous version for compatibility)
   */
  static getDocumentUrlSync(filePath: string): string {
    // If the path is already a full URL, return it as-is
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      return filePath;
    }
    
    // Generate public URL from the storage path
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
        
        // Generate new filename based on current spreadsheet data using user preferences
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) continue;
        
        const { data: newFilename, error } = await supabase
          .rpc('generate_document_filename_with_preferences', {
            runsheet_data: spreadsheetData,
            row_index: doc.row_index,
            original_filename: doc.original_filename,
            user_id: user.id
          });

        if (error || !newFilename || newFilename === doc.stored_filename) {
          continue; // Skip if error or no change needed
        }

        // Construct new file path with conflict resolution
        const pathParts = doc.file_path.split('/');
        let finalFilename = newFilename;
        let finalFilePath = `${pathParts[0]}/${pathParts[1]}/${finalFilename}`;
        let attempt = 1;
        
        // Check if file already exists and generate unique name if needed
        while (attempt <= 10) { // Limit attempts to prevent infinite loop
          const { error: moveError } = await supabase.storage
            .from('documents')
            .move(doc.file_path, finalFilePath);

          if (!moveError) {
            // Success - file moved
            break;
          } else if (moveError.message?.includes('already exists') || moveError.message?.includes('Duplicate')) {
            // File exists, try with suffix
            const extension = finalFilename.includes('.') ? '.' + finalFilename.split('.').pop() : '';
            const nameWithoutExt = finalFilename.replace(new RegExp(extension.replace('.', '\\.') + '$'), '');
            finalFilename = `${nameWithoutExt}_${attempt}${extension}`;
            finalFilePath = `${pathParts[0]}/${pathParts[1]}/${finalFilename}`;
            attempt++;
          } else {
            // Other error, log and skip
            console.error('Error moving file:', moveError);
            finalFilename = null; // Mark as failed
            break;
          }
        }

        if (!finalFilename) {
          continue; // Skip if we couldn't move the file
        }

        // Update document record
        const { error: updateError } = await supabase
          .from('documents')
          .update({
            stored_filename: finalFilename,
            file_path: finalFilePath,
            updated_at: new Date().toISOString()
          })
          .eq('id', doc.id);

        if (updateError) {
          console.error('Error updating document record:', updateError);
          // Try to move file back
          await supabase.storage
            .from('documents')
            .move(finalFilePath, doc.file_path);
        } else {
          console.log(`Renamed document: ${doc.stored_filename} -> ${finalFilename}`);
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

      // Delete database record first (safer approach)
      const { error: dbError } = await supabase
        .from('documents')
        .delete()
        .eq('id', documentId);

      if (dbError) {
        console.error('Error deleting document record:', dbError);
        return false;
      }

      // Delete from storage (even if this fails, the database is clean)
      const { error: storageError } = await supabase.storage
        .from('documents')
        .remove([doc.file_path]);

      if (storageError) {
        console.error('Error deleting file from storage (orphaned file created):', storageError);
        // Log this for potential cleanup later, but don't fail the operation
      }

      return true;
    } catch (error) {
      console.error('Error in deleteDocument:', error);
      return false;
    }
  }

  /**
   * Delete all documents for a runsheet (cascade delete)
   */
  static async deleteDocumentsForRunsheet(runsheetId: string): Promise<boolean> {
    try {
      // Get all documents for this runsheet
      const { data: documents, error: fetchError } = await supabase
        .from('documents')
        .select('id, file_path')
        .eq('runsheet_id', runsheetId);

      if (fetchError) {
        console.error('Error fetching documents for runsheet deletion:', fetchError);
        return false;
      }

      if (!documents || documents.length === 0) {
        return true; // No documents to delete
      }

      // Collect all file paths for batch deletion
      const filePaths = documents.map(doc => doc.file_path);

      // Delete database records first
      const { error: dbError } = await supabase
        .from('documents')
        .delete()
        .eq('runsheet_id', runsheetId);

      if (dbError) {
        console.error('Error deleting document records for runsheet:', dbError);
        return false;
      }

      // Delete files from storage in batch
      if (filePaths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from('documents')
          .remove(filePaths);

        if (storageError) {
          console.error('Error deleting files from storage for runsheet (orphaned files created):', storageError);
          // Log this for potential cleanup later, but don't fail the operation
        }
      }

      console.log(`Deleted ${documents.length} documents for runsheet ${runsheetId}`);
      return true;
    } catch (error) {
      console.error('Error in deleteDocumentsForRunsheet:', error);
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
      // Convert PDF to image if needed
      let processedFile = file;
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        try {
          const { convertPDFToImages } = await import('@/utils/pdfToImage');
          const { createFileFromBlob } = await import('@/utils/pdfToImage');
          const { combineImages } = await import('@/utils/imageCombiner');
          
          console.log('🔧 PDF detected in upload, converting to image:', file.name);
          
          // Convert PDF to high-resolution images
          const pdfPages = await convertPDFToImages(file, 4);
          
          if (pdfPages.length > 0) {
            // Convert all pages to image files
            const originalName = file.name.replace(/\.pdf$/i, '');
            const imageFiles: File[] = pdfPages.map((p, idx) => 
              createFileFromBlob(p.blob, `${originalName}_p${idx + 1}.png`)
            );

            // Combine into a single tall image for consistent processing
            const { file: combinedImage } = await combineImages(imageFiles, {
              type: 'vertical',
              maxWidth: 2000,
              quality: 0.95,
              filename: `${originalName}.jpg` // Preserve original PDF name but as JPG
            });

            processedFile = combinedImage;
            console.log('🔧 PDF converted to combined image:', processedFile.name, 'Size:', processedFile.size);
          }
        } catch (pdfError) {
          console.error('🔧 PDF conversion failed, uploading original file:', pdfError);
          // Continue with original file if conversion fails
        }
      }

      const formData = new FormData();
      formData.append('file', processedFile);
      formData.append('runsheetId', runsheetId);
      formData.append('rowIndex', rowIndex.toString());
      // Use the processed file's name if it was converted, otherwise use original
      formData.append('originalFilename', processedFile.name); 
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
      const fileUrl = await this.getDocumentUrl(filePath);
      
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