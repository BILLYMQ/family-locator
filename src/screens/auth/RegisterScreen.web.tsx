import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  onNavigateToLogin: () => void;
}

export default function RegisterScreen({ onNavigateToLogin }: Props) {
  const { signUp } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email,    setEmail]    = useState('');
  const [phone,    setPhone]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [success,  setSuccess]  = useState<string | null>(null);

  function clearError() { setError(null); }

  async function handleRegister() {
    setError(null);
    setSuccess(null);

    if (!fullName.trim() || !email.trim() || !password) {
      setError('Nom, email et mot de passe sont obligatoires.');
      return;
    }
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }

    // Nettoyage : supprime espaces, tirets, parenthèses et points
    const cleanedPhone = phone.trim().replace(/[\s\(\)\-\.]/g, '');
    if (cleanedPhone) {
      const digits = cleanedPhone.replace(/\D/g, '');
      if (digits.length < 8) {
        setError('Numéro invalide — vérifiez le format (ex : +1 418 000 0000).');
        return;
      }
    }

    setLoading(true);
    const { error: signUpError } = await signUp(
      email.trim().toLowerCase(),
      password,
      fullName.trim(),
      cleanedPhone || undefined,
    );
    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    setSuccess(`✓ Compte créé ! Vérifiez votre boîte de réception : ${email.trim()}`);
    setTimeout(onNavigateToLogin, 2500);
  }

  const inputStyle = {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 15, backgroundColor: '#f9fafb',
    outlineStyle: 'none',
  } as any;

  const labelStyle = { fontSize: 13, fontWeight: '500' as const, color: '#374151', marginBottom: 4 };

  return (
    <View style={{ flex: 1, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: '100%', maxWidth: 448, paddingHorizontal: 24, paddingVertical: 48 }}>

        {/* En-tête */}
        <View style={{ alignItems: 'center', marginBottom: 32 }}>
          <Text style={{ fontSize: 28, fontWeight: '700', color: '#1e3a8a' }}>Créer un compte</Text>
          <Text style={{ color: '#6b7280', marginTop: 4 }}>Rejoignez FamilyLocator</Text>
        </View>

        {/* Bannière erreur */}
        {error && (
          <View style={{ backgroundColor: '#fef2f2', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16, borderWidth: 1, borderColor: '#fca5a5' }}>
            <Text style={{ color: '#991b1b', fontSize: 13, fontWeight: '600' }}>⚠ {error}</Text>
          </View>
        )}

        {/* Bannière succès */}
        {success && (
          <View style={{ backgroundColor: '#dcfce7', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16, borderWidth: 1, borderColor: '#86efac' }}>
            <Text style={{ color: '#166534', fontSize: 13, fontWeight: '600' }}>{success}</Text>
          </View>
        )}

        <View style={{ gap: 16 }}>

          {/* Nom complet */}
          <View>
            <Text style={labelStyle}>Nom complet *</Text>
            <TextInput
              style={inputStyle}
              placeholder="Jean Dupont"
              value={fullName}
              onChangeText={t => { setFullName(t); clearError(); }}
              autoCapitalize="words"
              autoComplete="name"
            />
          </View>

          {/* Email */}
          <View>
            <Text style={labelStyle}>Adresse email *</Text>
            <TextInput
              style={inputStyle}
              placeholder="votre@email.com"
              value={email}
              onChangeText={t => { setEmail(t); clearError(); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          </View>

          {/* Téléphone */}
          <View>
            <Text style={labelStyle}>
              Téléphone{' '}
              <Text style={{ color: '#9ca3af', fontWeight: '400' }}>(optionnel)</Text>
            </Text>
            <TextInput
              style={inputStyle}
              placeholder="+1 418 000 0000"
              value={phone}
              onChangeText={t => { setPhone(t); clearError(); }}
              keyboardType="phone-pad"
              autoComplete="tel"
            />
            <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
              Permet aux membres de vous inviter par numéro
            </Text>
          </View>

          {/* Mot de passe */}
          <View>
            <Text style={labelStyle}>Mot de passe *</Text>
            <TextInput
              style={inputStyle}
              placeholder="Min. 8 caractères"
              value={password}
              onChangeText={t => { setPassword(t); clearError(); }}
              secureTextEntry
              autoComplete="new-password"
            />
          </View>

          {/* Confirmation */}
          <View>
            <Text style={labelStyle}>Confirmer le mot de passe *</Text>
            <TextInput
              style={inputStyle}
              placeholder="••••••••"
              value={confirm}
              onChangeText={t => { setConfirm(t); clearError(); }}
              secureTextEntry
            />
          </View>

          {/* Bouton */}
          <TouchableOpacity
            onPress={handleRegister}
            disabled={loading || !!success}
            style={{
              borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4,
              backgroundColor: (loading || !!success) ? '#93c5fd' : '#1e40af',
            }}
          >
            {loading
              ? <ActivityIndicator color="white" />
              : <Text style={{ color: 'white', fontWeight: '600', fontSize: 15 }}>Créer mon compte</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Lien connexion */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 24 }}>
          <Text style={{ color: '#6b7280' }}>Déjà un compte ? </Text>
          <TouchableOpacity onPress={onNavigateToLogin}>
            <Text style={{ color: '#2563eb', fontWeight: '600' }}>Se connecter</Text>
          </TouchableOpacity>
        </View>

      </View>
    </View>
  );
}
