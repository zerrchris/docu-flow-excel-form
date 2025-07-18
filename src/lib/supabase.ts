import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Database = {
  public: {
    Tables: {
      runsheets: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          name: string
          columns: string[]
          data: Record<string, string>[]
          user_id: string
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
          name: string
          columns: string[]
          data: Record<string, string>[]
          user_id: string
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          name?: string
          columns?: string[]
          data?: Record<string, string>[]
          user_id?: string
        }
      }
    }
  }
}