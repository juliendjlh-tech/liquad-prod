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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      access_grants: {
        Row: {
          id: string
          consumer_workspace_id: string
          publisher_workspace_id: string
          url: string
          catalog_id: string
          price_eur: number
          expires_at: string
          created_at: string | null
        }
        Insert: {
          id?: string
          consumer_workspace_id: string
          publisher_workspace_id: string
          url: string
          catalog_id: string
          price_eur: number
          expires_at: string
          created_at?: string | null
        }
        Update: {
          id?: string
          consumer_workspace_id?: string
          publisher_workspace_id?: string
          url?: string
          catalog_id?: string
          price_eur?: number
          expires_at?: string
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "access_grants_consumer_workspace_id_fkey"
            columns: ["consumer_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_grants_publisher_workspace_id_fkey"
            columns: ["publisher_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_grants_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_agents: {
        Row: {
          catalog_id: string
          user_agent_id: string
        }
        Insert: {
          catalog_id: string
          user_agent_id: string
        }
        Update: {
          catalog_id?: string
          user_agent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_agents_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_agents_user_agent_id_fkey"
            columns: ["user_agent_id"]
            isOneToOne: false
            referencedRelation: "user_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogs: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          price_eur: number
          status: string
          url_patterns: string[]
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          price_eur?: number
          status?: string
          url_patterns?: string[]
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          price_eur?: number
          status?: string
          url_patterns?: string[]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalogs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contents: {
        Row: {
          created_at: string | null
          domain: string
          id: string
          lastmod: string | null
          source_url: string
          title: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          domain: string
          id?: string
          lastmod?: string | null
          source_url: string
          title?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          domain?: string
          id?: string
          lastmod?: string | null
          source_url?: string
          title?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_transactions: {
        Row: {
          id: string
          consumer_workspace_id: string
          publisher_workspace_id: string
          type: string
          amount_eur: number
          content_url: string | null
          catalog_id: string | null
          grant_id: string | null
          description: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          consumer_workspace_id: string
          publisher_workspace_id: string
          type: string
          amount_eur: number
          content_url?: string | null
          catalog_id?: string | null
          grant_id?: string | null
          description?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          consumer_workspace_id?: string
          publisher_workspace_id?: string
          type?: string
          amount_eur?: number
          content_url?: string | null
          catalog_id?: string | null
          grant_id?: string | null
          description?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_consumer_workspace_id_fkey"
            columns: ["consumer_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_transactions_publisher_workspace_id_fkey"
            columns: ["publisher_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_transactions_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
        ]
      }
      domains: {
        Row: {
          created_at: string | null
          domain: string
          id: string
          last_event_at: string | null
          status: string
          verified_at: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          domain: string
          id?: string
          last_event_at?: string | null
          status?: string
          verified_at?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          domain?: string
          id?: string
          last_event_at?: string | null
          status?: string
          verified_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "domains_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sdk_events: {
        Row: {
          consumer_workspace_id: string | null
          decision: string
          domain: string
          id: string
          matched_catalog_id: string | null
          price_applied: number | null
          request_url: string
          timestamp: string
          user_agent_name: string | null
          user_agent_raw: string | null
          workspace_id: string
        }
        Insert: {
          consumer_workspace_id?: string | null
          decision: string
          domain: string
          id?: string
          matched_catalog_id?: string | null
          price_applied?: number | null
          request_url: string
          timestamp?: string
          user_agent_name?: string | null
          user_agent_raw?: string | null
          workspace_id: string
        }
        Update: {
          consumer_workspace_id?: string | null
          decision?: string
          domain?: string
          id?: string
          matched_catalog_id?: string | null
          price_applied?: number | null
          request_url?: string
          timestamp?: string
          user_agent_name?: string | null
          user_agent_raw?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sdk_events_matched_catalog_id_fkey"
            columns: ["matched_catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sdk_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_agents: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          is_preset: boolean | null
          name: string
          ua_pattern: string
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_preset?: boolean | null
          name: string
          ua_pattern: string
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_preset?: boolean | null
          name?: string
          ua_pattern?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_agents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          accepted_at: string | null
          id: string
          invited_at: string | null
          role: string
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          id?: string
          invited_at?: string | null
          role?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          id?: string
          invited_at?: string | null
          role?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          api_key_hash: string | null
          api_key_prefix: string | null
          balance_eur: number
          created_at: string | null
          id: string
          initial_credit_eur: number
          jwt_signing_secret: string
          name: string
          updated_at: string | null
        }
        Insert: {
          api_key_hash?: string | null
          api_key_prefix?: string | null
          balance_eur?: number
          created_at?: string | null
          id?: string
          initial_credit_eur?: number
          jwt_signing_secret?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          api_key_hash?: string | null
          api_key_prefix?: string | null
          balance_eur?: number
          created_at?: string | null
          id?: string
          initial_credit_eur?: number
          jwt_signing_secret?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_cache_and_debit: {
        Args: {
          p_consumer_id: string
          p_publisher_id: string
          p_url: string
          p_catalog_id: string
          p_price_eur: number
          p_ttl_minutes?: number
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
