-- Create table to store document extraction metadata with bounding box information
CREATE TABLE public.document_extraction_metadata (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  runsheet_id UUID REFERENCES public.runsheets(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL,
  field_name TEXT NOT NULL,
  extracted_value TEXT,
  page_number INTEGER NOT NULL DEFAULT 1,
  bbox_x1 NUMERIC,
  bbox_y1 NUMERIC, 
  bbox_x2 NUMERIC,
  bbox_y2 NUMERIC,
  bbox_width NUMERIC,
  bbox_height NUMERIC,
  confidence_score NUMERIC DEFAULT 0.0,
  extraction_method TEXT DEFAULT 'ai_vision',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  user_id UUID NOT NULL
);

-- Enable RLS
ALTER TABLE public.document_extraction_metadata ENABLE ROW LEVEL SECURITY;

-- Create policies for extraction metadata
CREATE POLICY "Users can view their own extraction metadata" 
ON public.document_extraction_metadata 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own extraction metadata" 
ON public.document_extraction_metadata 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own extraction metadata" 
ON public.document_extraction_metadata 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own extraction metadata" 
ON public.document_extraction_metadata 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_extraction_metadata_runsheet_row ON public.document_extraction_metadata(runsheet_id, row_index);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_extraction_metadata_updated_at
BEFORE UPDATE ON public.document_extraction_metadata
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();