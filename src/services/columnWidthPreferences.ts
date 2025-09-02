/**
 * Service for managing user column width preferences
 */

import { supabase } from '@/integrations/supabase/client';

export interface ColumnWidthPreference {
  id: string;
  user_id: string;
  runsheet_id: string | null;
  column_name: string;
  width: number;
  created_at: string;
  updated_at: string;
}

export class ColumnWidthPreferencesService {
  /**
   * Load column width preferences for a user and optional runsheet
   */
  static async loadPreferences(runsheetId?: string): Promise<Record<string, number>> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return {};

      const query = supabase
        .from('user_column_width_preferences')
        .select('column_name, width')
        .eq('user_id', user.id);

      // If runsheetId is provided, get preferences for that specific runsheet
      // Otherwise, get global preferences (where runsheet_id is null)
      if (runsheetId) {
        query.eq('runsheet_id', runsheetId);
      } else {
        query.is('runsheet_id', null);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error loading column width preferences:', error);
        return {};
      }

      // Convert array to object with column names as keys
      const preferences: Record<string, number> = {};
      (data || []).forEach(pref => {
        preferences[pref.column_name] = pref.width;
      });

      return preferences;
    } catch (error) {
      console.error('Error in loadPreferences:', error);
      return {};
    }
  }

  /**
   * Save column width preferences
   */
  static async savePreferences(
    columnWidths: Record<string, number>,
    runsheetId?: string
  ): Promise<boolean> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      // Convert the columnWidths object to array format for database
      const preferencesToSave = Object.entries(columnWidths).map(([columnName, width]) => ({
        user_id: user.id,
        runsheet_id: runsheetId || null,
        column_name: columnName,
        width: Math.round(width), // Ensure integer
      }));

      // Use upsert to insert or update preferences
      const { error } = await supabase
        .from('user_column_width_preferences')
        .upsert(preferencesToSave, {
          onConflict: 'user_id, runsheet_id, column_name'
        });

      if (error) {
        console.error('Error saving column width preferences:', error);
        return false;
      }

      console.log('✅ Saved column width preferences');
      return true;
    } catch (error) {
      console.error('Error in savePreferences:', error);
      return false;
    }
  }

  /**
   * Save a single column width preference
   */
  static async saveColumnWidth(
    columnName: string,
    width: number,
    runsheetId?: string
  ): Promise<boolean> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { error } = await supabase
        .from('user_column_width_preferences')
        .upsert({
          user_id: user.id,
          runsheet_id: runsheetId || null,
          column_name: columnName,
          width: Math.round(width),
        }, {
          onConflict: 'user_id, runsheet_id, column_name'
        });

      if (error) {
        console.error('Error saving column width:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in saveColumnWidth:', error);
      return false;
    }
  }

  /**
   * Delete preferences for a specific runsheet (when runsheet is deleted)
   */
  static async deleteRunsheetPreferences(runsheetId: string): Promise<boolean> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { error } = await supabase
        .from('user_column_width_preferences')
        .delete()
        .eq('user_id', user.id)
        .eq('runsheet_id', runsheetId);

      if (error) {
        console.error('Error deleting runsheet preferences:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in deleteRunsheetPreferences:', error);
      return false;
    }
  }

  /**
   * Reset all column width preferences for a user
   */
  static async resetAllPreferences(): Promise<boolean> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { error } = await supabase
        .from('user_column_width_preferences')
        .delete()
        .eq('user_id', user.id);

      if (error) {
        console.error('Error resetting preferences:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in resetAllPreferences:', error);
      return false;
    }
  }
}
