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
          api_key_id: string
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
          api_key_id: string
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
          api_key_id?: string
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
            foreignKeyName: "access_grants_agent_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_grants_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
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
      access_settings: {
        Row: {
          bot_id: string
          created_at: string
          id: string
          max_price_eur: number | null
          name: string
          public_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          bot_id: string
          created_at?: string
          id?: string
          max_price_eur?: number | null
          name: string
          public_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          bot_id?: string
          created_at?: string
          id?: string
          max_price_eur?: number | null
          name?: string
          public_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_settings_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      access_settings_catalogs: {
        Row: {
          access_settings_id: string
          added_at: string
          catalog_id: string
        }
        Insert: {
          access_settings_id: string
          added_at?: string
          catalog_id: string
        }
        Update: {
          access_settings_id?: string
          added_at?: string
          catalog_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_settings_catalogs_access_settings_id_fkey"
            columns: ["access_settings_id"]
            isOneToOne: false
            referencedRelation: "access_settings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_settings_catalogs_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          access_settings_id: string
          api_key_hash: string
          api_key_prefix: string
          bot_id: string
          created_at: string | null
          id: string
          label: string | null
          last_used_at: string | null
          public_id: string
          revoked_at: string | null
          subscription_id: string
          workspace_id: string
        }
        Insert: {
          access_settings_id: string
          api_key_hash: string
          api_key_prefix: string
          bot_id: string
          created_at?: string | null
          id?: string
          label?: string | null
          last_used_at?: string | null
          public_id: string
          revoked_at?: string | null
          subscription_id: string
          workspace_id: string
        }
        Update: {
          access_settings_id?: string
          api_key_hash?: string
          api_key_prefix?: string
          bot_id?: string
          created_at?: string | null
          id?: string
          label?: string | null
          last_used_at?: string | null
          public_id?: string
          revoked_at?: string | null
          subscription_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_access_settings_id_fkey"
            columns: ["access_settings_id"]
            isOneToOne: false
            referencedRelation: "access_settings"
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
            foreignKeyName: "api_keys_wallet_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      bots: {
        Row: {
          created_at: string | null
          declared_ips: string[]
          description: string | null
          id: string
          name: string
          public_id: string
          type: string
          ua_pattern: string
        }
        Insert: {
          created_at?: string | null
          declared_ips?: string[]
          description?: string | null
          id?: string
          name: string
          public_id: string
          type?: string
          ua_pattern: string
        }
        Update: {
          created_at?: string | null
          declared_ips?: string[]
          description?: string | null
          id?: string
          name?: string
          public_id?: string
          type?: string
          ua_pattern?: string
        }
        Relationships: []
      }
      catalog_bots: {
        Row: {
          bot_id: string
          catalog_id: string
        }
        Insert: {
          bot_id: string
          catalog_id: string
        }
        Update: {
          bot_id?: string
          catalog_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_agents_agent_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_agents_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
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
            foreignKeyName: "catalog_sources_source_id_fkey"
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
          public_id: string
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
          public_id: string
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
          public_id?: string
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
      credit_transactions: {
        Row: {
          amount_eur: number
          api_key_id: string | null
          bot_id: string | null
          catalog_id: string | null
          consumer_workspace_id: string
          content_url: string | null
          created_at: string | null
          description: string | null
          external_ref: string | null
          grant_id: string | null
          id: string
          publisher_workspace_id: string | null
          recipient_workspace_id: string | null
          role: Database["public"]["Enums"]["credit_transaction_role"]
          subscription_id: string | null
        }
        Insert: {
          amount_eur: number
          api_key_id?: string | null
          bot_id?: string | null
          catalog_id?: string | null
          consumer_workspace_id: string
          content_url?: string | null
          created_at?: string | null
          description?: string | null
          external_ref?: string | null
          grant_id?: string | null
          id?: string
          publisher_workspace_id?: string | null
          recipient_workspace_id?: string | null
          role: Database["public"]["Enums"]["credit_transaction_role"]
          subscription_id?: string | null
        }
        Update: {
          amount_eur?: number
          api_key_id?: string | null
          bot_id?: string | null
          catalog_id?: string | null
          consumer_workspace_id?: string
          content_url?: string | null
          created_at?: string | null
          description?: string | null
          external_ref?: string | null
          grant_id?: string | null
          id?: string
          publisher_workspace_id?: string | null
          recipient_workspace_id?: string | null
          role?: Database["public"]["Enums"]["credit_transaction_role"]
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_agent_id_fkey"
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
            foreignKeyName: "credit_transactions_recipient_workspace_id_fkey"
            columns: ["recipient_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_transactions_wallet_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
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
          public_id: string
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
          public_id: string
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
          public_id?: string
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
      gateways: {
        Row: {
          api_key_hash: string
          api_key_prefix: string
          catalog_ids: string[]
          created_at: string
          id: string
          label: string | null
          public_id: string
          workspace_id: string
        }
        Insert: {
          api_key_hash: string
          api_key_prefix: string
          catalog_ids?: string[]
          created_at?: string
          id?: string
          label?: string | null
          public_id: string
          workspace_id: string
        }
        Update: {
          api_key_hash?: string
          api_key_prefix?: string
          catalog_ids?: string[]
          created_at?: string
          id?: string
          label?: string | null
          public_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gateways_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      indexed_sources: {
        Row: {
          created_at: string | null
          domain_id: string
          id: string
          lastmod: string | null
          path: string | null
          source_url: string
          title: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          domain_id: string
          id?: string
          lastmod?: string | null
          path?: string | null
          source_url: string
          title?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          domain_id?: string
          id?: string
          lastmod?: string | null
          path?: string | null
          source_url?: string
          title?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sources_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sources_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      indexing_jobs: {
        Row: {
          created_at: string | null
          domain_id: string | null
          error_message: string | null
          id: string
          max_pages: number | null
          path_rules: Json | null
          result: Json | null
          sitemap_url: string
          status: string
          updated_at: string | null
          urls_to_index: string[]
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          domain_id?: string | null
          error_message?: string | null
          id?: string
          max_pages?: number | null
          path_rules?: Json | null
          result?: Json | null
          sitemap_url: string
          status?: string
          updated_at?: string | null
          urls_to_index?: string[]
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          domain_id?: string | null
          error_message?: string | null
          id?: string
          max_pages?: number | null
          path_rules?: Json | null
          result?: Json | null
          sitemap_url?: string
          status?: string
          updated_at?: string | null
          urls_to_index?: string[]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_jobs_workspace_id_fkey"
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
      billing_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          id: string
          monthly_credit_amount_eur: number
          status: string
          stripe_price_id: string
          stripe_subscription_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          id?: string
          monthly_credit_amount_eur: number
          status: string
          stripe_price_id: string
          stripe_subscription_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          id?: string
          monthly_credit_amount_eur?: number
          status?: string
          stripe_price_id?: string
          stripe_subscription_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          archived_at: string | null
          created_at: string | null
          external_user_id: string | null
          id: string
          label: string | null
          monthly_cap_eur: number | null
          public_id: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string | null
          external_user_id?: string | null
          id?: string
          label?: string | null
          monthly_cap_eur?: number | null
          public_id: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string | null
          external_user_id?: string | null
          id?: string
          label?: string | null
          monthly_cap_eur?: number | null
          public_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_bots: {
        Row: {
          bot_id: string
          workspace_id: string
        }
        Insert: {
          bot_id: string
          workspace_id: string
        }
        Update: {
          bot_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_agents_agent_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_agents_workspace_id_fkey"
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
          balance_eur: number
          created_at: string | null
          id: string
          is_publisher: boolean
          jwt_signing_secret: string
          max_pages: number
          name: string
          public_id: string
          referral_workspace_id: string | null
          stripe_customer_id: string | null
          updated_at: string | null
        }
        Insert: {
          balance_eur?: number
          created_at?: string | null
          id?: string
          is_publisher?: boolean
          jwt_signing_secret?: string
          max_pages?: number
          name: string
          public_id: string
          referral_workspace_id?: string | null
          stripe_customer_id?: string | null
          updated_at?: string | null
        }
        Update: {
          balance_eur?: number
          created_at?: string | null
          id?: string
          is_publisher?: boolean
          jwt_signing_secret?: string
          max_pages?: number
          name?: string
          public_id?: string
          referral_workspace_id?: string | null
          stripe_customer_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_referral_workspace_id_fkey"
            columns: ["referral_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      authorize_and_debit_batch: {
        Args: { p_api_key_id: string; p_debits: Json }
        Returns: Json
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
      credit_workspace: {
        Args: {
          p_workspace_id: string
          p_amount_eur: number
          p_external_ref?: string | null
          p_description?: string | null
          p_subscription_id?: string | null
        }
        Returns: Json
      }
      get_domain_content_counts: {
        Args: { p_workspace_id: string }
        Returns: {
          content_count: number
          domain_id: string
        }[]
      }
    }
    Enums: {
      credit_transaction_role:
        | "debit"
        | "content_owner"
        | "sub_manager"
        | "platform_fee"
        | "credit"
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
      credit_transaction_role: [
        "debit",
        "content_owner",
        "sub_manager",
        "platform_fee",
        "credit",
      ],
    },
  },
} as const
