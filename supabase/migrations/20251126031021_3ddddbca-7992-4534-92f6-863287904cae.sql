-- Make the documents bucket private (not publicly accessible)
UPDATE storage.buckets 
SET public = false 
WHERE id = 'documents';