import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../_shared/cors.ts'

interface OrganizeDocumentsRequest {
  runsheetId: string;
  runsheetName: string;
  documentIds: string[];
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { runsheetId, runsheetName, documentIds }: OrganizeDocumentsRequest = await req.json()
    
    console.log('Organizing documents for runsheet:', { runsheetId, runsheetName, documentIds })

    // Get the user from the auth header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (authError || !user) {
      throw new Error('Authentication failed')
    }

    // Clean the runsheet name for folder naming (remove special characters)
    const cleanFolderName = runsheetName
      .replace(/[^a-zA-Z0-9\s\-_]/g, '')
      .trim()
      .substring(0, 100) // Limit length

    if (!cleanFolderName) {
      throw new Error('Invalid runsheet name for folder creation')
    }

    // Check if a folder with this runsheet name already exists for this user
    const { data: existingFolder, error: folderSearchError } = await supabase
      .from('folders')
      .select('id')
      .eq('user_id', user.id)
      .eq('name', cleanFolderName)
      .eq('parent_folder_id', null) // Top-level folder
      .single()

    if (folderSearchError && folderSearchError.code !== 'PGRST116') {
      // PGRST116 is "not found" error, which is expected if folder doesn't exist
      throw folderSearchError
    }

    let folderId: string

    if (existingFolder) {
      // Use existing folder
      folderId = existingFolder.id
      console.log('Using existing folder:', folderId)
    } else {
      // Create new folder for this runsheet
      const { data: newFolder, error: folderCreateError } = await supabase
        .from('folders')
        .insert({
          name: cleanFolderName,
          user_id: user.id,
          parent_folder_id: null // Top-level folder
        })
        .select('id')
        .single()

      if (folderCreateError) {
        throw folderCreateError
      }

      folderId = newFolder.id
      console.log('Created new folder:', folderId)
    }

    // Update all specified documents to be in this folder
    const { error: updateError } = await supabase
      .from('documents')
      .update({ folder_id: folderId })
      .in('id', documentIds)
      .eq('user_id', user.id) // Security: only update user's own documents

    if (updateError) {
      throw updateError
    }

    console.log(`Successfully organized ${documentIds.length} documents into folder: ${cleanFolderName}`)

    return new Response(
      JSON.stringify({
        success: true,
        folderId,
        folderName: cleanFolderName,
        documentsOrganized: documentIds.length
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Error organizing documents:', error)
    
    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to organize documents'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})