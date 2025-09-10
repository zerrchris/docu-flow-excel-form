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
      const initialColumns = columns || preferences?.columns || this.DEFAULT_COLUMNS;
      const initialInstructions = columnInstructions || preferences?.column_instructions || {};

      const finalName = name.trim();
      
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
      // Open specific runsheet with data
      navigate('/runsheet', { state: { runsheet } });
    } else if (runsheetId) {
      // Open runsheet by ID
      navigate(`/runsheet?id=${runsheetId}`);
    }
  }
}