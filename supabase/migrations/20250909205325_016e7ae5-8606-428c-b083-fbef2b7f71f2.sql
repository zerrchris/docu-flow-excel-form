-- Add storage policy for service role to read documents
CREATE POLICY "Allow service role read documents" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'documents' AND auth.role() = 'service_role');

-- Also ensure authenticated users can read their own documents
CREATE POLICY "Allow users read their own documents" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);