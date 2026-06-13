import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  Modal,
  SafeAreaView,
} from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { useFamily } from '@/hooks/useFamily';
import { FamilyMember, FamilyBond } from '@/types/database';

export default function FamilyScreen() {
  const { user } = useAuth();
  const {
    members,
    pendingIncoming,
    loading,
    sendInvitation,
    sendInvitationByPhone,
    respondToInvitation,
    removeMember,
  } = useFamily(user?.id);

  const [showModal, setShowModal]   = useState(false);
  const [inviteType, setInviteType] = useState<'email' | 'phone'>('email');
  const [inviteValue, setInviteValue] = useState('');
  const [sending, setSending]       = useState(false);

  async function handleSendInvite() {
    if (!inviteValue.trim()) return;
    setSending(true);
    const { error } = inviteType === 'email'
      ? await sendInvitation(inviteValue)
      : await sendInvitationByPhone(inviteValue);
    setSending(false);
    if (error) {
      Alert.alert('Erreur', error.message);
    } else {
      setShowModal(false);
      setInviteValue('');
      Alert.alert('Invitation envoyée', 'La personne recevra une notification.');
    }
  }

  async function handleRespond(bond: FamilyBond, accept: boolean) {
    const { error } = await respondToInvitation(bond.id, accept);
    if (error) Alert.alert('Erreur', error.message);
  }

  async function handleRemove(member: FamilyMember) {
    Alert.alert(
      'Retirer ce membre ?',
      `${member.full_name ?? member.email} sera retiré de votre famille.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Retirer',
          style: 'destructive',
          onPress: async () => {
            const { error } = await removeMember(member.bond_id);
            if (error) Alert.alert('Erreur', error.message);
          },
        },
      ]
    );
  }

  const renderMember = ({ item }: { item: FamilyMember }) => (
    <View className="flex-row items-center bg-white rounded-2xl px-4 py-3 mb-3 shadow-sm border border-gray-100">
      <View className="w-12 h-12 rounded-full bg-primary-100 items-center justify-center mr-3">
        <Text className="text-primary-700 text-lg font-bold">
          {(item.full_name ?? item.email ?? '?')[0].toUpperCase()}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="font-semibold text-gray-800">{item.full_name ?? '—'}</Text>
        <Text className="text-sm text-gray-400">{item.email}</Text>
        {item.phone ? <Text className="text-xs text-gray-400">{item.phone}</Text> : null}
      </View>
      <TouchableOpacity
        className="bg-red-50 px-3 py-1 rounded-lg"
        onPress={() => handleRemove(item)}
      >
        <Text className="text-red-500 text-sm">Retirer</Text>
      </TouchableOpacity>
    </View>
  );

  const renderPending = ({ item }: { item: FamilyBond }) => (
    <View className="flex-row items-center bg-amber-50 rounded-2xl px-4 py-3 mb-3 border border-amber-200">
      <View className="flex-1">
        <Text className="font-medium text-gray-800">Invitation reçue</Text>
        <Text className="text-sm text-gray-500">ID: {item.parent_id.slice(0, 8)}…</Text>
      </View>
      <View className="flex-row gap-2">
        <TouchableOpacity
          className="bg-family-green px-3 py-1 rounded-lg"
          onPress={() => handleRespond(item, true)}
        >
          <Text className="text-white text-sm font-medium">Accepter</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="bg-gray-200 px-3 py-1 rounded-lg"
          onPress={() => handleRespond(item, false)}
        >
          <Text className="text-gray-600 text-sm">Refuser</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="flex-1 px-4 pt-4">
        {/* En-tête */}
        <View className="flex-row items-center justify-between mb-6">
          <Text className="text-2xl font-bold text-gray-800">Ma Famille</Text>
          <TouchableOpacity
            className="bg-primary-800 px-4 py-2 rounded-xl flex-row items-center"
            onPress={() => setShowModal(true)}
          >
            <Text className="text-white font-medium">+ Ajouter</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#1e40af" />
        ) : (
          <>
            {/* Invitations en attente */}
            {pendingIncoming.length > 0 && (
              <View className="mb-4">
                <Text className="text-sm font-semibold text-amber-600 mb-2 uppercase tracking-wide">
                  Invitations reçues ({pendingIncoming.length})
                </Text>
                <FlatList
                  data={pendingIncoming}
                  renderItem={renderPending}
                  keyExtractor={item => item.id}
                  scrollEnabled={false}
                />
              </View>
            )}

            {/* Membres acceptés */}
            <Text className="text-sm font-semibold text-gray-500 mb-2 uppercase tracking-wide">
              Membres ({members.length})
            </Text>
            {members.length === 0 ? (
              <View className="items-center py-12">
                <Text className="text-5xl mb-4">👨‍👩‍👧‍👦</Text>
                <Text className="text-gray-500 text-center">
                  Aucun membre pour l'instant.{'\n'}Invitez un proche pour commencer.
                </Text>
              </View>
            ) : (
              <FlatList
                data={members}
                renderItem={renderMember}
                keyExtractor={item => item.id}
                showsVerticalScrollIndicator={false}
              />
            )}
          </>
        )}
      </View>

      {/* Modal d'invitation */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View className="flex-1 justify-end bg-black/40">
          <View className="bg-white rounded-t-3xl px-6 pt-6 pb-10">
            <Text className="text-xl font-bold text-gray-800 mb-4">Inviter un membre</Text>

            {/* Sélecteur type */}
            <View className="flex-row bg-gray-100 rounded-xl p-1 mb-4">
              {(['email', 'phone'] as const).map(type => (
                <TouchableOpacity
                  key={type}
                  className={`flex-1 py-2 rounded-lg items-center ${inviteType === type ? 'bg-white shadow' : ''}`}
                  onPress={() => { setInviteType(type); setInviteValue(''); }}
                >
                  <Text className={inviteType === type ? 'font-semibold text-primary-800' : 'text-gray-500'}>
                    {type === 'email' ? 'Par Email' : 'Par Téléphone'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              className="border border-gray-300 rounded-xl px-4 py-3 text-base mb-4 bg-gray-50"
              placeholder={inviteType === 'email' ? 'email@exemple.com' : '+33 6 12 34 56 78'}
              value={inviteValue}
              onChangeText={setInviteValue}
              keyboardType={inviteType === 'email' ? 'email-address' : 'phone-pad'}
              autoCapitalize="none"
              autoFocus
            />

            <View className="flex-row gap-3">
              <TouchableOpacity
                className="flex-1 bg-gray-200 py-3 rounded-xl items-center"
                onPress={() => { setShowModal(false); setInviteValue(''); }}
              >
                <Text className="text-gray-600 font-medium">Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className={`flex-1 py-3 rounded-xl items-center ${sending ? 'bg-primary-300' : 'bg-primary-800'}`}
                onPress={handleSendInvite}
                disabled={sending}
              >
                {sending
                  ? <ActivityIndicator color="white" size="small" />
                  : <Text className="text-white font-semibold">Envoyer</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
