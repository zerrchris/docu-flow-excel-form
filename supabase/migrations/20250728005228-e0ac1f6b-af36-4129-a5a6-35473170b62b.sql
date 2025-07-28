-- Fix the user's extraction preferences to remove duplicate columns
UPDATE user_extraction_preferences 
SET columns = ARRAY['Inst Number', 'Book/Page', 'Inst Type', 'Recording Date', 'Document Date', 'Grantor', 'Grantee', 'Legal Description', 'Notes', 'Document File Name'],
    column_instructions = '{
      "Inst Number": "Extract the instrument number or recording number as it appears on the document",
      "Book/Page": "Extract the book and page reference (format: Book XXX, Page XXX or XXX/XXX)",
      "Inst Type": "Extract the document type (e.g., Deed, Mortgage, Lien, Assignment, etc.)",
      "Recording Date": "Extract the official recording date in MM/DD/YYYY format",
      "Document Date": "Extract the date the document was signed or executed in MM/DD/YYYY format",
      "Grantor": "Extract the full name(s) of the grantor(s) - the party transferring or granting rights",
      "Grantee": "Extract the full name(s) of the grantee(s) - the party receiving rights",
      "Legal Description": "Extract the complete legal property description including lot, block, subdivision, and any metes and bounds",
      "Notes": "Extract any special conditions, considerations, or additional relevant information",
      "Document File Name": "The desired filename for the stored document (user-specified)"
    }'::jsonb,
    updated_at = now()
WHERE user_id = 'e09da942-b892-424d-b4f8-7eff5f6d4856' 
  AND is_default = true;