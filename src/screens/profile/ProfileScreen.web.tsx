import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ActivityIndicator, ScrollView, Switch,
} from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { useLocation } from '@/hooks/useLocation.web';
import { supabase } from '@/lib/supabase';

const STATUS_OPTIONS = [
  '🏠 À la maison', '💼 Au travail', '🚗 En route',
  '🏃 En balade', '🛒 En courses', '💤 Je dors',
];

function formatCountdown(ms: number): string {
  const s   = Math.ceil(ms / 1000);
  const h   = Math.floor(s / 3600);
  const m   = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function ProfileScreen() {
  const { user, profile, signOut, updateProfile } = useAuth();
  const { tracking, trackingUntil, enableTracking, disableTracking } = useLocation();

  const [fullName,        setFullName]        = useState(profile?.full_name ?? '');
  const [phone,           setPhone]           = useState(profile?.phone ?? '');
  const [saving,          setSaving]          = useState(false);
  const [editing,         setEditing]         = useState(false);
  const [statusText,      setStatusText]      = useState(profile?.status_text ?? '');
  const [statusEditing,   setStatusEditing]   = useState(false);
  const [savingStatus,    setSavingStatus]    = useState(false);
  const [error,           setError]           = useState<string | null>(null);
  const [success,         setSuccess]         = useState<string | null>(null);
  const [avatarUrl,       setAvatarUrl]       = useState<string | null>(profile?.avatar_url ?? null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [countdown,       setCountdown]       = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const initials = (profile?.full_name ?? profile?.email ?? '?')
    .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  // Countdown timer pour le partage temporaire
  useEffect(() => {
    if (!trackingUntil) { setCountdown(null); return; }
    const tick = () => {
      const rem = trackingUntil.getTime() - Date.now();
      setCountdown(rem > 0 ? rem : null);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [trackingUntil]);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${user.id}/avatar.${ext}`;
    setUploadingAvatar(true);
    setError(null);
    const { error: uploadError } = await supabase.storage
      .from('avatars').upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) {
      setError(`Erreur upload : ${uploadError.message}`);
      setUploadingAvatar(false);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
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
    setError(null); setSuccess(null);
    const cleanedPhone = phone.trim().replace(/[\s\(\)\-\.]/g, '') || undefined;
    if (cleanedPhone && cleanedPhone.replace(/\D/g, '').length < 8) {
      setError('Numéro de téléphone invalide (ex : +1 418 000 0000).');
      return;
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

  async function handleStatusSave() {
    setSavingStatus(true);
    const { error: saveError } = await updateProfile({
      status_text: statusText.trim() || null,
    });
    setSavingStatus(false);
    if (saveError) {
      setError(saveError.message);
    } else {
      setStatusEditing(false);
      setSuccess(statusText.trim() ? 'Statut mis à jour.' : 'Statut effacé.');
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

  async function handleTempTracking(durationMs: number) {
    setError(null);
    if (tracking) await disableTracking();
    const ok = await enableTracking(durationMs);
    if (!ok) setError('Localisation non disponible. Vérifiez les paramètres du navigateur.');
  }

  const row        = { display: 'flex' as const, flexDirection: 'row' as const, alignItems: 'center' as const };
  const inputStyle = {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
    backgroundColor: '#f9fafb', outlineStyle: 'none',
  } as any;
  const card       = {
    backgroundColor: 'white', borderRadius: 16, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: '#f3f4f6',
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <ScrollView contentContainerStyle={{ padding: 16, maxWidth: 560, alignSelf: 'center', width: '100%' }}>

        {/* Avatar */}
        <View style={{ alignItems: 'center', marginVertical: 24 }}>
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
          {profile?.status_text ? (
            <Text style={{ color: '#6b7280', fontSize: 13, marginTop: 4, fontStyle: 'italic' }}>{profile.status_text}</Text>
          ) : null}
          <Text style={{ color: '#9ca3af', fontSize: 11, marginTop: 4 }}>Appuyez sur la photo pour la modifier</Text>
        </View>

        {/* Bannières */}
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
        <View style={card}>
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
                style={{ flex: 1, backgroundColor: '#f3f4f6', paddingVertical: 11, borderRadius: 12, alignItems: 'center' }}>
                <Text style={{ color: '#374151', fontWeight: '500' }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                disabled={saving}
                style={{ flex: 1, backgroundColor: saving ? '#93c5fd' : '#1e40af', paddingVertical: 11, borderRadius: 12, alignItems: 'center' }}>
                {saving ? <ActivityIndicator color="white" size="small" /> : <Text style={{ color: 'white', fontWeight: '600' }}>Enregistrer</Text>}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Statut personnalisé */}
        <View style={card}>
          <View style={{ ...row, justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ fontWeight: '600', color: '#374151', fontSize: 15 }}>Statut</Text>
            {!statusEditing && (
              <TouchableOpacity onPress={() => setStatusEditing(true)}
                style={{ backgroundColor: '#eff6ff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}>
                <Text style={{ color: '#1d4ed8', fontSize: 13, fontWeight: '500' }}>
                  {profile?.status_text ? 'Modifier' : 'Définir'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {!statusEditing ? (
            <Text style={{ color: profile?.status_text ? '#1f2937' : '#9ca3af', fontSize: 14, fontStyle: profile?.status_text ? 'normal' : 'italic' }}>
              {profile?.status_text ?? 'Aucun statut défini'}
            </Text>
          ) : (
            <>
              {/* Quick picks */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                {STATUS_OPTIONS.map(opt => (
                  <TouchableOpacity key={opt} onPress={() => setStatusText(opt)}
                    style={{
                      backgroundColor: statusText === opt ? '#eff6ff' : '#f3f4f6',
                      borderWidth: 1, borderColor: statusText === opt ? '#bfdbfe' : '#e5e7eb',
                      borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
                    }}>
                    <Text style={{ fontSize: 13, color: statusText === opt ? '#1d4ed8' : '#374151' }}>{opt}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Champ libre */}
              <TextInput
                style={{ ...inputStyle, marginBottom: 12 }}
                value={statusText}
                onChangeText={setStatusText}
                placeholder="Ou écrivez votre propre statut…"
                maxLength={60}
              />

              <View style={{ ...row, gap: 8 }}>
                {statusText.trim() ? (
                  <TouchableOpacity
                    onPress={() => setStatusText('')}
                    style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' }}>
                    <Text style={{ color: '#ef4444', fontWeight: '500', fontSize: 13 }}>Effacer</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  onPress={() => { setStatusEditing(false); setStatusText(profile?.status_text ?? ''); }}
                  style={{ flex: 1, backgroundColor: '#f3f4f6', paddingVertical: 11, borderRadius: 12, alignItems: 'center' }}>
                  <Text style={{ color: '#374151', fontWeight: '500' }}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleStatusSave}
                  disabled={savingStatus}
                  style={{ flex: 1, backgroundColor: savingStatus ? '#93c5fd' : '#1e40af', paddingVertical: 11, borderRadius: 12, alignItems: 'center' }}>
                  {savingStatus
                    ? <ActivityIndicator color="white" size="small" />
                    : <Text style={{ color: 'white', fontWeight: '600' }}>Enregistrer</Text>
                  }
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {/* Localisation */}
        <View style={card}>
          <Text style={{ fontWeight: '600', color: '#374151', fontSize: 15, marginBottom: 12 }}>Localisation</Text>

          {/* Toggle suivi permanent */}
          <View style={{ ...row, justifyContent: 'space-between', marginBottom: 14 }}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={{ color: '#1f2937', fontSize: 14 }}>Partage de position</Text>
              <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                {tracking
                  ? countdown !== null
                    ? `Partage temporaire · ${formatCountdown(countdown)} restant`
                    : 'Mise à jour toutes les 5 minutes'
                  : 'Votre famille ne peut pas vous localiser'}
              </Text>
            </View>
            <Switch
              value={tracking}
              onValueChange={handleTrackingToggle}
              trackColor={{ false: '#d1d5db', true: '#1e40af' }}
              thumbColor="white"
            />
          </View>

          {/* Partage temporaire */}
          <Text style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            Partage temporaire
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[
              { label: '1h',  ms: 1 * 60 * 60 * 1000 },
              { label: '2h',  ms: 2 * 60 * 60 * 1000 },
              { label: '4h',  ms: 4 * 60 * 60 * 1000 },
              { label: '8h',  ms: 8 * 60 * 60 * 1000 },
            ].map(({ label, ms }) => (
              <TouchableOpacity
                key={label}
                onPress={() => handleTempTracking(ms)}
                style={{
                  flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center',
                  backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe',
                }}>
                <Text style={{ fontWeight: '600', fontSize: 13, color: '#1d4ed8' }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Bouton stop partage temporaire */}
          {tracking && countdown !== null && (
            <TouchableOpacity
              onPress={() => disableTracking()}
              style={{
                marginTop: 10, paddingVertical: 9, borderRadius: 10, alignItems: 'center',
                backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca',
              }}>
              <Text style={{ color: '#ef4444', fontWeight: '600', fontSize: 13 }}>
                Arrêter le partage temporaire
              </Text>
            </TouchableOpacity>
          )}
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
