export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      cards: {
        Row: {
          cells: Json;
          created_at: string;
          id: string;
          room_id: string;
          user_id: string;
        };
        Insert: {
          cells: Json;
          created_at?: string;
          id?: string;
          room_id: string;
          user_id: string;
        };
        Update: {
          cells?: Json;
          created_at?: string;
          id?: string;
          room_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cards_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
        ];
      };
      matches: {
        Row: {
          competition: string;
          created_at: string;
          id: string;
          score_a: number;
          score_b: number;
          starts_at: string;
          status: Database["public"]["Enums"]["match_status"];
          team_a: string;
          team_a_code: string;
          team_b: string;
          team_b_code: string;
        };
        Insert: {
          competition?: string;
          created_at?: string;
          id?: string;
          score_a?: number;
          score_b?: number;
          starts_at: string;
          status?: Database["public"]["Enums"]["match_status"];
          team_a: string;
          team_a_code?: string;
          team_b: string;
          team_b_code?: string;
        };
        Update: {
          competition?: string;
          created_at?: string;
          id?: string;
          score_a?: number;
          score_b?: number;
          starts_at?: string;
          status?: Database["public"]["Enums"]["match_status"];
          team_a?: string;
          team_a_code?: string;
          team_b?: string;
          team_b_code?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string;
          id: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name: string;
          id: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string;
          id?: string;
        };
        Relationships: [];
      };
      room_participants: {
        Row: {
          bingos: number;
          display_name: string;
          id: string;
          joined_at: string;
          marks_count: number;
          room_id: string;
          score: number;
          user_id: string;
          swaps_count: number;
        };
        Insert: {
          bingos?: number;
          display_name: string;
          id?: string;
          joined_at?: string;
          marks_count?: number;
          room_id: string;
          score?: number;
          user_id: string;
          swaps_count?: number;
        };
        Update: {
          bingos?: number;
          display_name?: string;
          id?: string;
          joined_at?: string;
          marks_count?: number;
          room_id?: string;
          score?: number;
          user_id?: string;
          swaps_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "room_participants_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
        ];
      };
      transactions: {
        Row: {
          amount: string;
          created_at: string;
          expires_at: string | null;
          external_id: string | null;
          gateway: string;
          id: string;
          paid_at: string | null;
          pixup_charge_id: string | null;
          qr_code: string | null;
          status: string;
          updated_at: string;
          user_id: string;
          metadata: Json | null;
        };
        Insert: {
          amount: string | number;
          created_at?: string;
          expires_at?: string | null;
          external_id?: string | null;
          gateway?: string;
          id?: string;
          paid_at?: string | null;
          pixup_charge_id?: string | null;
          qr_code?: string | null;
          status?: string;
          updated_at?: string;
          user_id: string;
          metadata?: Json | null;
        };
        Update: {
          amount?: string | number;
          created_at?: string;
          expires_at?: string | null;
          external_id?: string | null;
          gateway?: string;
          id?: string;
          paid_at?: string | null;
          pixup_charge_id?: string | null;
          qr_code?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string;
          metadata?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_audit_logs: {
        Row: {
          created_at: string;
          event: string;
          id: string;
          payload: Json;
          transaction_id: string;
          webhook_event_id: string | null;
        };
        Insert: {
          created_at?: string;
          event: string;
          id?: string;
          payload: Json;
          transaction_id: string;
          webhook_event_id?: string | null;
        };
        Update: {
          created_at?: string;
          event?: string;
          id?: string;
          payload?: Json;
          transaction_id?: string;
          webhook_event_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "payment_audit_logs_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
        ];
      };
      pixup_tokens: {
        Row: {
          access_token: string;
          created_at: string;
          expires_at: string;
          id: string;
          refresh_token: string | null;
          scope: string | null;
          updated_at: string;
        };
        Insert: {
          access_token: string;
          created_at?: string;
          expires_at: string;
          id?: string;
          refresh_token?: string | null;
          scope?: string | null;
          updated_at?: string;
        };
        Update: {
          access_token?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          refresh_token?: string | null;
          scope?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      rooms: {
        Row: {
          code: string;
          created_at: string;
          creator_id: string;
          finished_at: string | null;
          id: string;
          match_id: string;
          name: string;
          status: Database["public"]["Enums"]["room_status"];
          theme: Database["public"]["Enums"]["card_theme"];
        };
        Insert: {
          code: string;
          created_at?: string;
          creator_id: string;
          finished_at?: string | null;
          id?: string;
          match_id: string;
          name: string;
          status?: Database["public"]["Enums"]["room_status"];
          theme?: Database["public"]["Enums"]["card_theme"];
        };
        Update: {
          code?: string;
          created_at?: string;
          creator_id?: string;
          finished_at?: string | null;
          id?: string;
          match_id?: string;
          name?: string;
          status?: Database["public"]["Enums"]["room_status"];
          theme?: Database["public"]["Enums"]["card_theme"];
        };
        Relationships: [
          {
            foreignKeyName: "rooms_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
        ];
      };
      subscriptions: {
        Row: {
          active: boolean;
          created_at: string;
          expires_at: string | null;
          id: string;
          user_id: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          user_id: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "admin" | "user";
      card_theme: "classic" | "churrasco" | "familia";
      match_status: "scheduled" | "live" | "finished";
      room_status: "waiting" | "in_progress" | "finished";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      card_theme: ["classic", "churrasco", "familia"],
      match_status: ["scheduled", "live", "finished"],
      room_status: ["waiting", "in_progress", "finished"],
    },
  },
} as const;
