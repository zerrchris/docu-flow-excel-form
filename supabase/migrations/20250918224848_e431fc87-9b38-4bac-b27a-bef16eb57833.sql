-- Update the document filename generation functions to not include extensions
-- since the system now relies entirely on content_type in the database

-- Update the basic filename generation function
CREATE OR REPLACE FUNCTION public.generate_document_filename(runsheet_data jsonb, row_index integer, original_filename text)
RETURNS text
LANGUAGE plpgsql
AS $function$
DECLARE
  row_data JSONB;
  filename_parts TEXT[];
  clean_part TEXT;
  base_name TEXT;
BEGIN
  -- Get the row data
  IF jsonb_array_length(runsheet_data) > row_index THEN
    row_data := runsheet_data->row_index;
  ELSE
    RETURN 'document_' || row_index;
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
    RETURN 'document_row_' || row_index;
  END IF;
  
  -- Combine parts (no extension - we rely on content_type in database)
  base_name := array_to_string(filename_parts, '_');
  RETURN base_name;
END;
$function$;

-- Update the preferences-based filename generation function
CREATE OR REPLACE FUNCTION public.generate_document_filename_with_preferences(runsheet_data jsonb, row_index integer, original_filename text, user_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $function$
DECLARE
  row_data JSONB;
  filename_parts TEXT[];
  clean_part TEXT;
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
    preferences.include_extension := false; -- No longer include extensions
    preferences.fallback_pattern := 'document_{row_index}_{timestamp}';
  END IF;
  
  -- Get the row data
  IF jsonb_array_length(runsheet_data) > row_index THEN
    row_data := runsheet_data->row_index;
  ELSE
    -- Use fallback pattern (no extension)
    base_name := replace(replace(preferences.fallback_pattern, '{row_index}', row_index::text), '{timestamp}', extract(epoch from now())::text);
    RETURN base_name;
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
  
  -- If no meaningful data, use fallback pattern (no extension)
  IF array_length(filename_parts, 1) IS NULL THEN
    base_name := replace(replace(preferences.fallback_pattern, '{row_index}', row_index::text), '{timestamp}', extract(epoch from now())::text);
    RETURN base_name;
  END IF;
  
  -- Combine parts (no extension - we rely on content_type in database)
  base_name := array_to_string(filename_parts, preferences.separator);
  RETURN base_name;
END;
$function$;