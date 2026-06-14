import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  FlatList, ActivityIndicator, ScrollView,
} from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { useFamily, PendingBond } from '@/hooks/useFamily';
import { FamilyMember } from '@/types/database';

export default function FamilyScreen() {
  const { user } = useAuth();
  const {
    members, pendingIncoming, pendingOutgoing, loading,
    sendInvitation, sendInvitationByPhone,
    respondToInvitation, cancelInvitation, removeMember,
  } = useFamily(user?.id);

  // ── État modal ──────────────────────────────────────────────────────────────
  const [showModal,   setShowModal]   = useState(false);
  const [inviteType,  setInviteType]  = useState<'email' | 'phone'>('phone');
  const [inviteValue, setInviteValue] = useState('');
  const [sending,     setSending]     = useState(false);
  const [modalError,  setModalError]  = useState<string | null>(null);
  const [modalSuccess,setModalSuccess]= useState<string | null>(null);

  // ── Toast global ────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  function showToast(ok: boolean, text: string) {
    setToast({ ok, text });
    setTimeout(() => setToast(null), 4000);
  }

  function closeModal() {
    setShowModal(false);
    setInviteValue('');
    setModalError(null);
    setModalSuccess(null);
  }

  // ── Envoi d'invitation ──────────────────────────────────────────────────────
  async function handleSendInvite() {
    const val = inviteValue.trim();
    if (!val) {
      setModalError(`Veuillez saisir un ${inviteType === 'email' ? 'courriel' : 'numéro de téléphone'}.`);
      return;
    }
    if (inviteType === 'phone') {
      const digits = val.replace(/\D/g, '');
      if (digits.length < 8) {
        setModalError('Numéro trop court (ex : +1 418 000 0000).');
        return;
      }
    }

    setModalError(null);
    setModalSuccess(null);
    setSending(true);
    try {
      const { error } = inviteType === 'email'
        ? await sendInvitation(val)
        : await sendInvitationByPhone(val);

      if (error) {
        setModalError(error.message);
      } else {
        setModalSuccess('✓ Invitation envoyée !');
        setTimeout(() => {
          closeModal();
          showToast(true, 'Invitation envoyée. En attente de confirmation.');
        }, 1200);
      }
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Erreur inattendue.');
    } finally {
      setSending(false);
    }
  }

  // ── Répondre à une invitation reçue ────────────────────────────────────────
  async function handleRespond(bond: PendingBond, accept: boolean) {
    try {
      const { error } = await respondToInvitation(bond.id, accept);
      if (error) showToast(false, error.message);
      else showToast(true, accept ? '✓ Invitation acceptée !' : 'Invitation refusée.');
    } catch (err: unknown) {
      showToast(false, err instanceof Error ? err.message : 'Erreur lors de la réponse.');
    }
  }

  // ── Annuler une invitation envoyée ──────────────────────────────────────────
  async function handleCancel(bond: PendingBond) {
    const name = bond.other_user?.full_name ?? bond.other_user?.email ?? 'cette personne';
    if (!window.confirm(`Annuler l'invitation à ${name} ?`)) return;
    try {
      const { error } = await cancelInvitation(bond.id);
      if (error) showToast(false, error.message);
      else showToast(true, 'Invitation annulée.');
    } catch (err: unknown) {
      showToast(false, err instanceof Error ? err.message : 'Erreur.');
    }
  }

  // ── Retirer un membre ───────────────────────────────────────────────────────
  async function handleRemove(member: FamilyMember) {
    const name = member.full_name ?? member.email ?? 'ce membre';
    if (!window.confirm(`Retirer ${name} de votre famille ?`)) return;
    try {
      const { error } = await removeMember(member.bond_id);
      if (error) showToast(false, error.message);
      else showToast(true, `${name} a été retiré.`);
    } catch (err: unknown) {
      showToast(false, err instanceof Error ? err.message : 'Erreur lors du retrait.');
    }
  }

  // ── Formatage date ──────────────────────────────────────────────────────────
  function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  // ── Rendu carte membre ──────────────────────────────────────────────────────
  const renderMember = ({ item }: { item: FamilyMember }) => (
    <View style={{
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: 'white', borderRadius: 16,
      paddingHorizontal: 16, paddingVertical: 12, marginBottom: 10,
      borderWidth: 1, borderColor: '#f3f4f6',
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
    }}>
      <View style={{
        width: 48, height: 48, borderRadius: 24,
        backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center', marginRight: 12,
      }}>
        <Text style={{ color: '#1e40af', fontSize: 18, fontWeight: '700' }}>
          {(item.full_name ?? item.email ?? '?')[0].toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '600', color: '#1f2937', fontSize: 14 }}>{item.full_name ?? '—'}</Text>
        <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>{item.email}</Text>
        {item.phone ? <Text style={{ fontSize: 11, color: '#9ca3af' }}>{item.phone}</Text> : null}
      </View>
      <View style={{ alignItems: 'center', gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#22c55e' }} />
          <Text style={{ fontSize: 10, color: '#16a34a' }}>Accepté</Text>
        </View>
        <TouchableOpacity
          onPress={() => handleRemove(item)}
          style={{ backgroundColor: '#fef2f2', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 }}
        >
          <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '600' }}>Retirer</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ── Rendu invitation reçue ──────────────────────────────────────────────────
  const renderIncoming = ({ item }: { item: PendingBond }) => {
    const name = item.other_user?.full_name ?? item.other_user?.email ?? null;
    return (
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#fffbeb', borderRadius: 16,
        paddingHorizontal: 16, paddingVertical: 12, marginBottom: 10,
        borderWidth: 1, borderColor: '#fde68a',
      }}>
        {/* Avatar */}
        <View style={{
          width: 44, height: 44, borderRadius: 22,
          backgroundColor: '#fef3c7', alignItems: 'center', justifyContent: 'center', marginRight: 12,
        }}>
          <Text style={{ fontSize: 20 }}>📩</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '600', color: '#1f2937', fontSize: 14 }}>
            {name ? name : 'Invitation reçue'}
          </Text>
          <Text style={{ fontSize: 11, color: '#92400e', marginTop: 1 }}>
            {name ? 'souhaite rejoindre votre famille' : `De : ${item.parent_id.slice(0, 8)}…`}
          </Text>
          <Text style={{ fontSize: 10, color: '#b45309', marginTop: 1 }}>
            {formatDate(item.created_at)}
          </Text>
        </View>
        <View style={{ gap: 6 }}>
          <TouchableOpacity
            onPress={() => handleRespond(item, true)}
            style={{ backgroundColor: '#22c55e', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10 }}
          >
            <Text style={{ color: 'white', fontSize: 12, fontWeight: '700' }}>✓ Accepter</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleRespond(item, false)}
            style={{ backgroundColor: '#f3f4f6', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10 }}
          >
            <Text style={{ color: '#6b7280', fontSize: 12, fontWeight: '600' }}>✕ Refuser</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ── Rendu invitation envoyée ────────────────────────────────────────────────
  const renderOutgoing = ({ item }: { item: PendingBond }) => {
    const name = item.other_user?.full_name ?? item.other_user?.email ?? null;
    return (
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#f0f9ff', borderRadius: 16,
        paddingHorizontal: 16, paddingVertical: 12, marginBottom: 10,
        borderWidth: 1, borderColor: '#bae6fd',
      }}>
        {/* Avatar */}
        <View style={{
          width: 44, height: 44, borderRadius: 22,
          backgroundColor: '#e0f2fe', alignItems: 'center', justifyContent: 'center', marginRight: 12,
        }}>
          <Text style={{ fontSize: 20 }}>⏳</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '600', color: '#1f2937', fontSize: 14 }}>
            {name ? name : 'En attente de réponse'}
          </Text>
          <Text style={{ fontSize: 11, color: '#0369a1', marginTop: 1 }}>
            {name ? `n’a pas encore répondu` : `ID : ${item.child_id.slice(0, 8)}…`}
          </Text>
          <Text style={{ fontSize: 10, color: '#0284c7', marginTop: 1 }}>
            Envoyée le {formatDate(item.created_at)}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => handleCancel(item)}
          style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#bae6fd', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 }}
        >
          <Text style={{ color: '#dc2626', fontSize: 12, fontWeight: '600' }}>Annuler</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // ── Rendu principal ─────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>

      {/* Toast global */}
      {toast && (
        <View style={{
          position: 'absolute', top: 12, left: 16, right: 16, zIndex: 2000,
          backgroundColor: toast.ok ? '#dcfce7' : '#fee2e2',
          borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12,
          borderWidth: 1, borderColor: toast.ok ? '#86efac' : '#fca5a5',
          shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 8,
        }}>
          <Text style={{ fontWeight: '600', color: toast.ok ? '#166534' : '#991b1b', fontSize: 14 }}>
            {toast.text}
          </Text>
        </View>
      )}

      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 16 }}>

        {/* En-tête */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <Text style={{ fontSize: 24, fontWeight: '700', color: '#1f2937' }}>Ma Famille</Text>
          <TouchableOpacity
            onPress={() => setShowModal(true)}
            style={{ backgroundColor: '#1e40af', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            <Text style={{ color: 'white', fontWeight: '600', fontSize: 14 }}>+ Inviter</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#1e40af" style={{ marginTop: 40 }} />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>

            {/* ── Invitations reçues ── */}
            {pendingIncoming.length > 0 && (
              <View style={{ marginBottom: 20 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: '#fde68a' }} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#d97706', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    📩 Invitations reçues ({pendingIncoming.length})
                  </Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: '#fde68a' }} />
                </View>
                <FlatList
                  data={pendingIncoming}
                  renderItem={renderIncoming}
                  keyExtractor={item => item.id}
                  scrollEnabled={false}
                />
              </View>
            )}

            {/* ── Invitations envoyées en attente ── */}
            {pendingOutgoing.length > 0 && (
              <View style={{ marginBottom: 20 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: '#bae6fd' }} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#0369a1', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    ⏳ Invitations envoyées ({pendingOutgoing.length})
                  </Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: '#bae6fd' }} />
                </View>
                <FlatList
                  data={pendingOutgoing}
                  renderItem={renderOutgoing}
                  keyExtractor={item => item.id}
                  scrollEnabled={false}
                />
              </View>
            )}

            {/* ── Membres acceptés ── */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: '#e5e7eb' }} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                👨‍👩‍👧 Membres ({members.length})
              </Text>
              <View style={{ flex: 1, height: 1, backgroundColor: '#e5e7eb' }} />
            </View>

            {members.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 }}>
                <Text style={{ fontSize: 52, marginBottom: 16 }}>👨‍👩‍👧‍👦</Text>
                <Text style={{ color: '#374151', fontWeight: '600', fontSize: 16, marginBottom: 8, textAlign: 'center' }}>
                  Aucun membre pour l'instant
                </Text>
                <Text style={{ color: '#6b7280', textAlign: 'center', lineHeight: 22 }}>
                  Invitez un proche par téléphone ou email.{'\n'}
                  Sa position apparaîtra sur la carte dès qu'il accepte.
                </Text>
                <TouchableOpacity
                  onPress={() => setShowModal(true)}
                  style={{ marginTop: 20, backgroundColor: '#1e40af', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14 }}
                >
                  <Text style={{ color: 'white', fontWeight: '700', fontSize: 15 }}>+ Envoyer une invitation</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <FlatList
                data={members}
                renderItem={renderMember}
                keyExtractor={item => item.id}
                scrollEnabled={false}
              />
            )}

          </ScrollView>
        )}
      </View>

      {/* ── Modal d'invitation ── */}
      {showModal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
        >
          <div style={{
            background: 'white',
            borderRadius: '20px 20px 0 0',
            padding: '24px 24px 36px',
            width: '100%', maxWidth: '540px',
            boxShadow: '0 -4px 30px rgba(0,0,0,0.15)',
          }}>
            {/* Titre + fermer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: '#1f2937' }}>Inviter un membre</Text>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#9ca3af', lineHeight: 1 }}>✕</button>
            </div>

            {/* Sélecteur email / téléphone */}
            <View style={{ flexDirection: 'row', backgroundColor: '#f3f4f6', borderRadius: 12, padding: 4, marginBottom: 16 }}>
              {(['phone', 'email'] as const).map(type => (
                <TouchableOpacity
                  key={type}
                  onPress={() => { setInviteType(type); setInviteValue(''); setModalError(null); }}
                  style={{
                    flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center',
                    backgroundColor: inviteType === type ? 'white' : 'transparent',
                    shadowColor: inviteType === type ? '#000' : 'transparent',
                    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2,
                    elevation: inviteType === type ? 2 : 0,
                  }}
                >
                  <Text style={{ fontWeight: inviteType === type ? '700' : '400', color: inviteType === type ? '#1e40af' : '#6b7280', fontSize: 14 }}>
                    {type === 'phone' ? '📱 Par Téléphone' : '✉️ Par Email'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Aide contextuelle */}
            <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
              {inviteType === 'phone'
                ? 'Entrez le numéro avec indicatif pays (ex : +1 418 000 0000). Les espaces sont ignorés.'
                : `Entrez l'adresse email du compte FamilyLocator à inviter.`}
            </Text>

            {/* Champ de saisie */}
            <TextInput
              style={{
                borderWidth: 1.5,
                borderColor: modalError ? '#ef4444' : '#e5e7eb',
                borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13,
                fontSize: 16, marginBottom: 10, backgroundColor: '#f9fafb',
                outlineStyle: 'none',
              } as any}
              placeholder={inviteType === 'phone' ? '+1 418 000 0000' : 'email@exemple.com'}
              value={inviteValue}
              onChangeText={val => { setInviteValue(val); setModalError(null); }}
              keyboardType={inviteType === 'phone' ? 'phone-pad' : 'email-address'}
              autoCapitalize="none"
              autoFocus
            />

            {/* Erreur inline */}
            {modalError && (
              <View style={{ backgroundColor: '#fef2f2', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 10, borderWidth: 1, borderColor: '#fca5a5' }}>
                <Text style={{ color: '#991b1b', fontSize: 13, fontWeight: '600' }}>⚠ {modalError}</Text>
              </View>
            )}

            {/* Succès inline */}
            {modalSuccess && (
              <View style={{ backgroundColor: '#dcfce7', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 10, borderWidth: 1, borderColor: '#86efac' }}>
                <Text style={{ color: '#166534', fontSize: 13, fontWeight: '600' }}>{modalSuccess}</Text>
              </View>
            )}

            {/* Boutons */}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
              <TouchableOpacity
                onPress={closeModal}
                style={{ flex: 1, backgroundColor: '#f3f4f6', paddingVertical: 13, borderRadius: 12, alignItems: 'center' }}
              >
                <Text style={{ color: '#374151', fontWeight: '600', fontSize: 15 }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSendInvite}
                disabled={sending}
                style={{ flex: 2, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: sending ? '#93c5fd' : '#1e40af' }}
              >
                {sending
                  ? <ActivityIndicator color="white" size="small" />
                  : <Text style={{ color: 'white', fontWeight: '700', fontSize: 15 }}>Envoyer l'invitation</Text>
                }
              </TouchableOpacity>
            </View>

            {/* Note sécurité */}
            <View style={{ marginTop: 16, backgroundColor: '#eff6ff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#dbeafe' }}>
              <Text style={{ fontSize: 11, color: '#1d4ed8', lineHeight: 17 }}>
                🔒 La position GPS n'est partagée qu'après acceptation. Le numéro sert uniquement à trouver le profil, jamais affiché à d'autres membres.
              </Text>
            </View>
          </div>
        </div>
      )}
    </View>
  );
}
