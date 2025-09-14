import { supabase } from '@/integrations/supabase/client';

export interface ExtractionMetadata {
  id: string;
  runsheet_id: string;
  row_index: number;
  field_name: string;
  extracted_value: string;
  page_number: number;
  bbox_x1: number;
  bbox_y1: number;
  bbox_x2: number;
  bbox_y2: number;
  bbox_width: number;
  bbox_height: number;
  confidence_score: number;
  extraction_method: string;
  created_at: string;
  updated_at: string;
  user_id: string;
}

export class ExtractionMetadataService {
  /**
   * Get all extraction metadata for a specific runsheet and row
   */
  static async getMetadataForRow(runsheetId: string, rowIndex: number): Promise<ExtractionMetadata[]> {
    try {
      const { data, error } = await supabase
        .from('document_extraction_metadata')
        .select('*')
        .eq('runsheet_id', runsheetId)
        .eq('row_index', rowIndex)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching extraction metadata:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getMetadataForRow:', error);
      return [];
    }
  }

  /**
   * Get extraction metadata for a specific field
   */
  static async getMetadataForField(
    runsheetId: string, 
    rowIndex: number, 
    fieldName: string
  ): Promise<ExtractionMetadata | null> {
    try {
      const { data, error } = await supabase
        .from('document_extraction_metadata')
        .select('*')
        .eq('runsheet_id', runsheetId)
        .eq('row_index', rowIndex)
        .eq('field_name', fieldName)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching field metadata:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error in getMetadataForField:', error);
      return null;
    }
  }

  /**
   * Get all extraction metadata for a runsheet (all rows)
   */
  static async getMetadataForRunsheet(runsheetId: string): Promise<ExtractionMetadata[]> {
    try {
      const { data, error } = await supabase
        .from('document_extraction_metadata')
        .select('*')
        .eq('runsheet_id', runsheetId)
        .order('row_index', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching runsheet metadata:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getMetadataForRunsheet:', error);
      return [];
    }
  }

  /**
   * Delete extraction metadata for a specific row
   */
  static async deleteMetadataForRow(runsheetId: string, rowIndex: number): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('document_extraction_metadata')
        .delete()
        .eq('runsheet_id', runsheetId)
        .eq('row_index', rowIndex);

      if (error) {
        console.error('Error deleting extraction metadata:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in deleteMetadataForRow:', error);
      return false;
    }
  }

  /**
   * Store new extraction metadata
   */
  static async storeMetadata(
    runsheetId: string,
    rowIndex: number,
    extractionData: Array<{
      field_name: string;
      extracted_value: string;
      page_number: number;
      bbox: {
        x1: number;
        y1: number;
        x2: number;
        y2: number;
      };
      confidence_score: number;
    }>
  ): Promise<ExtractionMetadata[]> {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('No authenticated user for storing metadata');
        return [];
      }

      // First, delete existing metadata for this row to avoid duplicates
      await this.deleteMetadataForRow(runsheetId, rowIndex);

      // Prepare data for insertion
      const metadataInserts = extractionData.map(item => ({
        runsheet_id: runsheetId,
        row_index: rowIndex,
        field_name: item.field_name,
        extracted_value: item.extracted_value,
        page_number: item.page_number,
        bbox_x1: item.bbox.x1,
        bbox_y1: item.bbox.y1,
        bbox_x2: item.bbox.x2,
        bbox_y2: item.bbox.y2,
        bbox_width: item.bbox.x2 - item.bbox.x1,
        bbox_height: item.bbox.y2 - item.bbox.y1,
        confidence_score: item.confidence_score,
        extraction_method: 'ai_vision_bbox',
        user_id: user.id
      }));

      const { data, error } = await supabase
        .from('document_extraction_metadata')
        .insert(metadataInserts)
        .select();

      if (error) {
        console.error('Error storing extraction metadata:', error);
        return [];
      }

      console.log(`✅ Stored ${data?.length || 0} extraction metadata entries`);
      return data || [];
    } catch (error) {
      console.error('Error in storeMetadata:', error);
      return [];
    }
  }

  /**
   * Get extraction statistics for a runsheet
   */
  static async getExtractionStats(runsheetId: string): Promise<{
    totalFields: number;
    averageConfidence: number;
    fieldsWithHighConfidence: number;
    rowsWithExtraction: number;
  }> {
    try {
      const { data, error } = await supabase
        .from('document_extraction_metadata')
        .select('confidence_score, row_index')
        .eq('runsheet_id', runsheetId);

      if (error || !data) {
        console.error('Error fetching extraction stats:', error);
        return {
          totalFields: 0,
          averageConfidence: 0,
          fieldsWithHighConfidence: 0,
          rowsWithExtraction: 0
        };
      }

      const totalFields = data.length;
      const averageConfidence = data.reduce((sum, item) => sum + item.confidence_score, 0) / totalFields;
      const fieldsWithHighConfidence = data.filter(item => item.confidence_score >= 0.8).length;
      const uniqueRows = new Set(data.map(item => item.row_index));
      const rowsWithExtraction = uniqueRows.size;

      return {
        totalFields,
        averageConfidence,
        fieldsWithHighConfidence,
        rowsWithExtraction
      };
    } catch (error) {
      console.error('Error in getExtractionStats:', error);
      return {
        totalFields: 0,
        averageConfidence: 0,
        fieldsWithHighConfidence: 0,
        rowsWithExtraction: 0
      };
    }
  }
}