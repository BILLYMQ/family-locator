import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { FamilyMember, FamilyBond, Profile } from '@/types/database';

// Type local pour la query JOIN avec profils imbriqués
type BondWithProfiles = {
  id: string;
  parent_id: string;
  child_id: string;
  status: FamilyBond['status'];
  parent: Pick<Profile, 'id' | 'full_name' | 'email' | 'phone' | 'avatar_url'> | null;
  child:  Pick<Profile, 'id' | 'full_name' | 'email' | 'phone' | 'avatar_url'> | null;
};

export function useFamily(currentUserId: string | undefined) {
  const [members, setMembers]           = useState<FamilyMember[]>([]);
  const [pendingIncoming, setPending]   = useState<FamilyBond[]>([]);
  const [loading, setLoading]           = useState(true);

  const fetchFamily = useCallback(async () => {
    if (!currentUserId) return;
    setLoading(true);

    // Membres acceptés (bidirectionnel) — cast explicite car Supabase TS ne résout
    // pas les alias de jointure !fkey dans le select générique
    const { data: rawBonds } = await supabase
      .from('family_bonds')
      .select(`
        id,
        parent_id,
        child_id,
        status,
        parent:profiles!family_bonds_parent_id_fkey(id, full_name, email, phone, avatar_url),
        child:profiles!family_bonds_child_id_fkey(id, full_name, email, phone, avatar_url)
      `)
      .or(`parent_id.eq.${currentUserId},child_id.eq.${currentUserId}`)
      .eq('status', 'accepted');

    const bonds: BondWithProfiles[] = (rawBonds as BondWithProfiles[] | null) ?? [];

    const memberList: FamilyMember[] = bonds.map(bond => {
      const isParent = bond.parent_id === currentUserId;
      const profile  = isParent ? bond.child : bond.parent;
      return {
        ...(profile as Profile),
        bond_id:    bond.id,
        bond_status: bond.status,
      };
    });
    setMembers(memberList);

    // Invitations reçues en attente (currentUser est child_id)
    const { data: incoming } = await supabase
      .from('family_bonds')
      .select('*')
      .eq('child_id', currentUserId)
      .eq('status', 'pending');
    setPending(incoming ?? []);

    setLoading(false);
  }, [currentUserId]);

  // Fetch initial et à chaque changement de fetchFamily
  useEffect(() => {
    fetchFamily();
  }, [fetchFamily]);

  // Souscription realtime — dépend uniquement de currentUserId pour éviter
  // de rappeler .on() sur un channel déjà souscrit (erreur Supabase JS)
  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel(`family_bonds_${currentUserId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'family_bonds' },
        () => fetchFamily()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function sendInvitation(targetEmail: string) {
    if (!currentUserId) return { error: new Error('Non connecté') };

    // Trouver le profil cible par email
    const { data: target, error: findError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', targetEmail.trim().toLowerCase())
      .single();

    if (findError || !target) {
      return { error: new Error('Aucun utilisateur trouvé avec cet email.') };
    }
    if (target.id === currentUserId) {
      return { error: new Error('Vous ne pouvez pas vous inviter vous-même.') };
    }

    const { error } = await supabase.from('family_bonds').insert({
      parent_id: currentUserId,
      child_id: target.id,
      status: 'pending',
    });
    return { error };
  }

  async function sendInvitationByPhone(phone: string) {
    if (!currentUserId) return { error: new Error('Non connecté') };

    const { data: target, error: findError } = await supabase
      .from('profiles')
      .select('id')
      .eq('phone', phone.trim())
      .single();

    if (findError || !target) {
      return { error: new Error('Aucun utilisateur trouvé avec ce numéro.') };
    }

    const { error } = await supabase.from('family_bonds').insert({
      parent_id: currentUserId,
      child_id: target.id,
      status: 'pending',
    });
    return { error };
  }

  async function respondToInvitation(bondId: string, accept: boolean) {
    const { error } = await supabase
      .from('family_bonds')
      .update({ status: accept ? 'accepted' : 'rejected' })
      .eq('id', bondId);
    return { error };
  }

  async function removeMember(bondId: string) {
    const { error } = await supabase
      .from('family_bonds')
      .delete()
      .eq('id', bondId);
    return { error };
  }

  return {
    members,
    pendingIncoming,
    loading,
    refresh: fetchFamily,
    sendInvitation,
    sendInvitationByPhone,
    respondToInvitation,
    removeMember,
  };
}
