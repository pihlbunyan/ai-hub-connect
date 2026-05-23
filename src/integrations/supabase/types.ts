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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_runs: {
        Row: {
          created_at: string
          error: string | null
          id: string
          input: Json
          metadata: Json | null
          output: Json
          success: boolean
          type: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          input?: Json
          metadata?: Json | null
          output?: Json
          success?: boolean
          type: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          input?: Json
          metadata?: Json | null
          output?: Json
          success?: boolean
          type?: string
        }
        Relationships: []
      }
      chats: {
        Row: {
          created_at: string
          id: string
          models_used: string[]
          prompt: string
          responses: Json
          tokens_used: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          models_used?: string[]
          prompt: string
          responses?: Json
          tokens_used?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          models_used?: string[]
          prompt?: string
          responses?: Json
          tokens_used?: number
          user_id?: string
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string
          tool_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          tool_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          tool_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      grok_usage_logs: {
        Row: {
          agent_type: string
          cost: number
          created_at: string
          id: string
          model: string | null
          tokens_in: number
          tokens_out: number
          usage_date: string
        }
        Insert: {
          agent_type: string
          cost?: number
          created_at?: string
          id?: string
          model?: string | null
          tokens_in?: number
          tokens_out?: number
          usage_date?: string
        }
        Update: {
          agent_type?: string
          cost?: number
          created_at?: string
          id?: string
          model?: string | null
          tokens_in?: number
          tokens_out?: number
          usage_date?: string
        }
        Relationships: []
      }
      news_posts: {
        Row: {
          content: string
          created_at: string
          id: string
          published_at: string
          source: string
          summary: string
          title: string
          updated_at: string
          url: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          published_at: string
          source: string
          summary: string
          title: string
          updated_at?: string
          url: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          published_at?: string
          source?: string
          summary?: string
          title?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      prompt_saves: {
        Row: {
          category: string
          created_at: string
          id: string
          content: string
          prompt_id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          content: string
          prompt_id: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          content?: string
          prompt_id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          mode: Database["public"]["Enums"]["user_mode"]
          preferences: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          mode?: Database["public"]["Enums"]["user_mode"]
          preferences?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          mode?: Database["public"]["Enums"]["user_mode"]
          preferences?: Json
          updated_at?: string
        }
        Relationships: []
      }
      tool_reviews: {
        Row: {
          body: string | null
          created_at: string
          id: string
          rating: number
          tool_id: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          rating: number
          tool_id: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          rating?: number
          tool_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_reviews_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      tools: {
        Row: {
          audience: Database["public"]["Enums"]["tool_audience"]
          category: string
          cost_tier: Database["public"]["Enums"]["cost_tier"]
          created_at: string
          description_long: string | null
          description_short: string
          id: string
          discover_summary: string | null
          discover_tags: string[]
          logo_url: string | null
          name: string
          pro_summary: string | null
          pro_tags: string[]
          rating: number
          safety_notes: string | null
          safety_score: number | null
          slug: string
          updated_at: string
          url: string | null
          vendor: string | null
        }
        Insert: {
          audience?: Database["public"]["Enums"]["tool_audience"]
          category: string
          cost_tier?: Database["public"]["Enums"]["cost_tier"]
          created_at?: string
          description_long?: string | null
          description_short: string
          id?: string
          discover_summary?: string | null
          discover_tags?: string[]
          logo_url?: string | null
          name: string
          pro_summary?: string | null
          pro_tags?: string[]
          rating?: number
          safety_notes?: string | null
          safety_score?: number | null
          slug: string
          updated_at?: string
          url?: string | null
          vendor?: string | null
        }
        Update: {
          audience?: Database["public"]["Enums"]["tool_audience"]
          category?: string
          cost_tier?: Database["public"]["Enums"]["cost_tier"]
          created_at?: string
          description_long?: string | null
          description_short?: string
          id?: string
          discover_summary?: string | null
          discover_tags?: string[]
          logo_url?: string | null
          name?: string
          pro_summary?: string | null
          pro_tags?: string[]
          rating?: number
          safety_notes?: string | null
          safety_score?: number | null
          slug?: string
          updated_at?: string
          url?: string | null
          vendor?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_first_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      get_prompt_catalog_timestamps: {
        Args: Record<PropertyKey, never>
        Returns: {
          prompt_id: string
          created_at: string
          updated_at: string
        }[]
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
      app_role: "admin" | "moderator" | "user"
      cost_tier: "free" | "freemium" | "paid" | "enterprise"
      tool_audience: "pro" | "discover" | "both"
      user_mode: "pro" | "discover"
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
      app_role: ["admin", "moderator", "user"],
      cost_tier: ["free", "freemium", "paid", "enterprise"],
      tool_audience: ["pro", "discover", "both"],
      user_mode: ["pro", "discover"],
    },
  },
} as const
