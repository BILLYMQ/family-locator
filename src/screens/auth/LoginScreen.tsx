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
  onNavigateToRegister: () => void;
}

export default function LoginScreen({ onNavigateToRegister }: Props) {
  const { signIn } = useAuth();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs.');
      return;
    }
    setLoading(true);
    const { error } = await signIn(email.trim().toLowerCase(), password);
    setLoading(false);
    if (error) Alert.alert('Connexion échouée', error.message);
  }

  const formContent = (
    <>
      {/* Header */}
      <View className="items-center mb-10">
        <View className="w-20 h-20 rounded-full bg-primary-800 items-center justify-center mb-4">
          <Text className="text-white text-4xl">📍</Text>
        </View>
        <Text className="text-3xl font-bold text-primary-800">FamilyLocator</Text>
        <Text className="text-gray-500 mt-1">Restez connectés, en sécurité</Text>
      </View>

      {/* Formulaire */}
      <View className="gap-4">
        <View>
          <Text className="text-sm font-medium text-gray-700 mb-1">Adresse email</Text>
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
          <Text className="text-sm font-medium text-gray-700 mb-1">Mot de passe</Text>
          <TextInput
            className="border border-gray-300 rounded-xl px-4 py-3 text-base bg-gray-50"
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
          />
        </View>

        <TouchableOpacity
          className={`rounded-xl py-4 items-center mt-2 ${loading ? 'bg-primary-300' : 'bg-primary-800'}`}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="white" />
            : <Text className="text-white font-semibold text-base">Se connecter</Text>
          }
        </TouchableOpacity>
      </View>

      {/* Lien inscription */}
      <View className="flex-row justify-center mt-8">
        <Text className="text-gray-500">Pas encore de compte ? </Text>
        <TouchableOpacity onPress={onNavigateToRegister}>
          <Text className="text-primary-600 font-semibold">S'inscrire</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  if (Platform.OS === 'web') {
    return (
      <View style={{ flex: 1, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: '100%', maxWidth: 448, paddingHorizontal: 24, paddingVertical: 48 }}>
          {formContent}
        </View>
      </View>
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
          {formContent}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
