import { supabase } from '@/integrations/supabase/client';

export interface FileUploadResult {
  url: string;
  path: string;
  fileName: string;
}

/**
 * Uploads a file to Supabase storage and returns the public URL
 */
export async function uploadFileToStorage(
  file: File,
  bucket: string = 'documents',
  folder?: string
): Promise<FileUploadResult> {
  // Generate a unique filename to avoid conflicts
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const fileExtension = file.name.split('.').pop() || '';
  const fileName = `${file.name.split('.')[0]}_${timestamp}_${randomSuffix}.${fileExtension}`;
  
  // Create the file path
  const userId = (await supabase.auth.getUser()).data.user?.id;
  const filePath = folder 
    ? `${userId}/${folder}/${fileName}`
    : `${userId}/${fileName}`;

  // Upload the file
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false
    });

  if (error) {
    throw new Error(`Failed to upload file: ${error.message}`);
  }

  // Get the public URL
  const { data: urlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(filePath);

  return {
    url: urlData.publicUrl,
    path: filePath,
    fileName: file.name
  };
}

/**
 * Deletes a file from Supabase storage
 */
export async function deleteFileFromStorage(
  filePath: string,
  bucket: string = 'documents'
): Promise<void> {
  const { error } = await supabase.storage
    .from(bucket)
    .remove([filePath]);

  if (error) {
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}