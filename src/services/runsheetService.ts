import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { ExtractionPreferencesService } from '@/services/extractionPreferences';

export interface CreateRunsheetParams {
  name: string;
  columns?: string[];
  columnInstructions?: Record<string, string>;
}

export interface OpenRunsheetParams {
  runsheetId?: string;
  runsheet?: any;
}

export interface RunsheetUploadParams {
  name: string;
  columns: string[];
  rows: Record<string, string>[];
}

export class RunsheetService {
  private static readonly DEFAULT_COLUMNS = [
    'Inst Number', 'Book/Page', 'Inst Type', 'Recording Date', 'Document Date', 
    'Grantor', 'Grantee', 'Legal Description', 'Notes'
  ];

  /**
   * Creates a new runsheet using the unified Dashboard approach
   */
  static async createNewRunsheet(params: CreateRunsheetParams, navigate: (path: string, options?: any) => void) {
    const { name, columns, columnInstructions } = params;
    
    if (!name.trim()) {
      toast({
        title: "Name required",
        description: "Please enter a name for your runsheet.",
        variant: "destructive"
      });
      return false;
    }

    try {
      // Get user preferences for initial columns (same as Dashboard)
      const preferences = await ExtractionPreferencesService.getDefaultPreferences();
      console.log('🔍 RUNSHEET_SERVICE: Loaded preferences:', preferences);
      
      // Ensure we have valid columns - preferences.columns should be an array
      const preferencesColumns = Array.isArray(preferences?.columns) && preferences.columns.length > 0 
        ? preferences.columns 
        : this.DEFAULT_COLUMNS;
      
      const initialColumns = columns || preferencesColumns;
      const initialInstructions = columnInstructions || (preferences?.column_instructions as Record<string, string>) || {};
      
      console.log('🔧 RUNSHEET_SERVICE: Using columns:', initialColumns);
      console.log('🔧 RUNSHEET_SERVICE: Using instructions:', initialInstructions);

      const finalName = name.trim();
      
      // Queue a pending creation request to survive navigation race conditions
      try {
        const payload = {
          name: finalName,
          columns: initialColumns,
          instructions: initialInstructions,
          ts: Date.now()
        };
        sessionStorage.setItem('pending_new_runsheet', JSON.stringify(payload));
      } catch (e) {
        console.error('Failed to set pending_new_runsheet in service:', e);
      }
      
      // Navigate to runsheet first (same as Dashboard)
      navigate('/runsheet');
      
      // Small delay to ensure navigation completes, then trigger the same event as Dashboard
      setTimeout(() => {
        console.log('🔧 UNIFIED SERVICE: Creating event with name:', finalName);
        // Dispatch the same event that Dashboard uses
        const event = new CustomEvent('createNewRunsheetFromDashboard', {
          detail: {
            name: finalName,
            columns: initialColumns,
            instructions: initialInstructions
          }
        });
        console.log('🔧 UNIFIED SERVICE: Event detail:', event.detail);
        console.log('🔧 UNIFIED SERVICE: About to dispatch event to window');
        window.dispatchEvent(event);
        console.log('🔧 UNIFIED SERVICE: Event dispatched successfully');
      }, 100);
      
      return true;
    } catch (error) {
      console.error('Error creating new runsheet:', error);
      toast({
        title: "Error", 
        description: "Failed to create new runsheet. Please try again.",
        variant: "destructive"
      });
      return false;
    }
  }

  /**
   * Opens an existing runsheet (same approach across all components)
   */
  static openRunsheet(params: OpenRunsheetParams, navigate: (path: string, options?: any) => void) {
    const { runsheetId, runsheet } = params;
    
    if (runsheet) {
      // Open specific runsheet with data (same as Dashboard)
      navigate('/runsheet', { state: { runsheet } });
    } else if (runsheetId) {
      // Open runsheet by ID
      navigate(`/runsheet?id=${runsheetId}`);
    }
  }

  /**
   * Unified runsheet upload handling (same as Dashboard approach)
   */
  static async uploadRunsheet(params: RunsheetUploadParams, navigate: (path: string, options?: any) => void) {
    const { name, columns, rows } = params;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Authentication Required",
          description: "Please sign in to upload a runsheet.",
          variant: "destructive"
        });
        return false;
      }

      // Create runsheet data with uploaded content
      const runsheetData = {
        name: name.trim(),
        columns,
        data: rows,
        column_instructions: this.createDefaultInstructions(columns),
        user_id: user.id
      };

      console.log('🔧 UNIFIED SERVICE: Uploading runsheet with data:', runsheetData);

      // Save to database
      const { data: savedRunsheet, error } = await supabase
        .from('runsheets')
        .insert(runsheetData)
        .select()
        .single();

      if (error) throw error;

      console.log('📊 Runsheet uploaded successfully:', savedRunsheet);

      // Navigate to runsheet with the uploaded data
      navigate('/runsheet', { state: { runsheet: savedRunsheet } });

      toast({
        title: "Upload Successful",
        description: `"${name}" has been uploaded with ${rows.length} rows.`
      });

      return true;
    } catch (error) {
      console.error('Error uploading runsheet:', error);
      toast({
        title: "Upload Failed",
        description: "Failed to upload runsheet. Please try again.",
        variant: "destructive"
      });
      return false;
    }
  }

  /**
   * Handle file upload workflow (unified approach)
   */
  static handleFileUpload(navigate: (path: string, options?: any) => void) {
    // Navigate with upload action (same as Dashboard)
    navigate('/runsheet?action=upload');
  }

  /**
   * Handle Google Drive workflow (unified approach)
   */
  static handleGoogleDrive(navigate: (path: string, options?: any) => void) {
    // Navigate with Google Drive action (same as Dashboard)
    navigate('/runsheet?action=google-drive');
  }

  /**
   * Create default instructions for uploaded columns
   */
  private static createDefaultInstructions(columns: string[]): Record<string, string> {
    const instructions: Record<string, string> = {};
    columns.forEach(column => {
      instructions[column] = `Extract the ${column.toLowerCase()} information as it appears in the document`;
    });
    return instructions;
  }

  /**
   * Append feedback to a specific column instruction for a runsheet
   */
  static async appendToRunsheetColumnInstructions(
    runsheetId: string, 
    columnName: string, 
    feedback: string
  ): Promise<boolean> {
    try {
      // First get the current runsheet data
      const { data: runsheet, error: fetchError } = await supabase
        .from('runsheets')
        .select('column_instructions')
        .eq('id', runsheetId)
        .single();

      if (fetchError) {
        console.error('Error fetching runsheet for column instruction update:', fetchError);
        return false;
      }

      const currentInstructions = runsheet.column_instructions || {};
      const currentInstruction = currentInstructions[columnName] || `Extract the ${columnName.toLowerCase()} information as it appears in the document`;
      
      // Append the feedback to the existing instruction
      const updatedInstruction = `${currentInstruction}. ${feedback}`;
      
      // Update the instructions
      const updatedInstructions = {
        ...(currentInstructions as Record<string, string>),
        [columnName]: updatedInstruction
      };

      // Save back to database
      const { error: updateError } = await supabase
        .from('runsheets')
        .update({ column_instructions: updatedInstructions })
        .eq('id', runsheetId);

      if (updateError) {
        console.error('Error updating runsheet column instructions:', updateError);
        return false;
      }

      console.log(`✅ Successfully appended feedback to runsheet column instruction for "${columnName}"`);
      return true;
    } catch (error) {
      console.error('Error in appendToRunsheetColumnInstructions:', error);
      return false;
    }
  }
}