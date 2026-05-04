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
          bot_id: string | null
          catalog_id: string
          consumer_workspace_id: string
          created_at: string | null
          expires_at: string
          id: string
          price_eur: number
          publisher_workspace_id: string
          ua_pattern: string | null
          url: string
        }
        Insert: {
          bot_id?: string | null
          catalog_id: string
          consumer_workspace_id: string
          created_at?: string | null
          expires_at: string
          id?: string
          price_eur: number
          publisher_workspace_id: string
          ua_pattern?: string | null
          url: string
        }
        Update: {
          bot_id?: string | null
          catalog_id?: string
          consumer_workspace_id?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          price_eur?: number
          publisher_workspace_id?: string
          ua_pattern?: string | null
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
      catalog_bots: {
        Row: {
          catalog_id: string
          bot_id: string
        }
        Insert: {
          catalog_id: string
          bot_id: string
        }
        Update: {
          catalog_id?: string
          bot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_bots_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_bots_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_sources: {
        Row: {
          catalog_id: string
          indexed_source_id: string
        }
        Insert: {
          catalog_id: string
          indexed_source_id: string
        }
        Update: {
          catalog_id?: string
          indexed_source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_sources_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_sources_indexed_source_id_fkey"
            columns: ["indexed_source_id"]
            isOneToOne: false
            referencedRelation: "indexed_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogs: {
        Row: {
          created_at: string | null
          description: string | null
          filter_rules: Json
          id: string
          name: string
          price_eur: number
          rag_enabled: boolean
          rag_source_count: number
          status: string
          ttl_minutes: number | null
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          filter_rules?: Json
          id?: string
          name: string
          price_eur?: number
          rag_enabled?: boolean
          rag_source_count?: number
          status?: string
          ttl_minutes?: number | null
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          filter_rules?: Json
          id?: string
          name?: string
          price_eur?: number
          rag_enabled?: boolean
          rag_source_count?: number
          status?: string
          ttl_minutes?: number | null
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
      indexing_jobs: {
        Row: {
          id: string
          workspace_id: string
          domain_id: string | null
          sitemap_url: string
          reindex: boolean
          urls_to_index: string[]
          status: string
          result: Json | null
          error_message: string | null
          path_rules: Json | null
          max_pages: number | null
          scrape_status: string
          scrape_processed_pages: number
          scrape_error_message: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          workspace_id: string
          domain_id?: string | null
          sitemap_url: string
          reindex?: boolean
          urls_to_index?: string[]
          status?: string
          result?: Json | null
          error_message?: string | null
          path_rules?: Json | null
          max_pages?: number | null
          scrape_status?: string
          scrape_processed_pages?: number
          scrape_error_message?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          workspace_id?: string
          domain_id?: string | null
          sitemap_url?: string
          reindex?: boolean
          urls_to_index?: string[]
          status?: string
          result?: Json | null
          error_message?: string | null
          path_rules?: Json | null
          max_pages?: number | null
          scrape_status?: string
          scrape_processed_pages?: number
          scrape_error_message?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "indexing_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      indexed_sources: {
        Row: {
          id: string
          workspace_id: string
          source_url: string
          title: string | null
          lastmod: string | null
          domain_id: string
          /**
           * URL path extracted from source_url (e.g. "/blog/my-post").
           * Generated column (STORED), readonly. Indexed via
           * idx_sources_ws_domain_path on (workspace_id, domain_id, path).
           */
          path: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          workspace_id: string
          source_url: string
          title?: string | null
          lastmod?: string | null
          domain_id: string
          created_at?: string | null
        }
        Update: {
          id?: string
          workspace_id?: string
          source_url?: string
          title?: string | null
          lastmod?: string | null
          domain_id?: string
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "indexed_sources_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_indexed_sources_domain"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "domains"
            referencedColumns: ["id"]
          },
        ]
      }
      chunks: {
        Row: {
          id: string
          indexed_source_id: string
          indexing_job_id: string | null
          chunk_index: number | null
          chunk_text: string | null
          heading_context: string | null
          token_count: number | null
          embedding: string | null
        }
        Insert: {
          id?: string
          indexed_source_id: string
          indexing_job_id?: string | null
          chunk_index?: number | null
          chunk_text?: string | null
          heading_context?: string | null
          token_count?: number | null
          embedding?: string | null
        }
        Update: {
          id?: string
          indexed_source_id?: string
          indexing_job_id?: string | null
          chunk_index?: number | null
          chunk_text?: string | null
          heading_context?: string | null
          token_count?: number | null
          embedding?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_chunks_indexed_source"
            columns: ["indexed_source_id"]
            isOneToOne: false
            referencedRelation: "indexed_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_transactions: {
        Row: {
          bot_id: string | null
          amount_eur: number
          api_key_id: string | null
          catalog_id: string | null
          consumer_workspace_id: string
          content_url: string | null
          created_at: string | null
          description: string | null
          external_ref: string | null
          grant_id: string | null
          id: string
          publisher_workspace_id: string | null
          type: string
          bot_subscription_id: string | null
        }
        Insert: {
          bot_id?: string | null
          amount_eur: number
          api_key_id?: string | null
          catalog_id?: string | null
          consumer_workspace_id: string
          content_url?: string | null
          created_at?: string | null
          description?: string | null
          external_ref?: string | null
          grant_id?: string | null
          id?: string
          publisher_workspace_id?: string | null
          type: string
          bot_subscription_id?: string | null
        }
        Update: {
          bot_id?: string | null
          amount_eur?: number
          api_key_id?: string | null
          catalog_id?: string | null
          consumer_workspace_id?: string
          content_url?: string | null
          created_at?: string | null
          description?: string | null
          external_ref?: string | null
          grant_id?: string | null
          id?: string
          publisher_workspace_id?: string | null
          type?: string
          bot_subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_transactions_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "credit_transactions_bot_subscription_id_fkey"
            columns: ["bot_subscription_id"]
            isOneToOne: false
            referencedRelation: "bot_subscriptions"
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
          sitemap_url: string | null
          status: string
          verified_at: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          domain: string
          id?: string
          last_event_at?: string | null
          sitemap_url?: string | null
          status?: string
          verified_at?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          domain?: string
          id?: string
          last_event_at?: string | null
          sitemap_url?: string | null
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
      bots: {
        Row: {
          id: string
          name: string
          ua_pattern: string
          declared_ips: string[]
          description: string | null
          type: 'preset' | 'custom'
          created_at: string | null
        }
        Insert: {
          id?: string
          name: string
          ua_pattern: string
          declared_ips?: string[]
          description?: string | null
          type?: 'preset' | 'custom'
          created_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          ua_pattern?: string
          declared_ips?: string[]
          description?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          id: string
          workspace_id: string
          bot_id: string
          bot_subscription_id: string
          api_key_hash: string
          api_key_prefix: string
          label: string | null
          revoked_at: string | null
          last_used_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          workspace_id: string
          bot_id: string
          bot_subscription_id: string
          api_key_hash: string
          api_key_prefix: string
          label?: string | null
          revoked_at?: string | null
          last_used_at?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          workspace_id?: string
          bot_id?: string
          bot_subscription_id?: string
          api_key_hash?: string
          api_key_prefix?: string
          label?: string | null
          revoked_at?: string | null
          last_used_at?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_bot_subscription_id_fkey"
            columns: ["bot_subscription_id"]
            isOneToOne: false
            referencedRelation: "bot_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_subscriptions: {
        Row: {
          id: string
          workspace_id: string
          bot_id: string
          external_user_id: string | null
          label: string | null
          balance_eur: number
          scope_to_workspace: boolean
          created_at: string | null
          archived_at: string | null
        }
        Insert: {
          id?: string
          workspace_id: string
          bot_id: string
          external_user_id?: string | null
          label?: string | null
          balance_eur?: number
          scope_to_workspace?: boolean
          created_at?: string | null
          archived_at?: string | null
        }
        Update: {
          id?: string
          workspace_id?: string
          bot_id?: string
          external_user_id?: string | null
          label?: string | null
          balance_eur?: number
          scope_to_workspace?: boolean
          created_at?: string | null
          archived_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bot_subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bot_subscriptions_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bot_subscriptions_workspace_bot_fkey"
            columns: ["workspace_id", "bot_id"]
            isOneToOne: false
            referencedRelation: "workspace_bots"
            referencedColumns: ["workspace_id", "bot_id"]
          },
        ]
      }
      workspace_bots: {
        Row: {
          workspace_id: string
          bot_id: string
        }
        Insert: {
          workspace_id: string
          bot_id: string
        }
        Update: {
          workspace_id?: string
          bot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_bots_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_bots_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
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
      rag_query_logs: {
        Row: {
          id: string
          consumer_workspace_id: string
          query_text: string
          search_config_id: string | null
          total_cost_eur: number
          results: Json | null
          created_at: string | null
        }
        Insert: {
          id?: string
          consumer_workspace_id: string
          query_text: string
          search_config_id?: string | null
          total_cost_eur?: number
          results?: Json | null
          created_at?: string | null
        }
        Update: {
          id?: string
          consumer_workspace_id?: string
          query_text?: string
          search_config_id?: string | null
          total_cost_eur?: number
          results?: Json | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rag_query_logs_consumer_workspace_id_fkey"
            columns: ["consumer_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rag_query_logs_search_config_id_fkey"
            columns: ["search_config_id"]
            isOneToOne: false
            referencedRelation: "search_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      search_configs: {
        Row: {
          id: string
          workspace_id: string
          name: string
          path_filters: Json
          max_price_eur: number | null
          total_budget_eur: number | null
          max_results: number
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          workspace_id: string
          name: string
          path_filters?: Json
          max_price_eur?: number | null
          total_budget_eur?: number | null
          max_results?: number
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          workspace_id?: string
          name?: string
          path_filters?: Json
          max_price_eur?: number | null
          total_budget_eur?: number | null
          max_results?: number
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "search_configs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      search_config_catalogs: {
        Row: {
          search_config_id: string
          catalog_id: string
        }
        Insert: {
          search_config_id: string
          catalog_id: string
        }
        Update: {
          search_config_id?: string
          catalog_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_config_catalogs_search_config_id_fkey"
            columns: ["search_config_id"]
            isOneToOne: false
            referencedRelation: "search_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_config_catalogs_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          api_key_hash: string | null
          api_key_prefix: string | null
          created_at: string | null
          id: string
          jwt_signing_secret: string
          max_pages: number
          name: string
          updated_at: string | null
        }
        Insert: {
          api_key_hash?: string | null
          api_key_prefix?: string | null
          created_at?: string | null
          id?: string
          jwt_signing_secret?: string
          max_pages?: number
          name: string
          updated_at?: string | null
        }
        Update: {
          api_key_hash?: string | null
          api_key_prefix?: string | null
          created_at?: string | null
          id?: string
          jwt_signing_secret?: string
          max_pages?: number
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
          domain_id: string
          content_count: number
        }[]
      }
      authorize_and_debit_batch: {
        Args: {
          p_api_key_id: string
          p_debits: Json
        }
        Returns: Json
      }
      credit_bot_subscription: {
        Args: {
          p_api_key_id: string
          p_amount_eur: number
          p_external_ref?: string | null
          p_description?: string | null
        }
        Returns: Json
      }
      vector_search: {
        Args: {
          p_query_embedding: string
          p_catalog_ids: string[]
          p_limit?: number
        }
        Returns: {
          chunk_id: string
          indexed_source_id: string
          source_url: string
          chunk_text: string
          heading_context: string
          token_count: number
          distance: number
          price_eur: number
          catalog_id: string
          catalog_name: string
          publisher_workspace_id: string
        }[]
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
