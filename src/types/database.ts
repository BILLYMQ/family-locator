export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          phone: string | null;
          full_name: string | null;
          avatar_url: string | null;
          push_token: string | null;
          sos_sent_at: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          phone?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          push_token?: string | null;
          sos_sent_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          phone?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          push_token?: string | null;
          sos_sent_at?: string | null;
        };
        Relationships: [];
      };
      locations: {
        Row: {
          user_id: string;
          latitude: number;
          longitude: number;
          accuracy: number | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          latitude: number;
          longitude: number;
          accuracy?: number | null;
          updated_at?: string;
        };
        Update: {
          latitude?: number;
          longitude?: number;
          accuracy?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'locations_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          }
        ];
      };
      family_bonds: {
        Row: {
          id: string;
          parent_id: string;
          child_id: string;
          status: 'pending' | 'accepted' | 'rejected';
          created_at: string;
        };
        Insert: {
          id?: string;
          parent_id: string;
          child_id: string;
          status?: 'pending' | 'accepted' | 'rejected';
          created_at?: string;
        };
        Update: {
          status?: 'pending' | 'accepted' | 'rejected';
        };
        Relationships: [
          {
            foreignKeyName: 'family_bonds_parent_id_fkey';
            columns: ['parent_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'family_bonds_child_id_fkey';
            columns: ['child_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      search_profile_by_email: {
        Args: { p_email: string };
        Returns: Array<{ id: string; full_name: string | null }>;
      };
      search_profile_by_phone: {
        Args: { p_phone: string };
        Returns: Array<{ id: string; full_name: string | null }>;
      };
      trigger_sos: {
        Args: { p_user_id: string };
        Returns: Array<{ member_id: string; push_token: string | null; full_name: string | null }>;
      };
    };
    Enums: {
      bond_status: 'pending' | 'accepted' | 'rejected';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

// Helpers de types pour l'utilisation dans l'app
export type Profile    = Database['public']['Tables']['profiles']['Row'];
export type Location   = Database['public']['Tables']['locations']['Row'];
export type FamilyBond = Database['public']['Tables']['family_bonds']['Row'];

export interface FamilyMember extends Profile {
  bond_id: string;
  bond_status: FamilyBond['status'];
  location?: Location;
}
