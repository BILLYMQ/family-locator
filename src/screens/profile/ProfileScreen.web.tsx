import React, { useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ActivityIndicator, ScrollView, Switch,
} from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { useLocation } from '@/hooks/useLocation.web';
import { supabase } from '@/lib/supabase';

export default function ProfileScreen() {
  const { user, profile, signOut, updateProfile } = useAuth();
  const { tracking, enableTracking, disableTracking } = useLocation();

  const [fullName,      setFullName]      = useState(profile?.full_name ?? '');
  const [phone,         setPhone]         = useState(profile?.phone ?? '');
  const [saving,        setSaving]        = useState(false);
  const [editing,       setEditing]       = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [success,       setSuccess]       = useState<string | null>(null);
  const [avatarUrl,     setAvatarUrl]     = useState<string | null>(profile?.avatar_url ?? null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const initials = (profile?.full_name ?? profile?.email ?? '?')
    .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${user.id}/avatar.${ext}`;

    setUploadingAvatar(true);
    setError(null);

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      setError(`Erreur upload : ${uploadError.message}`);
      setUploadingAvatar(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
    // Ajouter un cache-buster pour forcer le rechargement de l'image
    const urlWithBust = `${publicUrl}?t=${Date.now()}`;

    const { error: updateError } = await updateProfile({ avatar_url: publicUrl });
    setUploadingAvatar(false);

    if (updateError) {
      setError(`Erreur mise à jour : ${updateError.message}`);
    } else {
      setAvatarUrl(urlWithBust);
      setSuccess('Photo mise à jour.');
      setTimeout(() => setSuccess(null), 3000);
    }
  }

  async function handleSave() {
    setError(null);
    setSuccess(null);

    const cleanedPhone = phone.trim().replace(/[\s\(\)\-\.]/g, '') || undefined;
    if (cleanedPhone) {
      const digits = cleanedPhone.replace(/\D/g, '');
      if (digits.length < 8) {
        setError('Numéro de téléphone invalide (ex : +1 418 000 0000).');
        return;
      }
    }

    setSaving(true);
    const { error: saveError } = await updateProfile({
      full_name: fullName.trim() || undefined,
      phone: cleanedPhone,
    });
    setSaving(false);

    if (saveError) {
      setError(saveError.message);
    } else {
      setEditing(false);
      setSuccess('Profil mis à jour avec succès.');
      setTimeout(() => setSuccess(null), 3000);
    }
  }

  async function handleTrackingToggle(value: boolean) {
    setError(null);
    if (value) {
      const ok = await enableTracking();
      if (!ok) setError('Localisation non disponible. Vérifiez les paramètres du navigateur.');
    } else {
      await disableTracking();
    }
  }

  const row = { display: 'flex' as const, flexDirection: 'row' as const, alignItems: 'center' as const };
  const inputStyle = {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
    backgroundColor: '#f9fafb', outlineStyle: 'none',
  } as any;

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <ScrollView contentContainerStyle={{ padding: 16, maxWidth: 560, alignSelf: 'center', width: '100%' }}>

        {/* Avatar */}
        <View style={{ alignItems: 'center', marginVertical: 24 }}>
          {/* Input fichier caché — déclenché par le clic sur l'avatar */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={handleAvatarChange}
          />
          <TouchableOpacity
            onPress={() => fileInputRef.current?.click()}
            disabled={uploadingAvatar}
            style={{ marginBottom: 12, position: 'relative' as any }}
          >
            <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: '#1e3a8a', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {avatarUrl
                ? <img src={avatarUrl} alt="avatar" style={{ width: 88, height: 88, objectFit: 'cover', borderRadius: '50%' }} />
                : <Text style={{ color: 'white', fontSize: 28, fontWeight: '700' }}>{initials}</Text>
              }
            </View>
            <View style={{
              position: 'absolute' as any, bottom: 0, right: 0,
              width: 26, height: 26, borderRadius: 13,
              backgroundColor: '#1e40af', borderWidth: 2, borderColor: 'white',
              alignItems: 'center', justifyContent: 'center',
            }}>
              {uploadingAvatar
                ? <ActivityIndicator size="small" color="white" />
                : <Text style={{ fontSize: 13 }}>📷</Text>
              }
            </View>
          </TouchableOpacity>
          <Text style={{ fontSize: 20, fontWeight: '700', color: '#1f2937' }}>{profile?.full_name ?? 'Mon profil'}</Text>
          <Text style={{ color: '#9ca3af', fontSize: 13, marginTop: 2 }}>{profile?.email}</Text>
          <Text style={{ color: '#9ca3af', fontSize: 11, marginTop: 4 }}>Appuyez sur la photo pour la modifier</Text>
        </View>

        {/* Bannières feedback */}
        {error && (
          <View style={{ backgroundColor: '#fef2f2', borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#fca5a5' }}>
            <Text style={{ color: '#991b1b', fontSize: 13, fontWeight: '600' }}>⚠ {error}</Text>
          </View>
        )}
        {success && (
          <View style={{ backgroundColor: '#dcfce7', borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#86efac' }}>
            <Text style={{ color: '#166534', fontSize: 13, fontWeight: '600' }}>✓ {success}</Text>
          </View>
        )}

        {/* Informations */}
        <View style={{ backgroundColor: 'white', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#f3f4f6' }}>
          <View style={{ ...row, justifyContent: 'space-between', marginBottom: 16 }}>
            <Text style={{ fontWeight: '600', color: '#374151', fontSize: 15 }}>Informations</Text>
            {!editing && (
              <TouchableOpacity onPress={() => { setEditing(true); setError(null); }}
                style={{ backgroundColor: '#eff6ff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}>
                <Text style={{ color: '#1d4ed8', fontSize: 13, fontWeight: '500' }}>Modifier</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={{ gap: 12 }}>
            <View>
              <Text style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Nom complet</Text>
              {editing
                ? <TextInput style={inputStyle} value={fullName} onChangeText={t => { setFullName(t); setError(null); }} autoCapitalize="words" placeholder="Jean Dupont" />
                : <Text style={{ color: '#1f2937', fontSize: 14 }}>{profile?.full_name ?? '—'}</Text>
              }
            </View>

            <View>
              <Text style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Téléphone</Text>
              {editing
                ? <>
                    <TextInput style={inputStyle} value={phone} onChangeText={t => { setPhone(t); setError(null); }} keyboardType="phone-pad" placeholder="+1 418 000 0000" />
                    <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>Format : +1 418 000 0000 · Les espaces sont supprimés automatiquement</Text>
                  </>
                : <Text style={{ color: '#1f2937', fontSize: 14 }}>{profile?.phone ?? '—'}</Text>
              }
            </View>
          </View>

          {editing && (
            <View style={{ ...row, gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                onPress={() => { setEditing(false); setFullName(profile?.full_name ?? ''); setPhone(profile?.phone ?? ''); setError(null); }}
                style={{ flex: 1, backgroundColor: '#f3f4f6', paddingVertical: 11, borderRadius: 12, alignItems: 'center' }}
              >
                <Text style={{ color: '#374151', fontWeight: '500' }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                disabled={saving}
                style={{ flex: 1, backgroundColor: saving ? '#93c5fd' : '#1e40af', paddingVertical: 11, borderRadius: 12, alignItems: 'center' }}
              >
                {saving ? <ActivityIndicator color="white" size="small" /> : <Text style={{ color: 'white', fontWeight: '600' }}>Enregistrer</Text>}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Localisation */}
        <View style={{ backgroundColor: 'white', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#f3f4f6' }}>
          <Text style={{ fontWeight: '600', color: '#374151', fontSize: 15, marginBottom: 12 }}>Localisation</Text>
          <View style={{ ...row, justifyContent: 'space-between' }}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={{ color: '#1f2937', fontSize: 14 }}>Partage de position</Text>
              <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
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

        {/* RGPD */}
        <View style={{ backgroundColor: '#eff6ff', borderRadius: 16, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: '#dbeafe' }}>
          <Text style={{ fontSize: 12, color: '#1d4ed8', lineHeight: 18 }}>
            🔒 Votre position n'est partagée qu'avec les membres dont le lien est accepté. Vous pouvez arrêter le partage à tout moment.
          </Text>
        </View>

        {/* Déconnexion */}
        <TouchableOpacity
          onPress={() => { if (window.confirm('Êtes-vous sûr de vouloir vous déconnecter ?')) signOut(); }}
          style={{ backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 16, paddingVertical: 14, alignItems: 'center' }}
        >
          <Text style={{ color: '#ef4444', fontWeight: '600' }}>Se déconnecter</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}
