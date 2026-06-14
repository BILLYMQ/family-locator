// ── CSS Leaflet CDN — injection synchrone au chargement du module ─────────────
// "import 'leaflet/dist/leaflet.css'" est absent volontairement :
//   Metro ne résout pas les url(images/…) internes de Leaflet.
//   react-leaflet v5 utilise le hook use() de React 19 → incompatible React 18.
// Cette injection se fait avant tout rendu React, garantissant que le CSS est
// disponible quand L.map() initialise la carte.
if (typeof document !== 'undefined' && !document.getElementById('leaflet-cdn-css')) {
  const _l  = document.createElement('link');
  _l.id     = 'leaflet-cdn-css';
  _l.rel    = 'stylesheet';
  _l.href   = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.insertBefore(_l, document.head.firstChild);
}

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import L from 'leaflet';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useFamily } from '@/hooks/useFamily';
import { useLocation } from '@/hooks/useLocation.web';
import { FamilyMember, Location } from '@/types/database';

// ── Constantes ────────────────────────────────────────────────────────────────
const COLORS: string[]                = ['#6366f1', '#06b6d4', '#f59e0b', '#ec4899', '#84cc16', '#f97316'];
const DEFAULT_CENTER: [number, number] = [48.8566, 2.3522];

// ── CSS thème sombre + animation pulse ────────────────────────────────────────
const DARK_STYLES = `
  @keyframes fl-pulse {
    0%   { transform: scale(1);   opacity: 0.55; }
    100% { transform: scale(3.8); opacity: 0; }
  }
  .fl-pulse { animation: fl-pulse 2.2s ease-out infinite; }
  .leaflet-container { background: #0d0d14 !important; }
  .leaflet-control-zoom { display: none !important; }
  .leaflet-control-attribution {
    background: rgba(0,0,0,0.5) !important;
    color: rgba(255,255,255,0.35) !important;
    font-size: 9px !important;
  }
  .leaflet-control-attribution a { color: rgba(255,255,255,0.45) !important; }
  .leaflet-popup-content-wrapper {
    background: rgba(12,12,20,0.96) !important;
    color: rgba(255,255,255,0.92) !important;
    border-radius: 14px !important;
    border: 1px solid rgba(255,255,255,0.07) !important;
    box-shadow: 0 8px 40px rgba(0,0,0,0.7) !important;
  }
  .leaflet-popup-tip      { background: rgba(12,12,20,0.96) !important; }
  .leaflet-popup-close-button { color: rgba(255,255,255,0.4) !important; }
`;

function injectDarkStyles() {
  if (typeof document === 'undefined' || document.getElementById('fl-dark-styles')) return;
  const s = document.createElement('style');
  s.id    = 'fl-dark-styles';
  s.textContent = DARK_STYLES;
  document.head.appendChild(s);
}

// ── Attend que le CSS CDN soit chargé ────────────────────────────────────────
function waitForLeafletCSS(): Promise<void> {
  return new Promise(resolve => {
    const link = document.getElementById('leaflet-cdn-css') as HTMLLinkElement | null;
    if (!link || link.sheet) { resolve(); return; }
    link.addEventListener('load',  () => resolve(), { once: true });
    link.addEventListener('error', () => resolve(), { once: true });
    setTimeout(resolve, 3000); // fallback de sécurité
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatTime(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60_000)    return "À l'instant";
  if (d < 3_600_000) return `Il y a ${Math.floor(d / 60_000)} min`;
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function makeUserIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize:  [22, 22],
    iconAnchor:[11, 11],
    html: `
      <div style="position:relative;width:22px;height:22px">
        <div class="fl-pulse" style="position:absolute;inset:-8px;background:#3b82f6;border-radius:50%;"></div>
        <div style="position:absolute;inset:0;background:#3b82f6;border-radius:50%;
                    border:2.5px solid white;
                    box-shadow:0 0 0 2px rgba(59,130,246,.4),0 4px 14px rgba(59,130,246,.7);">
        </div>
      </div>`,
  });
}

function makeMemberIcon(initial: string, color: string, selected: boolean): L.DivIcon {
  const shadow = selected
    ? `box-shadow:0 0 0 3px ${color},0 8px 28px rgba(0,0,0,.7);`
    : 'box-shadow:0 4px 18px rgba(0,0,0,.6);';
  const border = selected ? '3.5px solid white' : '2.5px solid rgba(255,255,255,.85)';
  return L.divIcon({
    className:   '',
    iconSize:    [48, 48],
    iconAnchor:  [24, 24],
    popupAnchor: [0, -28],
    html: `
      <div style="width:48px;height:48px;border-radius:50%;background:${color};
                  border:${border};${shadow}
                  display:flex;align-items:center;justify-content:center;
                  font-size:19px;font-weight:700;color:white;
                  font-family:-apple-system,BlinkMacSystemFont,sans-serif;
                  line-height:1;text-align:center;">
        ${initial}
      </div>`,
  });
}

// ── Styles partagés ───────────────────────────────────────────────────────────
const glass: React.CSSProperties = {
  backdropFilter:       'blur(22px)',
  WebkitBackdropFilter: 'blur(22px)',
  backgroundColor:      'rgba(8, 8, 14, 0.90)',
  borderTop:            '1px solid rgba(255,255,255,0.07)',
};

const pillBtn: React.CSSProperties = {
  backdropFilter:       'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  backgroundColor:      'rgba(255,255,255,0.08)',
  border:               '1px solid rgba(255,255,255,0.12)',
  borderRadius:         '999px',
  padding:              '8px 14px',
  display:              'flex',
  alignItems:           'center',
  gap:                  '6px',
  cursor:               'pointer',
};

// ══════════════════════════════════════════════════════════════════════════════
export default function MapScreen() {
  const { user }    = useAuth();
  const { members } = useFamily(user?.id);
  const {
    currentLocation, tracking, permissionDenied,
    enableTracking, disableTracking, pushLocation,
  } = useLocation();

  // ── Refs Leaflet ──────────────────────────────────────────────────────────
  const containerRef      = useRef<HTMLDivElement | null>(null);
  const mapRef            = useRef<L.Map | null>(null);
  const userMarkerRef     = useRef<L.Marker | null>(null);
  const memberMarkersRef  = useRef<Record<string, L.Marker>>({});

  // ── État ──────────────────────────────────────────────────────────────────
  const [mapSize, setMapSize]             = useState({ w: 0, h: 0 });
  const [mapReady, setMapReady]           = useState(false);
  const [memberLocations, setMemberLocations] = useState<Record<string, Location>>({});
  const [selectedMember,  setSelectedMember]  = useState<FamilyMember | null>(null);
  const [pushing,         setPushing]         = useState(false);
  const [pushMsg,         setPushMsg]         = useState<{ ok: boolean; text: string } | null>(null);
  const [onlineCount,     setOnlineCount]     = useState(0);

  const userCenter: [number, number] | null = currentLocation
    ? [currentLocation.coords.latitude, currentLocation.coords.longitude]
    : null;

  // ── CSS thème sombre ──────────────────────────────────────────────────────
  useEffect(() => { injectDarkStyles(); }, []);

  // ── Layout du conteneur → dimensions pour Leaflet ────────────────────────
  function onContainerLayout(e: any) {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setMapSize({ w: Math.round(width), h: Math.round(height) });
  }

  // ── Initialisation Leaflet (attend CSS + layout) ──────────────────────────
  useEffect(() => {
    if (mapSize.w === 0 || mapSize.h === 0) return;

    // Redimensionnement après init → invalider la taille
    if (mapRef.current) {
      const c = containerRef.current;
      if (c) { c.style.width = `${mapSize.w}px`; c.style.height = `${mapSize.h}px`; }
      mapRef.current.invalidateSize({ animate: false });
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;

    waitForLeafletCSS().then(() => {
      // Vérifier que le conteneur n'a pas déjà une carte (React StrictMode)
      if (cancelled || !container || (container as any)._leaflet_id) return;

      container.style.width  = `${mapSize.w}px`;
      container.style.height = `${mapSize.h}px`;

      const map = L.map(container, {
        center:           DEFAULT_CENTER,
        zoom:             2,
        zoomControl:      false,
        attributionControl: true,
      });

      // Tuiles OSM (fiables, pas de token requis)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 20,
      }).addTo(map);

      // CartoDB Dark Matter (décommenter après validation OSM)
      // L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      //   attribution: '&copy; OSM &copy; CARTO',
      //   subdomains: 'abcd',
      //   maxZoom: 20,
      // }).addTo(map);

      mapRef.current = map;
      if (!cancelled) setMapReady(true);
    });

    return () => { cancelled = true; };
  }, [mapSize]);

  // ── Nettoyage à l'unmount ─────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      Object.values(memberMarkersRef.current).forEach(m => m.remove());
      memberMarkersRef.current = {};
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // ── Focus tab → invalidate size ───────────────────────────────────────────
  useFocusEffect(useCallback(() => {
    const t = setTimeout(() => mapRef.current?.invalidateSize({ animate: false }), 80);
    return () => clearTimeout(t);
  }, []));

  // ── Marqueur utilisateur ──────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current || !userCenter) return;
    if (!userMarkerRef.current) {
      userMarkerRef.current = L.marker(userCenter, {
        icon: makeUserIcon(),
        zIndexOffset: 1000,
      }).addTo(mapRef.current);
      mapRef.current.flyTo(userCenter, 15, { animate: true, duration: 1.2 });
    } else {
      userMarkerRef.current.setLatLng(userCenter);
    }
  }, [userCenter, mapReady]);

  // ── Marqueurs membres ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    members.forEach((member, idx) => {
      const loc     = memberLocations[member.id];
      const color   = COLORS[idx % COLORS.length];
      const initial = (member.full_name ?? member.email ?? '?')[0].toUpperCase();
      const sel     = selectedMember?.id === member.id;

      if (loc) {
        const existing = memberMarkersRef.current[member.id];
        if (existing) {
          existing.setLatLng([loc.latitude, loc.longitude]);
          existing.setIcon(makeMemberIcon(initial, color, sel));
        } else {
          const marker = L.marker([loc.latitude, loc.longitude], {
            icon: makeMemberIcon(initial, color, sel),
          });
          marker.on('click', () => {
            setSelectedMember(m => m?.id === member.id ? null : member);
          });
          marker.addTo(mapRef.current!);
          memberMarkersRef.current[member.id] = marker;
        }
      } else if (memberMarkersRef.current[member.id]) {
        memberMarkersRef.current[member.id].remove();
        delete memberMarkersRef.current[member.id];
      }
    });

    // Retirer les marqueurs de membres supprimés
    Object.keys(memberMarkersRef.current).forEach(id => {
      if (!members.find(m => m.id === id)) {
        memberMarkersRef.current[id].remove();
        delete memberMarkersRef.current[id];
      }
    });
  }, [memberLocations, members, selectedMember, mapReady]);

  // ── Realtime positions membres ────────────────────────────────────────────
  useEffect(() => {
    if (!user || members.length === 0) return;
    const ids = members.map(m => m.id);

    supabase.from('locations').select('*').in('user_id', ids).then(({ data }) => {
      if (!data) return;
      const acc: Record<string, Location> = {};
      (data as Location[]).forEach(l => { acc[l.user_id] = l; });
      setMemberLocations(acc);
    });

    const ch = supabase
      .channel(`map_locs_${Date.now()}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'locations', filter: `user_id=in.(${ids.join(',')})` },
        payload => {
          if (payload.eventType === 'DELETE') {
            setMemberLocations(p => {
              const n = { ...p };
              delete n[(payload.old as { user_id: string }).user_id];
              return n;
            });
          } else {
            const loc = payload.new as Location;
            setMemberLocations(p => ({ ...p, [loc.user_id]: loc }));
          }
        })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [user, members]);

  useEffect(() => {
    setOnlineCount(members.filter(m => !!memberLocations[m.id]).length);
  }, [members, memberLocations]);

  // ── Actions ───────────────────────────────────────────────────────────────
  function flyToMe() {
    if (userCenter && mapRef.current) {
      mapRef.current.flyTo(userCenter, 15, { animate: true, duration: 1.2 });
    }
  }

  function flyToMember(m: FamilyMember) {
    const loc = memberLocations[m.id];
    if (!loc || !mapRef.current) return;
    setSelectedMember(m);
    mapRef.current.flyTo([loc.latitude, loc.longitude], 15, { animate: true, duration: 1.2 });
  }

  function zoomIn()  { mapRef.current?.zoomIn(); }
  function zoomOut() { mapRef.current?.zoomOut(); }

  async function handlePushLocation() {
    if (pushing) return;
    setPushing(true);
    setPushMsg(null);
    const r = await pushLocation();
    setPushing(false);
    setPushMsg(r.success
      ? { ok: true,  text: '✓ Position envoyée !' }
      : { ok: false, text: r.error ?? 'Erreur' });
    setTimeout(() => setPushMsg(null), 4000);
  }

  // ── Rendu ─────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: '#0d0d14' }} onLayout={onContainerLayout}>

      {/* ════ CONTENEUR LEAFLET ════ */}
      {mapSize.h > 0 && (
        <div
          ref={containerRef}
          style={{ position: 'absolute', top: 0, left: 0, zIndex: 0 }}
        />
      )}

      {/* ════ BANDEAU PERMISSION ════ */}
      {permissionDenied && (
        <div style={{
          position: 'absolute', top: 14, left: 14, right: 14, zIndex: 1020,
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          backgroundColor: 'rgba(30,30,40,0.92)',
          border: '1px solid rgba(239,68,68,.4)',
          borderRadius: 14, padding: '12px 14px',
          display: 'flex', alignItems: 'center', gap: '10px',
          boxShadow: '0 4px 24px rgba(0,0,0,.5)',
        }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>📍</span>
          <div style={{ flex: 1 }}>
            <div style={{ color: 'rgba(255,255,255,.9)', fontSize: 13, fontWeight: 700, fontFamily: 'sans-serif', marginBottom: 2 }}>
              Localisation désactivée
            </div>
            <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 11, fontFamily: 'sans-serif' }}>
              Cliquez sur 🔒 → Position → Autoriser, puis Réessayer
            </div>
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#3b82f6', border: 'none', borderRadius: 10,
              color: 'white', fontSize: 12, fontWeight: 700, fontFamily: 'sans-serif',
              padding: '7px 14px', cursor: 'pointer', flexShrink: 0,
            }}
          >🔄 Réessayer</button>
        </div>
      )}

      {/* ════ CONTRÔLES FLOTTANTS TOP-RIGHT ════ */}
      <div style={{
        position: 'absolute', top: 14, right: 14, zIndex: 1010,
        display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end',
      }}>
        {members.length > 0 && (
          <div style={pillBtn}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
            <span style={{ color: 'rgba(255,255,255,.85)', fontSize: 13, fontWeight: 600, fontFamily: 'sans-serif' }}>
              {onlineCount}/{members.length} en ligne
            </span>
          </div>
        )}

        <div style={{
          backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          backgroundColor: 'rgba(255,255,255,.08)',
          border: '1px solid rgba(255,255,255,.12)',
          borderRadius: 12, overflow: 'hidden',
        }}>
          {[{ label: '+', action: zoomIn }, { label: '−', action: zoomOut }].map(({ label, action }) => (
            <button key={label} onClick={action} style={{
              display: 'block', width: 40, height: 40,
              background: 'none', border: 'none',
              borderBottom: label === '+' ? '1px solid rgba(255,255,255,.08)' : 'none',
              color: 'rgba(255,255,255,.85)', fontSize: 20, cursor: 'pointer',
              fontFamily: 'sans-serif', lineHeight: '40px', textAlign: 'center',
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* ════ BOUTON RECENTRER ════ */}
      {userCenter && (
        <div onClick={flyToMe} style={{
          position: 'absolute', right: 14, bottom: 220, zIndex: 1010,
          backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          backgroundColor: 'rgba(255,255,255,.08)',
          border: '1px solid rgba(255,255,255,.12)',
          width: 50, height: 50, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(59,130,246,.35)',
        }}>
          <span style={{ fontSize: 22 }}>🎯</span>
        </div>
      )}

      {/* ════ PANNEAU BAS GLASSMORPHISM ════ */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 1000,
        ...glass,
        borderRadius: '20px 20px 0 0',
        padding: '8px 16px 20px',
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 9, backgroundColor: 'rgba(255,255,255,.18)', margin: '0 auto 14px' }} />

        {/* Toggle suivi */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>{tracking ? '📡' : '📴'}</span>
            <div>
              <div style={{ fontWeight: 600, color: 'rgba(255,255,255,.9)', fontSize: 13, fontFamily: 'sans-serif' }}>
                Partager ma position
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.38)', fontFamily: 'sans-serif', marginTop: 1 }}>
                {tracking ? 'Mise à jour toutes les 5 min' : 'Famille ne peut pas vous voir'}
              </div>
            </div>
          </div>
          <Switch
            value={tracking}
            onValueChange={v => { if (v) enableTracking(); else disableTracking(); }}
            trackColor={{ false: 'rgba(255,255,255,.12)', true: '#3b82f6' }}
            thumbColor="white"
          />
        </div>

        {/* Bouton envoi ponctuel */}
        <TouchableOpacity
          onPress={handlePushLocation}
          disabled={pushing}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            backgroundColor: pushing ? 'rgba(99,102,241,.2)' : 'rgba(99,102,241,.15)',
            borderRadius: 12, paddingVertical: 10, marginBottom: 6,
            borderWidth: 1, borderColor: pushing ? 'rgba(99,102,241,.5)' : 'rgba(99,102,241,.3)',
          }}
        >
          <Text style={{ fontSize: 16, marginRight: 6 }}>{pushing ? '⏳' : '📍'}</Text>
          <Text style={{ fontWeight: '600', color: '#a5b4fc', fontSize: 13 }}>
            {pushing ? 'Envoi en cours…' : 'Mettre à jour ma position'}
          </Text>
        </TouchableOpacity>

        {/* Feedback */}
        {pushMsg && (
          <View style={{
            borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 8,
            backgroundColor: pushMsg.ok ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.15)',
            borderWidth: 1, borderColor: pushMsg.ok ? 'rgba(34,197,94,.35)' : 'rgba(239,68,68,.35)',
          }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: pushMsg.ok ? '#86efac' : '#fca5a5' }}>
              {pushMsg.text}
            </Text>
          </View>
        )}

        {/* Membre sélectionné */}
        {selectedMember && (
          <View style={{
            backgroundColor: 'rgba(99,102,241,.12)', borderRadius: 12,
            paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            borderWidth: 1, borderColor: 'rgba(99,102,241,.3)',
          }}>
            <View>
              <Text style={{ fontWeight: '600', color: '#a5b4fc', fontSize: 13 }}>
                {selectedMember.full_name ?? selectedMember.email}
              </Text>
              {memberLocations[selectedMember.id] && (
                <Text style={{ fontSize: 11, color: 'rgba(165,180,252,.6)', marginTop: 1 }}>
                  🕐 {formatTime(memberLocations[selectedMember.id].updated_at)}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={() => setSelectedMember(null)} style={{ padding: 4 }}>
              <Text style={{ color: 'rgba(255,255,255,.35)', fontSize: 16 }}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Avatars membres */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 2 }}>
          {members.map((member, idx) => {
            const hasLoc  = !!memberLocations[member.id];
            const color   = COLORS[idx % COLORS.length];
            const initial = (member.full_name ?? member.email ?? '?')[0].toUpperCase();
            const isSel   = selectedMember?.id === member.id;
            return (
              <TouchableOpacity key={member.id} onPress={() => flyToMember(member)} style={{ alignItems: 'center', marginRight: 16 }}>
                <View style={{
                  width: 46, height: 46, borderRadius: 23,
                  backgroundColor: color, alignItems: 'center', justifyContent: 'center',
                  borderWidth: isSel ? 2.5 : 1.5,
                  borderColor: isSel ? 'white' : 'rgba(255,255,255,.35)',
                  shadowColor: color, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 8, elevation: 8,
                }}>
                  <Text style={{ color: 'white', fontWeight: '700', fontSize: 17 }}>{initial}</Text>
                </View>
                <Text style={{ fontSize: 10, color: isSel ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.4)', marginTop: 4, fontWeight: isSel ? '700' : '400' }} numberOfLines={1}>
                  {(member.full_name ?? member.email ?? '').split(' ')[0]}
                </Text>
                <View style={{ width: 5, height: 5, borderRadius: 3, marginTop: 2, backgroundColor: hasLoc ? '#22c55e' : 'rgba(255,255,255,.15)' }} />
              </TouchableOpacity>
            );
          })}
          {members.length === 0 && (
            <Text style={{ color: 'rgba(255,255,255,.3)', fontSize: 12, paddingVertical: 10 }}>
              👨‍👩‍👧 Invitez votre famille pour commencer
            </Text>
          )}
        </ScrollView>
      </div>

    </View>
  );
}
