import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  Switch,
  ScrollView,
  Platform,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useFamily } from '@/hooks/useFamily';
import { useLocation } from '@/hooks/useLocation';
import { FamilyMember, Location } from '@/types/database';

// Couleurs assignées aux membres (cyclique)
const MEMBER_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#06b6d4'];

export default function MapScreen() {
  const { user } = useAuth();
  const { members } = useFamily(user?.id);
  const { currentLocation, tracking, permissionDenied, enableTracking, disableTracking, pushLocation } = useLocation();
  const mapRef = useRef<MapView>(null);

  const [memberLocations, setMemberLocations] = useState<Record<string, Location>>({});
  const [selectedMember,  setSelectedMember]  = useState<FamilyMember | null>(null);
  const [pushing,         setPushing]         = useState(false);
  const [pushMsg,         setPushMsg]         = useState<{ ok: boolean; text: string } | null>(null);

  // Centrer la carte sur la position actuelle
  useEffect(() => {
    if (currentLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }, 500);
    }
  }, [currentLocation]);

  // Abonnement temps réel aux positions des membres de la famille
  useEffect(() => {
    if (!user || members.length === 0) return;

    const memberIds = members.map(m => m.id);

    // Chargement initial
    supabase
      .from('locations')
      .select('*')
      .in('user_id', memberIds)
      .then(({ data }) => {
        if (!data) return;
        const map: Record<string, Location> = {};
        data.forEach(loc => { map[loc.user_id] = loc; });
        setMemberLocations(map);
      });

    // Pas de filtre server-side : RLS garantit qu'on ne reçoit que les membres
    // acceptés. REPLICA IDENTITY FULL est requis pour les UPDATE avec RLS.
    const channel = supabase
      .channel(`map_locs_${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'locations' },
        payload => {
          console.log('[REALTIME] location update received', payload.eventType);
          if (payload.eventType === 'DELETE') {
            const uid = (payload.old as Location).user_id;
            if (memberIds.includes(uid)) {
              setMemberLocations(prev => { const next = { ...prev }; delete next[uid]; return next; });
            }
          } else {
            const loc = payload.new as Location;
            if (memberIds.includes(loc.user_id)) {
              setMemberLocations(prev => ({ ...prev, [loc.user_id]: loc }));
            }
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, members]);

  async function handlePushLocation() {
    if (pushing) return;
    setPushing(true);
    setPushMsg(null);
    const r = await pushLocation();
    setPushing(false);
    setPushMsg(r.success
      ? { ok: true,  text: '✓ Position envoyée !' }
      : { ok: false, text: r.error ?? 'Erreur' }
    );
    setTimeout(() => setPushMsg(null), 4000);
  }

  async function handleTrackingToggle(value: boolean) {
    if (value) {
      const ok = await enableTracking();
      if (!ok) Alert.alert('Permission refusée', 'Activez la localisation dans les paramètres.');
    } else {
      await disableTracking();
    }
  }

  function focusMember(member: FamilyMember) {
    const loc = memberLocations[member.id];
    if (!loc) {
      Alert.alert('Position inconnue', `${member.full_name ?? member.email} n'a pas encore partagé sa position.`);
      return;
    }
    setSelectedMember(member);
    mapRef.current?.animateToRegion({
      latitude: loc.latitude,
      longitude: loc.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    }, 600);
  }

  function formatTime(isoString: string): string {
    const diff = Date.now() - new Date(isoString).getTime();
    if (diff < 60_000)     return "À l'instant";
    if (diff < 3_600_000)  return `Il y a ${Math.floor(diff / 60_000)} min`;
    if (diff < 86_400_000) return `Il y a ${Math.floor(diff / 3_600_000)} h`;
    const days = Math.floor(diff / 86_400_000);
    return `Il y a ${days} jour${days > 1 ? 's' : ''}`;
  }

  function isStale(isoString: string): boolean {
    return Date.now() - new Date(isoString).getTime() > 10 * 60_000; // > 10 min
  }

  if (permissionDenied) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-5xl mb-4">📍</Text>
        <Text className="text-xl font-bold text-gray-800 mb-2">Permission requise</Text>
        <Text className="text-gray-500 text-center">
          Activez la localisation dans les paramètres de votre appareil pour utiliser FamilyLocator.
        </Text>
      </View>
    );
  }

  const defaultRegion: Region = {
    latitude: 48.8566,
    longitude: 2.3522,
    latitudeDelta: 0.1,
    longitudeDelta: 0.1,
  };

  return (
    <View className="flex-1">
      {/* Carte principale */}
      <MapView
        ref={mapRef}
        className="flex-1"
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={
          currentLocation
            ? {
                latitude: currentLocation.coords.latitude,
                longitude: currentLocation.coords.longitude,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
              }
            : defaultRegion
        }
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass
      >
        {/* Marqueurs des membres de la famille */}
        {members.map((member, idx) => {
          const loc = memberLocations[member.id];
          if (!loc) return null;
          const color = MEMBER_COLORS[idx % MEMBER_COLORS.length];
          return (
            <Marker
              key={member.id}
              coordinate={{ latitude: loc.latitude, longitude: loc.longitude }}
              onPress={() => setSelectedMember(member)}
            >
              <View
                className="items-center justify-center rounded-full border-2 border-white shadow"
                style={{ width: 44, height: 44, backgroundColor: color }}
              >
                <Text className="text-white font-bold text-base">
                  {(member.full_name ?? member.email ?? '?')[0].toUpperCase()}
                </Text>
              </View>
            </Marker>
          );
        })}
      </MapView>

      {/* Panneau de contrôle — bas de l'écran */}
      <View className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-lg px-4 pt-4 pb-8">
        {/* Toggle partage de position */}
        <View className="flex-row items-center justify-between mb-3 pb-3 border-b border-gray-100">
          <View className="flex-1 mr-3">
            <Text className="font-semibold text-gray-800">Partager ma position</Text>
            <Text className="text-xs text-gray-400">
              {tracking ? 'Mise à jour toutes les 5 minutes' : 'Désactivé'}
            </Text>
          </View>
          <Switch
            value={tracking}
            onValueChange={handleTrackingToggle}
            trackColor={{ false: '#d1d5db', true: '#1e40af' }}
            thumbColor="white"
          />
        </View>

        {/* Bouton envoi ponctuel */}
        <TouchableOpacity
          onPress={handlePushLocation}
          disabled={pushing}
          className="flex-row items-center justify-center rounded-xl py-2.5 mb-3"
          style={{ backgroundColor: pushing ? '#e0e7ff' : '#eef2ff', borderWidth: 1, borderColor: pushing ? '#a5b4fc' : '#c7d2fe' }}
        >
          <Text className="text-base mr-2">{pushing ? '⏳' : '📍'}</Text>
          <Text className="font-semibold text-indigo-700 text-sm">
            {pushing ? 'Envoi en cours…' : 'Mettre à jour ma position'}
          </Text>
        </TouchableOpacity>

        {/* Feedback push */}
        {pushMsg && (
          <View
            className="rounded-xl px-3 py-2 mb-2"
            style={{ backgroundColor: pushMsg.ok ? '#dcfce7' : '#fee2e2' }}
          >
            <Text
              className="text-xs font-semibold text-center"
              style={{ color: pushMsg.ok ? '#166534' : '#991b1b' }}
            >
              {pushMsg.text}
            </Text>
          </View>
        )}

        {/* Info membre sélectionné */}
        {selectedMember && (
          <View className="bg-primary-50 rounded-2xl px-4 py-3 mb-3 border border-primary-100">
            <View className="flex-row items-center justify-between">
              <Text className="font-semibold text-primary-800">
                {selectedMember.full_name ?? selectedMember.email}
              </Text>
              <TouchableOpacity onPress={() => setSelectedMember(null)}>
                <Text className="text-gray-400 text-lg">✕</Text>
              </TouchableOpacity>
            </View>
            {memberLocations[selectedMember.id] && (<>
              <Text className="text-xs text-primary-600 mt-1">
                Dernière position : {formatTime(memberLocations[selectedMember.id].updated_at)}
              </Text>
              {isStale(memberLocations[selectedMember.id].updated_at) && (
                <Text className="text-xs mt-1" style={{ color: '#f59e0b' }}>
                  ⚠️ Position non récente — vérifiez que le partage est activé sur son téléphone.
                </Text>
              )}
            </>)}
          </View>
        )}

        {/* Liste des membres scrollable */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {members.map((member, idx) => {
            const hasLoc = !!memberLocations[member.id];
            const color = MEMBER_COLORS[idx % MEMBER_COLORS.length];
            return (
              <TouchableOpacity
                key={member.id}
                className="items-center mr-4"
                onPress={() => focusMember(member)}
              >
                <View
                  className="w-12 h-12 rounded-full items-center justify-center border-2"
                  style={{
                    backgroundColor: hasLoc ? color : '#e5e7eb',
                    borderColor: selectedMember?.id === member.id ? '#1e40af' : 'transparent',
                  }}
                >
                  <Text className="text-white font-bold">
                    {(member.full_name ?? member.email ?? '?')[0].toUpperCase()}
                  </Text>
                </View>
                <Text className="text-xs text-gray-600 mt-1 text-center" numberOfLines={1}>
                  {(member.full_name ?? member.email ?? '').split(' ')[0]}
                </Text>
                <View
                  className="w-2 h-2 rounded-full mt-0.5"
                  style={{ backgroundColor: hasLoc ? '#22c55e' : '#d1d5db' }}
                />
              </TouchableOpacity>
            );
          })}
          {members.length === 0 && (
            <Text className="text-gray-400 text-sm py-3">
              Aucun membre — ajoutez votre famille via l'onglet Famille
            </Text>
          )}
        </ScrollView>
      </View>
    </View>
  );
}
