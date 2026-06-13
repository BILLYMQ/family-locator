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
          created_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          phone?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          phone?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
        };
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
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      bond_status: 'pending' | 'accepted' | 'rejected';
    };
  };
}

// Helpers de types pour l'utilisation dans l'app
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Location = Database['public']['Tables']['locations']['Row'];
export type FamilyBond = Database['public']['Tables']['family_bonds']['Row'];

export interface FamilyMember extends Profile {
  bond_id: string;
  bond_status: FamilyBond['status'];
  location?: Location;
}
