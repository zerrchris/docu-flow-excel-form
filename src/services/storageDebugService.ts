import { supabase } from '@/integrations/supabase/client';

export class StorageDebugService {
  /**
   * Lists all files in the documents bucket for the current user
   */
  static async listUserFiles(): Promise<{ files: any[], error?: string }> {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        return { files: [], error: 'Not authenticated' };
      }

      const { data: files, error } = await supabase.storage
        .from('documents')
        .list(user.user.id, {
          limit: 1000,
          sortBy: { column: 'created_at', order: 'desc' }
        });

      if (error) {
        return { files: [], error: error.message };
      }

      // Get files from all runsheet folders
      const allFiles = [];
      for (const item of files || []) {
        if (item.name) {
          // This is a file in the root user folder
          allFiles.push({
            ...item,
            fullPath: `${user.user.id}/${item.name}`,
            location: 'root'
          });
        } else {
          // This might be a folder, list its contents
          const { data: folderFiles } = await supabase.storage
            .from('documents')
            .list(`${user.user.id}/${item.name}`, {
              limit: 1000
            });

          if (folderFiles) {
            folderFiles.forEach(file => {
              allFiles.push({
                ...file,
                fullPath: `${user.user.id}/${item.name}/${file.name}`,
                location: item.name,
                runsheetId: item.name
              });
            });
          }
        }
      }

      return { files: allFiles };
    } catch (error) {
      return { files: [], error: (error as Error).message };
    }
  }

  /**
   * Finds orphaned files that don't have corresponding database records
   */
  static async findOrphanedFiles(): Promise<{ orphaned: any[], error?: string }> {
    try {
      const { files, error: listError } = await this.listUserFiles();
      if (listError) {
        return { orphaned: [], error: listError };
      }

      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        return { orphaned: [], error: 'Not authenticated' };
      }

      // Get all document records for this user
      const { data: documents, error: dbError } = await supabase
        .from('documents')
        .select('file_path, stored_filename, runsheet_id')
        .eq('user_id', user.user.id);

      if (dbError) {
        return { orphaned: [], error: dbError.message };
      }

      const documentPaths = new Set(documents?.map(d => d.file_path) || []);
      
      const orphaned = files.filter(file => {
        const filePath = file.fullPath;
        return !documentPaths.has(filePath) && file.name !== '.emptyFolderPlaceholder';
      });

      return { orphaned };
    } catch (error) {
      return { orphaned: [], error: (error as Error).message };
    }
  }

  /**
   * Cleans up orphaned files
   */
  static async cleanupOrphanedFiles(): Promise<{ cleaned: number, error?: string }> {
    try {
      const { orphaned, error } = await this.findOrphanedFiles();
      if (error) {
        return { cleaned: 0, error };
      }

      let cleaned = 0;
      for (const file of orphaned) {
        const { error: deleteError } = await supabase.storage
          .from('documents')
          .remove([file.fullPath]);

        if (!deleteError) {
          cleaned++;
          console.log(`Cleaned up orphaned file: ${file.fullPath}`);
        } else {
          console.error(`Failed to clean up: ${file.fullPath}`, deleteError);
        }
      }

      return { cleaned };
    } catch (error) {
      return { cleaned: 0, error: (error as Error).message };
    }
  }

  /**
   * Lists files for a specific runsheet
   */
  static async listRunsheetFiles(runsheetId: string): Promise<{ files: any[], error?: string }> {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        return { files: [], error: 'Not authenticated' };
      }

      const { data: files, error } = await supabase.storage
        .from('documents')
        .list(`${user.user.id}/${runsheetId}`, {
          limit: 1000,
          sortBy: { column: 'created_at', order: 'desc' }
        });

      if (error) {
        return { files: [], error: error.message };
      }

      return { 
        files: (files || []).map(file => ({
          ...file,
          fullPath: `${user.user.id}/${runsheetId}/${file.name}`
        }))
      };
    } catch (error) {
      return { files: [], error: (error as Error).message };
    }
  }
}