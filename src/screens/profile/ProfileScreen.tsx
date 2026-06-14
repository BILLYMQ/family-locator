import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  Switch,
} from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { useLocation } from '@/hooks/useLocation';

export default function ProfileScreen() {
  const { profile, signOut, updateProfile } = useAuth();
  const { tracking, enableTracking, disableTracking } = useLocation();

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [phone, setPhone]       = useState(profile?.phone ?? '');
  const [saving, setSaving]     = useState(false);
  const [editing, setEditing]   = useState(false);

  async function handleSave() {
    // Normalise le téléphone pour correspondre au format stocké et cherché
    const cleanedPhone = phone.trim().replace(/[\s\(\)\-\.]/g, '') || undefined;
    if (cleanedPhone) {
      const digits = cleanedPhone.replace(/\D/g, '');
      if (digits.length < 8) {
        Alert.alert('Erreur', 'Numéro de téléphone invalide (ex : +1 418 000 0000).');
        return;
      }
    }
    setSaving(true);
    const { error } = await updateProfile({
      full_name: fullName.trim() || undefined,
      phone: cleanedPhone,
    });
    setSaving(false);
    if (error) {
      Alert.alert('Erreur', error.message);
    } else {
      setEditing(false);
      Alert.alert('Profil mis à jour', 'Vos informations ont été enregistrées.');
    }
  }

  async function handleTrackingToggle(value: boolean) {
    if (value) {
      const ok = await enableTracking();
      if (!ok) Alert.alert('Permission refusée', 'Activez la localisation dans les paramètres.');
    } else {
      await disableTracking();
    }
  }

  async function handleSignOut() {
    Alert.alert('Déconnexion', 'Êtes-vous sûr de vouloir vous déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Déconnexion', style: 'destructive', onPress: signOut },
    ]);
  }

  const initials = (profile?.full_name ?? profile?.email ?? '?')
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View className="px-4 py-6">

          {/* Avatar */}
          <View className="items-center mb-8">
            <View className="w-24 h-24 rounded-full bg-primary-800 items-center justify-center mb-3">
              <Text className="text-white text-3xl font-bold">{initials}</Text>
            </View>
            <Text className="text-xl font-bold text-gray-800">
              {profile?.full_name ?? 'Mon profil'}
            </Text>
            <Text className="text-gray-400 text-sm">{profile?.email}</Text>
          </View>

          {/* Informations */}
          <View className="bg-white rounded-2xl px-4 py-4 mb-4 shadow-sm border border-gray-100">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="font-semibold text-gray-700 text-base">Informations</Text>
              {!editing && (
                <TouchableOpacity
                  className="bg-primary-50 px-3 py-1 rounded-lg"
                  onPress={() => setEditing(true)}
                >
                  <Text className="text-primary-700 text-sm font-medium">Modifier</Text>
                </TouchableOpacity>
              )}
            </View>

            <View className="gap-4">
              <View>
                <Text className="text-xs text-gray-400 mb-1 uppercase tracking-wide">Nom complet</Text>
                {editing ? (
                  <TextInput
                    className="border border-gray-300 rounded-xl px-3 py-2 text-base bg-gray-50"
                    value={fullName}
                    onChangeText={setFullName}
                    autoCapitalize="words"
                    placeholder="Jean Dupont"
                  />
                ) : (
                  <Text className="text-gray-800">{profile?.full_name ?? '—'}</Text>
                )}
              </View>

              <View>
                <Text className="text-xs text-gray-400 mb-1 uppercase tracking-wide">Téléphone</Text>
                {editing ? (
                  <TextInput
                    className="border border-gray-300 rounded-xl px-3 py-2 text-base bg-gray-50"
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    placeholder="+33 6 12 34 56 78"
                  />
                ) : (
                  <Text className="text-gray-800">{profile?.phone ?? '—'}</Text>
                )}
              </View>
            </View>

            {editing && (
              <View className="flex-row gap-3 mt-4">
                <TouchableOpacity
                  className="flex-1 bg-gray-100 py-3 rounded-xl items-center"
                  onPress={() => {
                    setEditing(false);
                    setFullName(profile?.full_name ?? '');
                    setPhone(profile?.phone ?? '');
                  }}
                >
                  <Text className="text-gray-600 font-medium">Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className={`flex-1 py-3 rounded-xl items-center ${saving ? 'bg-primary-300' : 'bg-primary-800'}`}
                  onPress={handleSave}
                  disabled={saving}
                >
                  {saving
                    ? <ActivityIndicator color="white" size="small" />
                    : <Text className="text-white font-semibold">Enregistrer</Text>
                  }
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Paramètres localisation */}
          <View className="bg-white rounded-2xl px-4 py-4 mb-4 shadow-sm border border-gray-100">
            <Text className="font-semibold text-gray-700 text-base mb-3">Localisation</Text>
            <View className="flex-row items-center justify-between">
              <View className="flex-1 mr-4">
                <Text className="text-gray-800">Partage de position</Text>
                <Text className="text-xs text-gray-400">
                  {tracking ? 'Mise à jour toutes les 5 minutes' : 'Votre famille ne peut pas vous localiser'}
                </Text>
              </View>
              <Switch
                value={tracking}
                onValueChange={handleTrackingToggle}
                trackColor={{ false: '#d1d5db', true: '#1e40af' }}
                thumbColor="white"
              />
            </View>
          </View>

          {/* RGPD info */}
          <View className="bg-blue-50 rounded-2xl px-4 py-3 mb-6 border border-blue-100">
            <Text className="text-xs text-blue-700 leading-relaxed">
              🔒 Votre position n'est partagée qu'avec les membres de votre famille dont le lien est accepté. Vous pouvez arrêter le partage à tout moment.
            </Text>
          </View>

          {/* Déconnexion */}
          <TouchableOpacity
            className="bg-red-50 border border-red-200 rounded-2xl py-4 items-center"
            onPress={handleSignOut}
          >
            <Text className="text-red-500 font-semibold">Se déconnecter</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
