import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  onNavigateToLogin: () => void;
}

export default function RegisterScreen({ onNavigateToLogin }: Props) {
  const { signUp, updateProfile } = useAuth();
  const [fullName, setFullName]   = useState('');
  const [email, setEmail]         = useState('');
  const [phone, setPhone]         = useState('');
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [loading, setLoading]     = useState(false);

  async function handleRegister() {
    if (!fullName.trim() || !email.trim() || !password) {
      Alert.alert('Erreur', 'Nom, email et mot de passe sont obligatoires.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Erreur', 'Les mots de passe ne correspondent pas.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Erreur', 'Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }

    setLoading(true);
    const { error } = await signUp(email.trim().toLowerCase(), password, fullName.trim());
    if (error) {
      setLoading(false);
      Alert.alert('Inscription échouée', error.message);
      return;
    }
    // Mise à jour du téléphone si fourni
    if (phone.trim()) {
      await updateProfile({ phone: phone.trim() });
    }
    setLoading(false);
    Alert.alert(
      'Vérifiez votre email',
      'Un lien de confirmation a été envoyé à ' + email.trim(),
      [{ text: 'OK', onPress: onNavigateToLogin }]
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-1 justify-center px-6 py-12">
          <View className="items-center mb-8">
            <Text className="text-3xl font-bold text-primary-800">Créer un compte</Text>
            <Text className="text-gray-500 mt-1">Rejoignez FamilyLocator</Text>
          </View>

          <View className="gap-4">
            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1">Nom complet *</Text>
              <TextInput
                className="border border-gray-300 rounded-xl px-4 py-3 text-base bg-gray-50"
                placeholder="Jean Dupont"
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
                autoComplete="name"
              />
            </View>

            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1">Adresse email *</Text>
              <TextInput
                className="border border-gray-300 rounded-xl px-4 py-3 text-base bg-gray-50"
                placeholder="votre@email.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            </View>

            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1">
                Téléphone <Text className="text-gray-400">(optionnel)</Text>
              </Text>
              <TextInput
                className="border border-gray-300 rounded-xl px-4 py-3 text-base bg-gray-50"
                placeholder="+33 6 12 34 56 78"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoComplete="tel"
              />
            </View>

            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1">Mot de passe *</Text>
              <TextInput
                className="border border-gray-300 rounded-xl px-4 py-3 text-base bg-gray-50"
                placeholder="Min. 8 caractères"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
              />
            </View>

            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1">Confirmer le mot de passe *</Text>
              <TextInput
                className="border border-gray-300 rounded-xl px-4 py-3 text-base bg-gray-50"
                placeholder="••••••••"
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry
              />
            </View>

            <TouchableOpacity
              className={`rounded-xl py-4 items-center mt-2 ${loading ? 'bg-primary-300' : 'bg-primary-800'}`}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="white" />
                : <Text className="text-white font-semibold text-base">Créer mon compte</Text>
              }
            </TouchableOpacity>
          </View>

          <View className="flex-row justify-center mt-6">
            <Text className="text-gray-500">Déjà un compte ? </Text>
            <TouchableOpacity onPress={onNavigateToLogin}>
              <Text className="text-primary-600 font-semibold">Se connecter</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
