import { supabase } from "@/integrations/supabase/client";

export class AdminSettingsService {
  /**
   * Get global extraction instructions
   */
  static async getGlobalExtractionInstructions(): Promise<string> {
    try {
      const { data, error } = await supabase
        .from('admin_settings')
        .select('setting_value')
        .eq('setting_key', 'global_extraction_instructions')
        .maybeSingle();

      if (error) {
        console.error('Error fetching global instructions:', error);
        return '';
      }

      return data?.setting_value || '';
    } catch (error) {
      console.error('Error fetching global instructions:', error);
      return '';
    }
  }

  /**
   * Update global extraction instructions (admin only)
   */
  static async updateGlobalExtractionInstructions(instructions: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('admin_settings')
        .update({ 
          setting_value: instructions,
          updated_at: new Date().toISOString()
        })
        .eq('setting_key', 'global_extraction_instructions');

      if (error) {
        console.error('Error updating global instructions:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error updating global instructions:', error);
      return false;
    }
  }
}