import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { divIcon } from 'leaflet';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useFamily } from '@/hooks/useFamily';
import { useLocation } from '@/hooks/useLocation';
import { FamilyMember, Location } from '@/types/database';

const MEMBER_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#06b6d4'];

// Injecte le CSS Leaflet depuis CDN (Expo web ne supporte pas l'import CSS direct)
function useLeafletCSS() {
  useEffect(() => {
    if (document.getElementById('leaflet-css')) return;
    const link = document.createElement('link');
    link.id   = 'leaflet-css';
    link.rel  = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
  }, []);
}

// Composant interne qui repositionne la carte quand la position change
function FlyToMe({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  const didFly = useRef(false);
  useEffect(() => {
    if (!didFly.current) {
      map.flyTo([lat, lng], 15, { animate: true, duration: 1 });
      didFly.current = true;
    }
  }, [lat, lng, map]);
  return null;
}

function createMemberIcon(initial: string, color: string, selected: boolean) {
  return divIcon({
    html: `
      <div style="
        background:${color};
        width:44px;height:44px;
        border-radius:50%;
        border:${selected ? '3px solid #1e40af' : '2px solid white'};
        display:flex;align-items:center;justify-content:center;
        font-weight:bold;color:white;font-size:18px;
        box-shadow:0 2px 6px rgba(0,0,0,0.35);
        font-family:sans-serif;
        line-height:44px;text-align:center;
      ">${initial}</div>`,
    className: '',
    iconSize:   [44, 44],
    iconAnchor: [22, 22],
    popupAnchor:[0, -26],
  });
}

function createUserIcon() {
  return divIcon({
    html: `
      <div style="
        width:20px;height:20px;
        background:#1e40af;
        border-radius:50%;
        border:3px solid white;
        box-shadow:0 0 0 3px rgba(30,64,175,0.35);
      "></div>`,
    className:  '',
    iconSize:   [20, 20],
    iconAnchor: [10, 10],
  });
}

export default function MapScreen() {
  useLeafletCSS();

  const { user } = useAuth();
  const { members } = useFamily(user?.id);
  const { currentLocation, tracking, permissionDenied, enableTracking, disableTracking } = useLocation();

  const [memberLocations, setMemberLocations] = useState<Record<string, Location>>({});
  const [selectedMember, setSelectedMember]   = useState<FamilyMember | null>(null);

  // Chargement initial + abonnement Realtime
  useEffect(() => {
    if (!user || members.length === 0) return;
    const ids = members.map(m => m.id);

    supabase.from('locations').select('*').in('user_id', ids).then(({ data }) => {
      if (!data) return;
      const map: Record<string, Location> = {};
      data.forEach(l => { map[l.user_id] = l; });
      setMemberLocations(map);
    });

    const channel = supabase
      .channel('web_family_locations')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'locations', filter: `user_id=in.(${ids.join(',')})` },
        payload => {
          if (payload.eventType === 'DELETE') {
            setMemberLocations(prev => { const n = { ...prev }; delete n[(payload.old as Location).user_id]; return n; });
          } else {
            const loc = payload.new as Location;
            setMemberLocations(prev => ({ ...prev, [loc.user_id]: loc }));
          }
        })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, members]);

  function formatTime(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000)     return 'À l\'instant';
    if (diff < 3_600_000)  return `Il y a ${Math.floor(diff / 60_000)} min`;
    return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  const defaultCenter: [number, number] = [48.8566, 2.3522];
  const userCenter: [number, number] | null = currentLocation
    ? [currentLocation.coords.latitude, currentLocation.coords.longitude]
    : null;

  if (permissionDenied) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>📍</Text>
        <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#1f2937', marginBottom: 8 }}>
          Permission refusée
        </Text>
        <Text style={{ color: '#6b7280', textAlign: 'center' }}>
          Autorisez la géolocalisation dans la barre d'adresse de votre navigateur.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Carte Leaflet */}
      <div style={{ flex: 1, minHeight: 0, height: '65vh' }}>
        <MapContainer
          center={userCenter ?? defaultCenter}
          zoom={userCenter ? 15 : 5}
          style={{ height: '100%', width: '100%' }}
          zoomControl
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Marker position actuelle */}
          {userCenter && (
            <>
              <FlyToMe lat={userCenter[0]} lng={userCenter[1]} />
              <Marker position={userCenter} icon={createUserIcon()}>
                <Popup>Votre position</Popup>
              </Marker>
            </>
          )}

          {/* Markers membres famille */}
          {members.map((member, idx) => {
            const loc = memberLocations[member.id];
            if (!loc) return null;
            const color   = MEMBER_COLORS[idx % MEMBER_COLORS.length];
            const initial = (member.full_name ?? member.email ?? '?')[0].toUpperCase();
            const selected = selectedMember?.id === member.id;
            return (
              <Marker
                key={member.id}
                position={[loc.latitude, loc.longitude]}
                icon={createMemberIcon(initial, color, selected)}
                eventHandlers={{ click: () => setSelectedMember(member) }}
              >
                <Popup>
                  <strong>{member.full_name ?? member.email}</strong>
                  <br />
                  {formatTime(loc.updated_at)}
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      {/* Panneau bas */}
      <View style={{ backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, boxShadow: '0 -4px 20px rgba(0,0,0,0.08)' } as any}>
        {/* Toggle tracking */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
          <View>
            <Text style={{ fontWeight: '600', color: '#1f2937' }}>Partager ma position</Text>
            <Text style={{ fontSize: 12, color: '#9ca3af' }}>
              {tracking ? 'Mise à jour toutes les 5 minutes' : 'Désactivé'}
            </Text>
          </View>
          <Switch
            value={tracking}
            onValueChange={v => v ? enableTracking() : disableTracking()}
            trackColor={{ false: '#d1d5db', true: '#1e40af' }}
            thumbColor="white"
          />
        </View>

        {/* Info membre sélectionné */}
        {selectedMember && (
          <View style={{ backgroundColor: '#eff6ff', borderRadius: 16, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#dbeafe', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ fontWeight: '600', color: '#1e40af' }}>
                {selectedMember.full_name ?? selectedMember.email}
              </Text>
              {memberLocations[selectedMember.id] && (
                <Text style={{ fontSize: 12, color: '#3b82f6', marginTop: 2 }}>
                  {formatTime(memberLocations[selectedMember.id].updated_at)}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={() => setSelectedMember(null)}>
              <Text style={{ color: '#9ca3af', fontSize: 18 }}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Liste membres */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {members.map((member, idx) => {
            const hasLoc  = !!memberLocations[member.id];
            const color   = MEMBER_COLORS[idx % MEMBER_COLORS.length];
            const initial = (member.full_name ?? member.email ?? '?')[0].toUpperCase();
            return (
              <TouchableOpacity
                key={member.id}
                style={{ alignItems: 'center', marginRight: 16 }}
                onPress={() => {
                  const loc = memberLocations[member.id];
                  if (loc) setSelectedMember(member);
                }}
              >
                <View style={{
                  width: 48, height: 48, borderRadius: 24,
                  backgroundColor: hasLoc ? color : '#e5e7eb',
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 2,
                  borderColor: selectedMember?.id === member.id ? '#1e40af' : 'transparent',
                }}>
                  <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 18 }}>{initial}</Text>
                </View>
                <Text style={{ fontSize: 12, color: '#4b5563', marginTop: 4 }} numberOfLines={1}>
                  {(member.full_name ?? member.email ?? '').split(' ')[0]}
                </Text>
                <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 2, backgroundColor: hasLoc ? '#22c55e' : '#d1d5db' }} />
              </TouchableOpacity>
            );
          })}
          {members.length === 0 && (
            <Text style={{ color: '#9ca3af', fontSize: 14, paddingVertical: 12 }}>
              Aucun membre — ajoutez votre famille
            </Text>
          )}
        </ScrollView>
      </View>
    </View>
  );
}
