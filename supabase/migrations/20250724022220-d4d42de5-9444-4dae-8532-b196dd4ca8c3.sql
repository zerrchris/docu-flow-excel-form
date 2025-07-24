-- Create snips folder structure for document storage
-- This creates the proper folder structure for snips within the documents bucket

-- Insert a placeholder file to create the folder structure
-- The actual files will be uploaded by the Chrome extension
INSERT INTO storage.objects (bucket_id, name, owner, metadata)
VALUES ('documents', 'snips/.keep', null, '{}')
ON CONFLICT (bucket_id, name) DO NOTHING;