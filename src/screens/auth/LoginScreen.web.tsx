import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView,
} from 'react-native';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  onNavigateToRegister: () => void;
}

export default function LoginScreen({ onNavigateToRegister }: Props) {
  const { signIn } = useAuth();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  async function handleLogin() {
    setError(null);
    if (!email.trim() || !password) {
      setError('Veuillez remplir tous les champs.');
      return;
    }
    setLoading(true);
    const { error: signInError } = await signIn(email.trim().toLowerCase(), password);
    setLoading(false);
    if (signInError) {
      setError(
        signInError.message === 'Invalid login credentials'
          ? 'Email ou mot de passe incorrect.'
          : signInError.message
      );
    }
  }

  const inputStyle = {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 15, backgroundColor: '#f9fafb',
    outlineStyle: 'none',
  } as any;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: 'white' }}
      contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center' }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ width: '100%', maxWidth: 448, paddingHorizontal: 24, paddingVertical: 48 }}>

        {/* Logo + titre */}
        <View style={{ alignItems: 'center', marginBottom: 40 }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#1e3a8a', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Text style={{ fontSize: 36 }}>📍</Text>
          </View>
          <Text style={{ fontSize: 28, fontWeight: '700', color: '#1e3a8a' }}>FamilyLocator</Text>
          <Text style={{ color: '#6b7280', marginTop: 4 }}>Restez connectés, en sécurité</Text>
        </View>

        {/* Bannière erreur */}
        {error && (
          <View style={{ backgroundColor: '#fef2f2', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 20, borderWidth: 1, borderColor: '#fca5a5' }}>
            <Text style={{ color: '#991b1b', fontSize: 13, fontWeight: '600' }}>⚠ {error}</Text>
          </View>
        )}

        <View style={{ gap: 16 }}>

          {/* Email */}
          <View>
            <Text style={{ fontSize: 13, fontWeight: '500', color: '#374151', marginBottom: 4 }}>Adresse email</Text>
            <TextInput
              style={inputStyle}
              placeholder="votre@email.com"
              value={email}
              onChangeText={t => { setEmail(t); setError(null); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          </View>

          {/* Mot de passe */}
          <View>
            <Text style={{ fontSize: 13, fontWeight: '500', color: '#374151', marginBottom: 4 }}>Mot de passe</Text>
            <TextInput
              style={inputStyle}
              placeholder="••••••••"
              value={password}
              onChangeText={t => { setPassword(t); setError(null); }}
              secureTextEntry
              autoComplete="current-password"
            />
          </View>

          {/* Bouton connexion */}
          <TouchableOpacity
            onPress={handleLogin}
            disabled={loading}
            style={{
              borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4,
              backgroundColor: loading ? '#93c5fd' : '#1e40af',
            }}
          >
            {loading
              ? <ActivityIndicator color="white" />
              : <Text style={{ color: 'white', fontWeight: '600', fontSize: 15 }}>Se connecter</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Lien inscription */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 28 }}>
          <Text style={{ color: '#6b7280' }}>Pas encore de compte ? </Text>
          <TouchableOpacity onPress={onNavigateToRegister}>
            <Text style={{ color: '#2563eb', fontWeight: '600' }}>Créer un compte</Text>
          </TouchableOpacity>
        </View>

      </View>
    </ScrollView>
  );
}
