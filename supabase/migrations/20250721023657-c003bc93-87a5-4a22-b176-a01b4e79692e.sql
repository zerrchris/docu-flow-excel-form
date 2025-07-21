-- Create user document naming preferences table
CREATE TABLE public.user_document_naming_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  preference_name TEXT NOT NULL DEFAULT 'Default',
  priority_columns TEXT[] NOT NULL DEFAULT '{"name", "title", "invoice_number", "document_number", "reference", "id"}',
  max_filename_parts INTEGER NOT NULL DEFAULT 3,
  separator TEXT NOT NULL DEFAULT '_',
  include_extension BOOLEAN NOT NULL DEFAULT true,
  fallback_pattern TEXT NOT NULL DEFAULT 'document_{row_index}_{timestamp}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, preference_name)
);

-- Enable RLS
ALTER TABLE public.user_document_naming_preferences ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own naming preferences" 
ON public.user_document_naming_preferences 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own naming preferences" 
ON public.user_document_naming_preferences 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own naming preferences" 
ON public.user_document_naming_preferences 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own naming preferences" 
ON public.user_document_naming_preferences 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for timestamps
CREATE TRIGGER update_user_document_naming_preferences_updated_at
BEFORE UPDATE ON public.user_document_naming_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create improved filename generation function with user preferences
CREATE OR REPLACE FUNCTION public.generate_document_filename_with_preferences(
  runsheet_data JSONB,
  row_index INTEGER,
  original_filename TEXT,
  user_id UUID
) RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  row_data JSONB;
  filename_parts TEXT[];
  clean_part TEXT;
  extension TEXT;
  base_name TEXT;
  preferences RECORD;
  priority_column TEXT;
BEGIN
  -- Get user preferences (use default if none exist)
  SELECT * INTO preferences
  FROM public.user_document_naming_preferences 
  WHERE user_document_naming_preferences.user_id = generate_document_filename_with_preferences.user_id 
    AND is_active = true
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- If no preferences found, use defaults
  IF preferences IS NULL THEN
    preferences.priority_columns := ARRAY['name', 'title', 'invoice_number', 'document_number', 'reference', 'id'];
    preferences.max_filename_parts := 3;
    preferences.separator := '_';
    preferences.include_extension := true;
    preferences.fallback_pattern := 'document_{row_index}_{timestamp}';
  END IF;
  
  -- Extract file extension
  extension := CASE 
    WHEN preferences.include_extension AND original_filename LIKE '%.%' 
    THEN '.' || split_part(original_filename, '.', array_length(string_to_array(original_filename, '.'), 1))
    ELSE ''
  END;
  
  -- Get the row data
  IF jsonb_array_length(runsheet_data) > row_index THEN
    row_data := runsheet_data->row_index;
  ELSE
    -- Use fallback pattern
    base_name := replace(replace(preferences.fallback_pattern, '{row_index}', row_index::text), '{timestamp}', extract(epoch from now())::text);
    RETURN base_name || extension;
  END IF;
  
  -- Build filename from available data using user's priority columns
  filename_parts := ARRAY[]::TEXT[];
  
  -- Check each priority column in order
  FOREACH priority_column IN ARRAY preferences.priority_columns
  LOOP
    IF jsonb_extract_path_text(row_data, priority_column) IS NOT NULL THEN
      clean_part := jsonb_extract_path_text(row_data, priority_column);
      
      -- Skip empty or N/A values
      IF clean_part != '' AND clean_part != 'N/A' THEN
        -- Clean the part: remove special characters, limit length
        clean_part := regexp_replace(clean_part, '[^a-zA-Z0-9\-_\s]', '', 'g');
        clean_part := regexp_replace(clean_part, '\s+', preferences.separator, 'g');
        clean_part := left(clean_part, 30);
        
        IF length(clean_part) > 0 THEN
          filename_parts := array_append(filename_parts, clean_part);
        END IF;
        
        -- Stop when we have enough parts
        IF array_length(filename_parts, 1) >= preferences.max_filename_parts THEN
          EXIT;
        END IF;
      END IF;
    END IF;
  END LOOP;
  
  -- If no meaningful data, use fallback pattern
  IF array_length(filename_parts, 1) IS NULL THEN
    base_name := replace(replace(preferences.fallback_pattern, '{row_index}', row_index::text), '{timestamp}', extract(epoch from now())::text);
    RETURN base_name || extension;
  END IF;
  
  -- Combine parts and add extension
  base_name := array_to_string(filename_parts, preferences.separator);
  RETURN base_name || extension;
END;
$$;