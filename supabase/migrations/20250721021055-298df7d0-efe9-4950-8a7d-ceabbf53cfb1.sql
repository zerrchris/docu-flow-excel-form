-- Create documents table to track uploaded files
CREATE TABLE public.documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  runsheet_id UUID REFERENCES public.runsheets(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL,
  original_filename TEXT NOT NULL,
  stored_filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  content_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on documents table
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Create policies for documents table
CREATE POLICY "Users can view their own documents" 
ON public.documents 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own documents" 
ON public.documents 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own documents" 
ON public.documents 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own documents" 
ON public.documents 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_documents_updated_at
BEFORE UPDATE ON public.documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_documents_user_id ON public.documents(user_id);
CREATE INDEX idx_documents_runsheet_id ON public.documents(runsheet_id);
CREATE INDEX idx_documents_row_index ON public.documents(runsheet_id, row_index);

-- Storage policies for documents bucket (if not already exists)
DO $$
BEGIN
  -- Check if bucket exists, if not create it
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'documents') THEN
    INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);
  END IF;
END $$;

-- Create storage policies for document uploads
CREATE POLICY "Users can view their own documents in storage" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload their own documents" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own documents in storage" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own documents in storage" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Create function to generate document filename based on spreadsheet data
CREATE OR REPLACE FUNCTION public.generate_document_filename(
  runsheet_data JSONB,
  row_index INTEGER,
  original_filename TEXT
) RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  row_data JSONB;
  filename_parts TEXT[];
  clean_part TEXT;
  extension TEXT;
  base_name TEXT;
BEGIN
  -- Extract file extension
  extension := CASE 
    WHEN original_filename LIKE '%.%' 
    THEN '.' || split_part(original_filename, '.', array_length(string_to_array(original_filename, '.'), 1))
    ELSE ''
  END;
  
  -- Get the row data
  IF jsonb_array_length(runsheet_data) > row_index THEN
    row_data := runsheet_data->row_index;
  ELSE
    RETURN 'document_' || row_index || extension;
  END IF;
  
  -- Build filename from available data (limit to 3 most important fields)
  filename_parts := ARRAY[]::TEXT[];
  
  -- Add meaningful data from the row (prioritize common field names)
  FOR clean_part IN 
    SELECT value::text 
    FROM jsonb_each_text(row_data) 
    WHERE value::text != '' AND value::text != 'N/A'
    ORDER BY 
      CASE key 
        WHEN 'name' THEN 1
        WHEN 'title' THEN 2
        WHEN 'invoice_number' THEN 3
        WHEN 'document_number' THEN 4
        WHEN 'reference' THEN 5
        WHEN 'id' THEN 6
        ELSE 10
      END
    LIMIT 3
  LOOP
    -- Clean the part: remove special characters, limit length
    clean_part := regexp_replace(clean_part, '[^a-zA-Z0-9\-_\s]', '', 'g');
    clean_part := regexp_replace(clean_part, '\s+', '_', 'g');
    clean_part := left(clean_part, 30);
    
    IF length(clean_part) > 0 THEN
      filename_parts := array_append(filename_parts, clean_part);
    END IF;
  END LOOP;
  
  -- If no meaningful data, use row index
  IF array_length(filename_parts, 1) IS NULL THEN
    RETURN 'document_row_' || row_index || extension;
  END IF;
  
  -- Combine parts and add extension
  base_name := array_to_string(filename_parts, '_');
  RETURN base_name || extension;
END;
$$;