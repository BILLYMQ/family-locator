import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useFamily } from '@/hooks/useFamily';
import { useLocation } from '@/hooks/useLocation';
import { FamilyMember, Location } from '@/types/database';

type LMap    = import('leaflet').Map;
type LMarker = import('leaflet').Marker;

const MAP_CONTAINER_ID = 'familylocator-leaflet-map';
const MEMBER_COLORS    = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#06b6d4'];

function injectLeafletCSS() {
  if (document.getElementById('leaflet-css')) return;
  const link = document.createElement('link');
  link.id   = 'leaflet-css';
  link.rel  = 'stylesheet';
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.appendChild(link);
}

function formatTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)    return "À l'instant";
  if (diff < 3_600_000) return `Il y a ${Math.floor(diff / 60_000)} min`;
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export default function MapScreen() {
  const { user }    = useAuth();
  const { members } = useFamily(user?.id);
  const { currentLocation, tracking, permissionDenied, enableTracking, disableTracking } = useLocation();

  const mapRef           = useRef<LMap | null>(null);
  const userMarkerRef    = useRef<LMarker | null>(null);
  const memberMarkersRef = useRef<Map<string, LMarker>>(new Map());

  const [memberLocations, setMemberLocations] = useState<Record<string, Location>>({});
  const [selectedMember,  setSelectedMember]  = useState<FamilyMember | null>(null);

  // ── Init carte via useFocusEffect ──────────────────────────────────────────
  // Le layout React Navigation n'est stable qu'APRÈS le focus du screen.
  // On utilise document.getElementById (bypass des quirks ref RNW) + délai 150ms.
  useFocusEffect(
    useCallback(() => {
      injectLeafletCSS();
      let timer: ReturnType<typeof setTimeout>;

      const tryInit = () => {
        const container = document.getElementById(MAP_CONTAINER_ID) as HTMLDivElement | null;
        if (!container) return;

        if (mapRef.current) {
          // Screen refocalisé — recalcule les dimensions
          mapRef.current.invalidateSize({ animate: false });
          return;
        }

        if (container.offsetWidth === 0 || container.offsetHeight === 0) {
          // Dimensions pas encore calculées — réessaie dans 100ms
          timer = setTimeout(tryInit, 100);
          return;
        }

        import('leaflet').then(L => {
          if (mapRef.current) return; // déjà initialisé par un timer concurrent

          const map = L.map(container, {
            center:      [20, 0],
            zoom:        2,
            zoomControl: false,
          });

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 19,
          }).addTo(map);

          // Zoom coin bas-droit (Google Maps style)
          L.control.zoom({ position: 'bottomright' }).addTo(map);

          mapRef.current = map;
          setTimeout(() => map.invalidateSize({ animate: false }), 200);
        });
      };

      timer = setTimeout(tryInit, 150);
      return () => clearTimeout(timer);
    }, [])
  );

  // ── Nettoyage au démontage ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current     = null;
      userMarkerRef.current = null;
      memberMarkersRef.current.clear();
    };
  }, []);

  // ── Marker utilisateur ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentLocation || !mapRef.current) return;
    const { latitude, longitude } = currentLocation.coords;

    import('leaflet').then(L => {
      const map = mapRef.current;
      if (!map) return;

      const icon = L.divIcon({
        html: `<div style="width:18px;height:18px;background:#1e40af;border-radius:50%;border:3px solid white;box-shadow:0 0 0 4px rgba(30,64,175,0.25),0 2px 8px rgba(0,0,0,0.3);"></div>`,
        className: '', iconSize: [18, 18], iconAnchor: [9, 9],
      });

      if (!userMarkerRef.current) {
        userMarkerRef.current = L.marker([latitude, longitude], { icon, zIndexOffset: 1000 })
          .bindPopup('<b>Ma position</b>').addTo(map);
        map.flyTo([latitude, longitude], 15, { animate: true, duration: 1.2 });
      } else {
        userMarkerRef.current.setLatLng([latitude, longitude]);
      }
    });
  }, [currentLocation]);

  // ── Markers membres ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    import('leaflet').then(L => {
      const map = mapRef.current;
      if (!map) return;

      members.forEach((member, idx) => {
        const loc     = memberLocations[member.id];
        const color   = MEMBER_COLORS[idx % MEMBER_COLORS.length];
        const initial = (member.full_name ?? member.email ?? '?')[0].toUpperCase();
        const sel     = selectedMember?.id === member.id;

        const icon = L.divIcon({
          html: `<div style="background:${color};width:42px;height:42px;border-radius:50%;border:${sel ? '3px solid #1e40af' : '2px solid white'};display:flex;align-items:center;justify-content:center;font-weight:700;color:white;font-size:17px;box-shadow:0 3px 8px rgba(0,0,0,.3);font-family:sans-serif;line-height:42px;text-align:center;">${initial}</div>`,
          className: '', iconSize: [42, 42], iconAnchor: [21, 21], popupAnchor: [0, -25],
        });

        if (loc) {
          const existing = memberMarkersRef.current.get(member.id);
          const popup = `<b>${member.full_name ?? member.email}</b><br/><small>🕐 ${formatTime(loc.updated_at)}</small>`;
          if (!existing) {
            const marker = L.marker([loc.latitude, loc.longitude], { icon })
              .bindPopup(popup).addTo(map);
            marker.on('click', () => setSelectedMember(m => m?.id === member.id ? null : member));
            memberMarkersRef.current.set(member.id, marker);
          } else {
            existing.setLatLng([loc.latitude, loc.longitude]);
            existing.setIcon(icon);
            existing.setPopupContent(popup);
          }
        } else {
          const existing = memberMarkersRef.current.get(member.id);
          if (existing) { map.removeLayer(existing); memberMarkersRef.current.delete(member.id); }
        }
      });

      memberMarkersRef.current.forEach((marker, id) => {
        if (!members.find(m => m.id === id)) {
          map.removeLayer(marker);
          memberMarkersRef.current.delete(id);
        }
      });
    });
  }, [members, memberLocations, selectedMember]);

  // ── Supabase realtime ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || members.length === 0) return;
    const ids = members.map(m => m.id);

    supabase.from('locations').select('*').in('user_id', ids).then(({ data }) => {
      if (!data) return;
      const acc: Record<string, Location> = {};
      (data as Location[]).forEach(l => { acc[l.user_id] = l; });
      setMemberLocations(acc);
    });

    const channel = supabase
      .channel(`web_locations_${user.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'locations', filter: `user_id=in.(${ids.join(',')})` },
        payload => {
          if (payload.eventType === 'DELETE') {
            setMemberLocations(prev => { const n = { ...prev }; delete n[(payload.old as { user_id: string }).user_id]; return n; });
          } else {
            const loc = payload.new as Location;
            setMemberLocations(prev => ({ ...prev, [loc.user_id]: loc }));
          }
        })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, members]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function flyToMember(member: FamilyMember) {
    const loc = memberLocations[member.id];
    if (!loc || !mapRef.current) return;
    mapRef.current.flyTo([loc.latitude, loc.longitude], 16, { animate: true, duration: 1 });
    setSelectedMember(member);
  }

  function flyToMe() {
    if (!currentLocation || !mapRef.current) return;
    const { latitude, longitude } = currentLocation.coords;
    mapRef.current.flyTo([latitude, longitude], 16, { animate: true, duration: 1 });
  }

  // ── Rendu ───────────────────────────────────────────────────────────────────
  if (permissionDenied) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#f9fafb' }}>
        <Text style={{ fontSize: 52, marginBottom: 16 }}>📍</Text>
        <Text style={{ fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 8, textAlign: 'center' }}>Localisation refusée</Text>
        <Text style={{ color: '#6b7280', textAlign: 'center', lineHeight: 22 }}>
          Cliquez sur 📍 dans la barre d'adresse et autorisez la géolocalisation.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* ── Conteneur carte : id stable > ref pour Leaflet dans RNW ── */}
      <div
        id={MAP_CONTAINER_ID}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />

      {/* ── Bouton recentrer (flottant, coin bas gauche) ── */}
      {currentLocation && (
        <View style={{ position: 'absolute', bottom: 200, left: 12, zIndex: 1001 }}>
          <TouchableOpacity
            onPress={flyToMe}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 6 }}
          >
            <Text style={{ fontSize: 20 }}>🎯</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Panneau flottant bas ── */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 1000 }}>
        <View style={{ backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 6, paddingHorizontal: 16, paddingBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 16 }}>

          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb', alignSelf: 'center', marginBottom: 10 }} />

          {/* Toggle tracking */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <Text style={{ fontSize: 16, marginRight: 8 }}>{tracking ? '📡' : '📴'}</Text>
              <View>
                <Text style={{ fontWeight: '600', color: '#111827', fontSize: 13 }}>Partager ma position</Text>
                <Text style={{ fontSize: 11, color: '#9ca3af' }}>
                  {tracking ? 'Toutes les 5 min' : 'Famille ne peut pas vous voir'}
                </Text>
              </View>
            </View>
            <Switch
              value={tracking}
              onValueChange={v => { if (v) enableTracking(); else disableTracking(); }}
              trackColor={{ false: '#e5e7eb', true: '#1e40af' }}
              thumbColor="white"
            />
          </View>

          {/* Infos membre sélectionné */}
          {selectedMember && (
            <View style={{ backgroundColor: '#eff6ff', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#bfdbfe' }}>
              <View>
                <Text style={{ fontWeight: '600', color: '#1e40af', fontSize: 13 }}>
                  {selectedMember.full_name ?? selectedMember.email}
                </Text>
                {memberLocations[selectedMember.id] && (
                  <Text style={{ fontSize: 11, color: '#3b82f6', marginTop: 1 }}>
                    🕐 {formatTime(memberLocations[selectedMember.id].updated_at)}
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={() => setSelectedMember(null)} style={{ padding: 4 }}>
                <Text style={{ color: '#9ca3af', fontSize: 16 }}>✕</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Liste membres */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {members.map((member, idx) => {
              const hasLoc  = !!memberLocations[member.id];
              const color   = MEMBER_COLORS[idx % MEMBER_COLORS.length];
              const initial = (member.full_name ?? member.email ?? '?')[0].toUpperCase();
              const isSel   = selectedMember?.id === member.id;
              return (
                <TouchableOpacity key={member.id} onPress={() => flyToMember(member)} style={{ alignItems: 'center', marginRight: 14 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: hasLoc ? color : '#e5e7eb', alignItems: 'center', justifyContent: 'center', borderWidth: isSel ? 2.5 : 0, borderColor: '#1e40af' }}>
                    <Text style={{ color: 'white', fontWeight: '700', fontSize: 16 }}>{initial}</Text>
                  </View>
                  <Text style={{ fontSize: 10, color: '#374151', marginTop: 3, fontWeight: isSel ? '700' : '400' }} numberOfLines={1}>
                    {(member.full_name ?? member.email ?? '').split(' ')[0]}
                  </Text>
                  <View style={{ width: 5, height: 5, borderRadius: 3, marginTop: 2, backgroundColor: hasLoc ? '#22c55e' : '#d1d5db' }} />
                </TouchableOpacity>
              );
            })}
            {members.length === 0 && (
              <Text style={{ color: '#9ca3af', fontSize: 12, paddingVertical: 8 }}>
                👨‍👩‍👧 Invitez votre famille pour voir leurs positions
              </Text>
            )}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}
