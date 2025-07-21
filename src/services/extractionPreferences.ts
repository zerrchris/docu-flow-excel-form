import { supabase } from "@/integrations/supabase/client";
import { Json } from "@/integrations/supabase/types";

export interface ExtractionPreference {
  id: string;
  user_id: string;
  name: string;
  columns: string[];
  column_instructions: Json;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

// Helper type for working with column instructions
type ColumnInstructions = Record<string, string>;

export class ExtractionPreferencesService {
  /**
   * Get user's default extraction preferences
   */
  static async getDefaultPreferences(): Promise<ExtractionPreference | null> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return null;
    }

    const { data, error } = await supabase
      .from('user_extraction_preferences')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_default', true)
      .maybeSingle();

    if (error) {
      console.error('Error fetching default preferences:', error);
      return null;
    }

    return data;
  }

  /**
   * Get all user's extraction preferences
   */
  static async getAllPreferences(): Promise<ExtractionPreference[]> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return [];
    }

    const { data, error } = await supabase
      .from('user_extraction_preferences')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching preferences:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Save or update user's default extraction preferences
   */
  static async saveDefaultPreferences(
    columns: string[], 
    columnInstructions: ColumnInstructions
  ): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.error('User not authenticated');
      return false;
    }

    try {
      console.log('🔧 ExtractionPreferencesService.saveDefaultPreferences called with:');
      console.log('🔧 Columns:', columns);
      console.log('🔧 Column Instructions:', columnInstructions);
      
      // First, check if default preferences already exist
      const existing = await this.getDefaultPreferences();
      console.log('🔧 Existing preferences:', existing);

      if (existing) {
        // Update existing default preferences
        console.log('🔧 Updating existing preferences with ID:', existing.id);
        const { error } = await supabase
          .from('user_extraction_preferences')
          .update({
            columns,
            column_instructions: columnInstructions,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);

        if (error) {
          console.error('🔧 Error updating default preferences:', error);
          return false;
        }
        console.log('🔧 Successfully updated existing preferences');
      } else {
        // Create new default preferences
        console.log('🔧 Creating new default preferences');
        const { error } = await supabase
          .from('user_extraction_preferences')
          .insert({
            user_id: user.id,
            name: 'Default',
            columns,
            column_instructions: columnInstructions,
            is_default: true
          });

        if (error) {
          console.error('🔧 Error creating default preferences:', error);
          return false;
        }
        console.log('🔧 Successfully created new preferences');
      }

      return true;
    } catch (error) {
      console.error('Error saving preferences:', error);
      return false;
    }
  }

  /**
   * Save named extraction preferences (not default)
   */
  static async saveNamedPreferences(
    name: string,
    columns: string[], 
    columnInstructions: ColumnInstructions
  ): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.error('User not authenticated');
      return false;
    }

    try {
      const { error } = await supabase
        .from('user_extraction_preferences')
        .insert({
          user_id: user.id,
          name,
          columns,
          column_instructions: columnInstructions,
          is_default: false
        });

      if (error) {
        console.error('Error saving named preferences:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error saving named preferences:', error);
      return false;
    }
  }

  /**
   * Delete extraction preferences
   */
  static async deletePreferences(id: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('user_extraction_preferences')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting preferences:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error deleting preferences:', error);
      return false;
    }
  }
}