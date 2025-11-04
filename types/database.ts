export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          id: string
          email: string
          first_name: string | null
          last_name: string | null
          health_goals: string[] | null
          mobility_level: string | null
          preferred_activities: string[] | null
          location_preferences: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          first_name?: string | null
          last_name?: string | null
          health_goals?: string[] | null
          mobility_level?: string | null
          preferred_activities?: string[] | null
          location_preferences?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          first_name?: string | null
          last_name?: string | null
          health_goals?: string[] | null
          mobility_level?: string | null
          preferred_activities?: string[] | null
          location_preferences?: Json | null
          created_at?: string
          updated_at?: string
        }
      }
      conversations: {
        Row: {
          id: string
          user_id: string
          assistant_type: 'health_coach' | 'excursion_creator'
          thread_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          assistant_type: 'health_coach' | 'excursion_creator'
          thread_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          assistant_type?: 'health_coach' | 'excursion_creator'
          thread_id?: string
          created_at?: string
          updated_at?: string
        }
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          role: 'user' | 'assistant'
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          role: 'user' | 'assistant'
          content: string
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          role?: 'user' | 'assistant'
          content?: string
          created_at?: string
        }
      }
    }
    Views: {}
    Functions: {}
    Enums: {}
  }
}
