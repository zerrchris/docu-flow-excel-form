export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      admin_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          setting_key: string
          setting_value: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          setting_key: string
          setting_value: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_usage_analytics: {
        Row: {
          created_at: string
          error_message: string | null
          estimated_cost_usd: number | null
          function_name: string
          id: string
          input_tokens: number | null
          model_used: string
          output_tokens: number | null
          request_payload: Json | null
          response_payload: Json | null
          success: boolean
          total_tokens: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          estimated_cost_usd?: number | null
          function_name: string
          id?: string
          input_tokens?: number | null
          model_used: string
          output_tokens?: number | null
          request_payload?: Json | null
          response_payload?: Json | null
          success?: boolean
          total_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          estimated_cost_usd?: number | null
          function_name?: string
          id?: string
          input_tokens?: number | null
          model_used?: string
          output_tokens?: number | null
          request_payload?: Json | null
          response_payload?: Json | null
          success?: boolean
          total_tokens?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      ai_usage_logs: {
        Row: {
          cost: number
          id: string
          input_tokens: number
          metadata: Json | null
          model: string
          output_tokens: number
          provider: string
          timestamp: string
          total_tokens: number
          user_id: string
        }
        Insert: {
          cost?: number
          id?: string
          input_tokens?: number
          metadata?: Json | null
          model: string
          output_tokens?: number
          provider: string
          timestamp?: string
          total_tokens?: number
          user_id: string
        }
        Update: {
          cost?: number
          id?: string
          input_tokens?: number
          metadata?: Json | null
          model?: string
          output_tokens?: number
          provider?: string
          timestamp?: string
          total_tokens?: number
          user_id?: string
        }
        Relationships: []
      }
      document_extraction_metadata: {
        Row: {
          bbox_height: number | null
          bbox_width: number | null
          bbox_x1: number | null
          bbox_x2: number | null
          bbox_y1: number | null
          bbox_y2: number | null
          confidence_score: number | null
          created_at: string
          extracted_value: string | null
          extraction_method: string | null
          field_name: string
          id: string
          page_number: number
          row_index: number
          runsheet_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bbox_height?: number | null
          bbox_width?: number | null
          bbox_x1?: number | null
          bbox_x2?: number | null
          bbox_y1?: number | null
          bbox_y2?: number | null
          confidence_score?: number | null
          created_at?: string
          extracted_value?: string | null
          extraction_method?: string | null
          field_name: string
          id?: string
          page_number?: number
          row_index: number
          runsheet_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bbox_height?: number | null
          bbox_width?: number | null
          bbox_x1?: number | null
          bbox_x2?: number | null
          bbox_y1?: number | null
          bbox_y2?: number | null
          confidence_score?: number | null
          created_at?: string
          extracted_value?: string | null
          extraction_method?: string | null
          field_name?: string
          id?: string
          page_number?: number
          row_index?: number
          runsheet_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_extraction_metadata_runsheet_id_fkey"
            columns: ["runsheet_id"]
            isOneToOne: false
            referencedRelation: "runsheets"
            referencedColumns: ["id"]
          },
        ]
      }
      document_ocr_data: {
        Row: {
          confidence_score: number | null
          created_at: string
          extracted_text: string | null
          id: string
          processing_method: string | null
          row_index: number | null
          runsheet_id: string | null
          structured_data: Json | null
          updated_at: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          extracted_text?: string | null
          id?: string
          processing_method?: string | null
          row_index?: number | null
          runsheet_id?: string | null
          structured_data?: Json | null
          updated_at?: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          extracted_text?: string | null
          id?: string
          processing_method?: string | null
          row_index?: number | null
          runsheet_id?: string | null
          structured_data?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          content_type: string | null
          created_at: string
          file_path: string
          file_size: number | null
          folder_id: string | null
          id: string
          original_filename: string
          row_index: number
          runsheet_id: string | null
          stored_filename: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          file_path: string
          file_size?: number | null
          folder_id?: string | null
          id?: string
          original_filename: string
          row_index: number
          runsheet_id?: string | null
          stored_filename: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content_type?: string | null
          created_at?: string
          file_path?: string
          file_size?: number | null
          folder_id?: string | null
          id?: string
          original_filename?: string
          row_index?: number
          runsheet_id?: string | null
          stored_filename?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_runsheet_id_fkey"
            columns: ["runsheet_id"]
            isOneToOne: false
            referencedRelation: "runsheets"
            referencedColumns: ["id"]
          },
        ]
      }
      folders: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_folder_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parent_folder_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_folder_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "folders_parent_folder_id_fkey"
            columns: ["parent_folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
      function_logs: {
        Row: {
          created_at: string
          error_message: string | null
          execution_time_ms: number | null
          function_name: string
          id: string
          input: Json | null
          output: Json | null
          status_code: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          execution_time_ms?: number | null
          function_name: string
          id?: string
          input?: Json | null
          output?: Json | null
          status_code?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          execution_time_ms?: number | null
          function_name?: string
          id?: string
          input?: Json | null
          output?: Json | null
          status_code?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      lease_check_analyses: {
        Row: {
          analysis_data: Json
          created_at: string
          document_text: string
          id: string
          prospect: string
          updated_at: string
          user_id: string
        }
        Insert: {
          analysis_data: Json
          created_at?: string
          document_text: string
          id?: string
          prospect: string
          updated_at?: string
          user_id: string
        }
        Update: {
          analysis_data?: Json
          created_at?: string
          document_text?: string
          id?: string
          prospect?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      runsheets: {
        Row: {
          column_instructions: Json | null
          columns: string[]
          created_at: string
          data: Json
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          column_instructions?: Json | null
          columns?: string[]
          created_at?: string
          data?: Json
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          column_instructions?: Json | null
          columns?: string[]
          created_at?: string
          data?: Json
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscribers: {
        Row: {
          created_at: string
          email: string
          id: string
          stripe_customer_id: string | null
          subscribed: boolean
          subscription_end: string | null
          subscription_tier: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          stripe_customer_id?: string | null
          subscribed?: boolean
          subscription_end?: string | null
          subscription_tier?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          stripe_customer_id?: string | null
          subscribed?: boolean
          subscription_end?: string | null
          subscription_tier?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_billing_summary: {
        Row: {
          billing_cycle_start: string
          current_month_cost: number
          id: string
          last_billing_date: string | null
          total_ai_cost: number
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_cycle_start?: string
          current_month_cost?: number
          id?: string
          last_billing_date?: string | null
          total_ai_cost?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_cycle_start?: string
          current_month_cost?: number
          id?: string
          last_billing_date?: string | null
          total_ai_cost?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_column_width_preferences: {
        Row: {
          column_name: string
          created_at: string
          id: string
          runsheet_id: string | null
          updated_at: string
          user_id: string
          width: number
        }
        Insert: {
          column_name: string
          created_at?: string
          id?: string
          runsheet_id?: string | null
          updated_at?: string
          user_id: string
          width: number
        }
        Update: {
          column_name?: string
          created_at?: string
          id?: string
          runsheet_id?: string | null
          updated_at?: string
          user_id?: string
          width?: number
        }
        Relationships: []
      }
      user_document_naming_preferences: {
        Row: {
          created_at: string
          fallback_pattern: string
          id: string
          include_extension: boolean
          is_active: boolean
          max_filename_parts: number
          preference_name: string
          priority_columns: string[]
          separator: string
          updated_at: string
          use_smart_naming: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          fallback_pattern?: string
          id?: string
          include_extension?: boolean
          is_active?: boolean
          max_filename_parts?: number
          preference_name?: string
          priority_columns?: string[]
          separator?: string
          updated_at?: string
          use_smart_naming?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          fallback_pattern?: string
          id?: string
          include_extension?: boolean
          is_active?: boolean
          max_filename_parts?: number
          preference_name?: string
          priority_columns?: string[]
          separator?: string
          updated_at?: string
          use_smart_naming?: boolean
          user_id?: string
        }
        Relationships: []
      }
      user_extraction_preferences: {
        Row: {
          column_instructions: Json
          columns: string[]
          created_at: string
          id: string
          is_default: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          column_instructions?: Json
          columns?: string[]
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          column_instructions?: Json
          columns?: string[]
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      ai_usage_summary: {
        Row: {
          avg_cost_per_request: number | null
          function_name: string | null
          model_used: string | null
          request_count: number | null
          total_estimated_cost: number | null
          total_input_tokens: number | null
          total_output_tokens: number | null
          total_tokens: number | null
          usage_date: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      generate_document_filename: {
        Args: {
          original_filename: string
          row_index: number
          runsheet_data: Json
        }
        Returns: string
      }
      generate_document_filename_with_preferences: {
        Args: {
          original_filename: string
          row_index: number
          runsheet_data: Json
          user_id: string
        }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
