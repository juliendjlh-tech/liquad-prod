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
          catalog_id: string
          consumer_workspace_id: string
          created_at: string | null
          expires_at: string
          id: string
          price_eur: number
          publisher_workspace_id: string
          url: string
        }
        Insert: {
          catalog_id: string
          consumer_workspace_id: string
          created_at?: string | null
          expires_at: string
          id?: string
          price_eur: number
          publisher_workspace_id: string
          url: string
        }
        Update: {
          catalog_id?: string
          consumer_workspace_id?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          price_eur?: number
          publisher_workspace_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_grants_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
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
      import_jobs: {
        Row: {
          id: string
          workspace_id: string
          sitemap_url: string
          status: string
          result: Json | null
          error_message: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          workspace_id: string
          sitemap_url: string
          status?: string
          result?: Json | null
          error_message?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          workspace_id?: string
          sitemap_url?: string
          status?: string
          result?: Json | null
          error_message?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_workspace_id_fkey"
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
          amount_eur: number
          catalog_id: string | null
          consumer_workspace_id: string
          content_url: string | null
          created_at: string | null
          description: string | null
          grant_id: string | null
          id: string
          publisher_workspace_id: string
          type: string
        }
        Insert: {
          amount_eur: number
          catalog_id?: string | null
          consumer_workspace_id: string
          content_url?: string | null
          created_at?: string | null
          description?: string | null
          grant_id?: string | null
          id?: string
          publisher_workspace_id: string
          type: string
        }
        Update: {
          amount_eur?: number
          catalog_id?: string | null
          consumer_workspace_id?: string
          content_url?: string | null
          created_at?: string | null
          description?: string | null
          grant_id?: string | null
          id?: string
          publisher_workspace_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
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
          ic_duration_ms: number | null
          ic_hostname: string | null
          ic_verified: boolean | null
          id: string
          matched_catalog_id: string | null
          price_applied: number | null
          request_url: string
          source_ip: string | null
          timestamp: string
          user_agent_name: string | null
          user_agent_raw: string | null
          workspace_id: string
        }
        Insert: {
          consumer_workspace_id?: string | null
          decision: string
          domain: string
          ic_duration_ms?: number | null
          ic_hostname?: string | null
          ic_verified?: boolean | null
          id?: string
          matched_catalog_id?: string | null
          price_applied?: number | null
          request_url: string
          source_ip?: string | null
          timestamp?: string
          user_agent_name?: string | null
          user_agent_raw?: string | null
          workspace_id: string
        }
        Update: {
          consumer_workspace_id?: string | null
          decision?: string
          domain?: string
          ic_duration_ms?: number | null
          ic_hostname?: string | null
          ic_verified?: boolean | null
          id?: string
          matched_catalog_id?: string | null
          price_applied?: number | null
          request_url?: string
          source_ip?: string | null
          timestamp?: string
          user_agent_name?: string | null
          user_agent_raw?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sdk_events_consumer_workspace_id_fkey"
            columns: ["consumer_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
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
          dns_patterns: string[]
          id: string
          is_active: boolean | null
          is_preset: boolean | null
          name: string
          ua_pattern: string
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          dns_patterns?: string[]
          id?: string
          is_active?: boolean | null
          is_preset?: boolean | null
          name: string
          ua_pattern: string
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          dns_patterns?: string[]
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
          role: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          id?: string
          invited_at?: string | null
          role?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          id?: string
          invited_at?: string | null
          role?: string | null
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
      get_domain_content_counts: {
        Args: {
          p_workspace_id: string
        }
        Returns: {
          domain: string
          content_count: number
        }[]
      }
      check_cache_and_debit: {
        Args: {
          p_catalog_id: string
          p_consumer_id: string
          p_price_eur: number
          p_publisher_id: string
          p_ttl_minutes?: number
          p_url: string
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
