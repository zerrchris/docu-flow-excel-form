-- Add page range support to documents table
ALTER TABLE public.documents ADD COLUMN page_start INTEGER DEFAULT NULL;
ALTER TABLE public.documents ADD COLUMN page_end INTEGER DEFAULT NULL;
ALTER TABLE public.documents ADD COLUMN is_page_range BOOLEAN DEFAULT FALSE;
ALTER TABLE public.documents ADD COLUMN parent_document_id UUID DEFAULT NULL;

-- Add index for page range queries
CREATE INDEX IF NOT EXISTS idx_documents_page_range ON public.documents(parent_document_id, page_start, page_end) WHERE is_page_range = true;

-- Add constraint to ensure page_start <= page_end when both are set
ALTER TABLE public.documents ADD CONSTRAINT check_page_range 
  CHECK (
    (page_start IS NULL AND page_end IS NULL) OR 
    (page_start IS NOT NULL AND page_end IS NOT NULL AND page_start <= page_end)
  );

-- Create multi-instrument analysis results table
CREATE TABLE IF NOT EXISTS public.multi_instrument_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  original_document_id UUID NOT NULL,
  runsheet_id UUID,
  instruments_detected INTEGER NOT NULL DEFAULT 0,
  analysis_status TEXT NOT NULL DEFAULT 'pending' CHECK (analysis_status IN ('pending', 'analyzing', 'completed', 'failed')),
  analysis_data JSONB DEFAULT '{}',
  processing_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on multi_instrument_analysis
ALTER TABLE public.multi_instrument_analysis ENABLE ROW LEVEL SECURITY;

-- Create policies for multi_instrument_analysis
CREATE POLICY "Users can view their own multi-instrument analyses"
  ON public.multi_instrument_analysis FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own multi-instrument analyses"
  ON public.multi_instrument_analysis FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own multi-instrument analyses"
  ON public.multi_instrument_analysis FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own multi-instrument analyses"
  ON public.multi_instrument_analysis FOR DELETE
  USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_multi_instrument_analysis_updated_at
  BEFORE UPDATE ON public.multi_instrument_analysis
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to split PDF pages into separate documents
CREATE OR REPLACE FUNCTION public.create_page_range_document(
  p_original_document_id UUID,
  p_user_id UUID,
  p_runsheet_id UUID,
  p_row_index INTEGER,
  p_page_start INTEGER,
  p_page_end INTEGER,
  p_instrument_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  original_doc RECORD;
  new_filename TEXT;
  new_file_path TEXT;
  new_document_id UUID;
BEGIN
  -- Get original document details
  SELECT * INTO original_doc 
  FROM public.documents 
  WHERE id = p_original_document_id AND user_id = p_user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Original document not found or access denied';
  END IF;
  
  -- Generate new filename for page range
  IF p_instrument_name IS NOT NULL THEN
    new_filename := format('%s_%s_pages_%s-%s', 
      regexp_replace(original_doc.stored_filename, '\.[^.]*$', ''),
      regexp_replace(p_instrument_name, '[^a-zA-Z0-9\-_]', '_', 'g'),
      p_page_start, 
      p_page_end
    );
  ELSE
    new_filename := format('%s_pages_%s-%s', 
      regexp_replace(original_doc.stored_filename, '\.[^.]*$', ''),
      p_page_start, 
      p_page_end
    );
  END IF;
  
  -- Keep original extension if it exists
  IF original_doc.stored_filename ~ '\.[^.]*$' THEN
    new_filename := new_filename || regexp_replace(original_doc.stored_filename, '^.*(\.[^.]*)$', '\1');
  END IF;
  
  -- Generate new file path (use same path structure as original)
  new_file_path := regexp_replace(original_doc.file_path, '[^/]*$', new_filename);
  
  -- Create new document record
  INSERT INTO public.documents (
    user_id,
    runsheet_id,
    row_index,
    original_filename,
    stored_filename,
    file_path,
    file_size,
    content_type,
    is_page_range,
    page_start,
    page_end,
    parent_document_id
  ) VALUES (
    p_user_id,
    p_runsheet_id,
    p_row_index,
    new_filename,
    new_filename,
    new_file_path,
    original_doc.file_size, -- Approximate, actual size would be smaller
    original_doc.content_type,
    true,
    p_page_start,
    p_page_end,
    p_original_document_id
  )
  RETURNING id INTO new_document_id;
  
  RETURN new_document_id;
END;
$$;