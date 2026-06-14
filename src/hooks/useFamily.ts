import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { FamilyMember, FamilyBond, Profile } from '@/types/database';

// ── Types locaux ───────────────────────────────────────────────────────────────

type BondWithProfiles = {
  id: string;
  parent_id: string;
  child_id: string;
  status: FamilyBond['status'];
  created_at: string;
  parent: Pick<Profile, 'id' | 'full_name' | 'email' | 'phone' | 'avatar_url'> | null;
  child:  Pick<Profile, 'id' | 'full_name' | 'email' | 'phone' | 'avatar_url'> | null;
};

// Bond en attente enrichi avec les infos de l'autre utilisateur
// (peut être null si la RLS bloque la lecture du profil sur un bond non accepté).
// Étend FamilyBond pour rester rétrocompatible avec FamilyScreen.tsx natif.
export type PendingBond = FamilyBond & {
  other_user?: { id: string; full_name: string | null; email: string | null } | null;
};

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useFamily(currentUserId: string | undefined) {
  const [members,         setMembers]    = useState<FamilyMember[]>([]);
  const [pendingIncoming, setPendingIn]  = useState<PendingBond[]>([]);
  const [pendingOutgoing, setPendingOut] = useState<PendingBond[]>([]);
  const [loading,         setLoading]    = useState(true);

  const fetchFamily = useCallback(async () => {
    if (!currentUserId) { setLoading(false); return; }
    setLoading(true);

    // ── 1. Membres acceptés (JOIN double pour les profils) ──────────────────
    const { data: rawBonds } = await supabase
      .from('family_bonds')
      .select(`
        id, parent_id, child_id, status, created_at,
        parent:profiles!family_bonds_parent_id_fkey(id, full_name, email, phone, avatar_url),
        child:profiles!family_bonds_child_id_fkey(id, full_name, email, phone, avatar_url)
      `)
      .or(`parent_id.eq.${currentUserId},child_id.eq.${currentUserId}`)
      .eq('status', 'accepted');

    const bonds: BondWithProfiles[] = (rawBonds as BondWithProfiles[] | null) ?? [];
    setMembers(bonds.map(bond => {
      const isParent = bond.parent_id === currentUserId;
      const profile  = isParent ? bond.child : bond.parent;
      return { ...(profile as Profile), bond_id: bond.id, bond_status: bond.status };
    }));

    // ── 2. Invitations reçues (child = moi, status = pending) ───────────────
    // Le JOIN avec le profil de l'expéditeur peut être null si la RLS le bloque
    // (bond non encore accepté) — géré gracieusement dans l'UI.
    const { data: rawIncoming } = await supabase
      .from('family_bonds')
      .select(`
        id, parent_id, child_id, status, created_at,
        inviter:profiles!family_bonds_parent_id_fkey(id, full_name, email)
      `)
      .eq('child_id', currentUserId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    setPendingIn(
      ((rawIncoming ?? []) as any[]).map(b => ({
        id:         b.id,
        parent_id:  b.parent_id,
        child_id:   b.child_id,
        status:     b.status,
        created_at: b.created_at,
        other_user: b.inviter
          ? { id: b.inviter.id, full_name: b.inviter.full_name ?? null, email: b.inviter.email ?? null }
          : null,
      } as PendingBond))
    );

    // ── 3. Invitations envoyées (parent = moi, status = pending) ────────────
    // Idem — le profil destinataire peut être null selon la RLS.
    const { data: rawOutgoing } = await supabase
      .from('family_bonds')
      .select(`
        id, parent_id, child_id, status, created_at,
        recipient:profiles!family_bonds_child_id_fkey(id, full_name, email)
      `)
      .eq('parent_id', currentUserId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    setPendingOut(
      ((rawOutgoing ?? []) as any[]).map(b => ({
        id:         b.id,
        parent_id:  b.parent_id,
        child_id:   b.child_id,
        status:     b.status,
        created_at: b.created_at,
        other_user: b.recipient
          ? { id: b.recipient.id, full_name: b.recipient.full_name ?? null, email: b.recipient.email ?? null }
          : null,
      } as PendingBond))
    );

    setLoading(false);
  }, [currentUserId]);

  // ── Fetch initial ──────────────────────────────────────────────────────────
  useEffect(() => { fetchFamily(); }, [fetchFamily]);

  // Ref stable vers la dernière version de fetchFamily.
  // Permet au callback realtime (créé une seule fois) d'appeler toujours
  // la version à jour sans figurer dans ses dépendances.
  const fetchFamilyRef = useRef(fetchFamily);
  useEffect(() => { fetchFamilyRef.current = fetchFamily; }, [fetchFamily]);

  // ── Souscription Realtime — créée UNE SEULE FOIS ───────────────────────────
  // Raison du [] : avec [currentUserId] ou [fetchFamily], React recrée le canal
  // à chaque changement d'auth. Si removeChannel() n'a pas terminé avant le
  // prochain setup, Supabase lève "cannot add postgres_changes callbacks after
  // subscribe()". Fix : nom unique via Date.now() + fetchFamilyRef pour éviter
  // la closure périmée.
  useEffect(() => {
    let isMounted = true;
    const channel = supabase
      .channel(`family_bonds_${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'family_bonds' }, () => {
        if (isMounted) fetchFamilyRef.current();
      })
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ────────────────────────────────────────────────────────────────

  async function sendInvitation(targetEmail: string) {
    if (!currentUserId) return { error: new Error('Non connecté') };
    const { data: rows, error: findError } = await supabase
      .rpc('search_profile_by_email', { p_email: targetEmail.trim().toLowerCase() });
    if (findError) return { error: new Error('Erreur lors de la recherche. Veuillez réessayer.') };
    const target = rows?.[0] ?? null;
    if (!target) {
      return { error: new Error(
        `Cette personne n'a pas encore de compte FamilyLocator. ` +
        `Demandez-lui de créer un compte avec cet email, puis réessayez.`
      )};
    }
    if (target.id === currentUserId) return { error: new Error('Vous ne pouvez pas vous inviter vous-même.') };
    return _upsertBond(currentUserId, target.id);
  }

  async function sendInvitationByPhone(phone: string) {
    if (!currentUserId) return { error: new Error('Non connecté') };
    const cleaned = phone.replace(/[\s\(\)\-\.]/g, '');
    if (!cleaned || cleaned.replace(/\D/g, '').length < 8) {
      return { error: new Error('Numéro de téléphone invalide.') };
    }
    const { data: rows, error: findError } = await supabase
      .rpc('search_profile_by_phone', { p_phone: cleaned });
    if (findError) return { error: new Error('Erreur lors de la recherche. Veuillez réessayer.') };
    const target = rows?.[0] ?? null;
    if (!target) {
      return { error: new Error(
        `Cette personne n'a pas encore de compte FamilyLocator. ` +
        `Demandez-lui de créer un compte avec ce numéro de téléphone, puis réessayez.`
      )};
    }
    if (target.id === currentUserId) {
      return { error: new Error('Vous ne pouvez pas vous inviter vous-même.') };
    }
    return _upsertBond(currentUserId, target.id);
  }

  // Insère un bond ou réactive un bond précédemment rejeté
  async function _upsertBond(parentId: string, childId: string) {
    const { data: existing } = await supabase
      .from('family_bonds')
      .select('id, status')
      .or(`and(parent_id.eq.${parentId},child_id.eq.${childId}),and(parent_id.eq.${childId},child_id.eq.${parentId})`)
      .maybeSingle();

    if (existing) {
      if (existing.status === 'accepted') {
        return { error: new Error('Cette personne est déjà membre de votre famille.') };
      }
      if (existing.status === 'pending') {
        return { error: new Error('Une invitation est déjà en attente pour cette personne.') };
      }
      // Statut 'rejected' — réactiver en tant que 'pending'
      const { error } = await supabase
        .from('family_bonds').update({ status: 'pending' }).eq('id', existing.id);
      return { error };
    }

    const { error } = await supabase.from('family_bonds').insert({
      parent_id: parentId,
      child_id:  childId,
      status:    'pending',
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

  // Annule une invitation envoyée (supprime le bond)
  async function cancelInvitation(bondId: string) {
    const { error } = await supabase.from('family_bonds').delete().eq('id', bondId);
    return { error };
  }

  async function removeMember(bondId: string) {
    const { error } = await supabase.from('family_bonds').delete().eq('id', bondId);
    return { error };
  }

  return {
    members,
    pendingIncoming,
    pendingOutgoing,
    loading,
    refresh: fetchFamily,
    sendInvitation,
    sendInvitationByPhone,
    respondToInvitation,
    cancelInvitation,
    removeMember,
  };
}
