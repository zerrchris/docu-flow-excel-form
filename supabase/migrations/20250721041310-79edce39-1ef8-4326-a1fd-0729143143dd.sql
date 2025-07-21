UPDATE user_extraction_preferences 
SET columns = ARRAY['Inst Number', 'Book/Page', 'Inst Type', 'Recording Date', 'Document Date', 'Grantor', 'Grantee', 'Legal Description', 'Notes', 'Document File Name']
WHERE user_id = 'e09da942-b892-424d-b4f8-7eff5f6d4856' AND is_default = true;