-- Create table for storing OCR results
CREATE TABLE public.document_ocr_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  runsheet_id UUID,
  row_index INTEGER,
  extracted_text TEXT,
  structured_data JSONB,
  confidence_score DECIMAL(3,2),
  processing_method TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.document_ocr_data ENABLE ROW LEVEL SECURITY;

-- Create policies for OCR data access
CREATE POLICY "Users can view their own OCR data" 
ON public.document_ocr_data 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.runsheets r 
    WHERE r.id = document_ocr_data.runsheet_id 
    AND r.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert their own OCR data" 
ON public.document_ocr_data 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.runsheets r 
    WHERE r.id = document_ocr_data.runsheet_id 
    AND r.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their own OCR data" 
ON public.document_ocr_data 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.runsheets r 
    WHERE r.id = document_ocr_data.runsheet_id 
    AND r.user_id = auth.uid()
  )
);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_document_ocr_data_updated_at
BEFORE UPDATE ON public.document_ocr_data
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for better performance
CREATE INDEX idx_document_ocr_data_runsheet_row ON public.document_ocr_data(runsheet_id, row_index);
CREATE INDEX idx_document_ocr_data_created_at ON public.document_ocr_data(created_at DESC);