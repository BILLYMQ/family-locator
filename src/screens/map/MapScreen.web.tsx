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
import { useLocation, DEBUG_GPS } from '@/hooks/useLocation.web';
import { reverseGeocode } from '@/lib/geocoding';
import { FamilyMember, Location, LocationHistory } from '@/types/database';

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

function memberStatus(updatedAt: string | undefined): { color: string; label: string } {
  if (!updatedAt) return { color: 'rgba(255,255,255,.15)', label: '' };
  const mins = (Date.now() - new Date(updatedAt).getTime()) / 60_000;
  if (mins < 1)   return { color: '#22c55e', label: 'En direct' };
  if (mins < 15)  return { color: '#22c55e', label: `${Math.round(mins)}min` };
  if (mins < 60)  return { color: '#f59e0b', label: `${Math.round(mins)}min` };
  const hrs = mins / 60;
  if (hrs  < 24)  return { color: '#ef4444', label: `${Math.round(hrs)}h` };
  return { color: '#6b7280', label: `${Math.floor(hrs / 24)}j` };
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
    debugInfo,
  } = useLocation();

  // ── Refs Leaflet ──────────────────────────────────────────────────────────
  const containerRef      = useRef<HTMLDivElement | null>(null);
  const mapRef            = useRef<L.Map | null>(null);
  const userMarkerRef     = useRef<L.Marker | null>(null);
  const memberMarkersRef  = useRef<Record<string, L.Marker>>({});
  const historyLayerRef   = useRef<L.Polyline | null>(null);

  // ── État ──────────────────────────────────────────────────────────────────
  const [mapSize, setMapSize]             = useState({ w: 0, h: 0 });
  const [mapReady, setMapReady]           = useState(false);
  const [memberLocations, setMemberLocations] = useState<Record<string, Location>>({});
  const [selectedMember,  setSelectedMember]  = useState<FamilyMember | null>(null);
  const [pushing,         setPushing]         = useState(false);
  const [pushMsg,         setPushMsg]         = useState<{ ok: boolean; text: string } | null>(null);
  const [onlineCount,     setOnlineCount]     = useState(0);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [sosState,        setSosState]        = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [showingHistory,  setShowingHistory]  = useState(false);
  const [debugOpen,       setDebugOpen]       = useState(true);

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

  // ── Historique du trajet ──────────────────────────────────────────────────
  function clearHistory() {
    if (historyLayerRef.current) {
      historyLayerRef.current.remove();
      historyLayerRef.current = null;
    }
    setShowingHistory(false);
  }

  async function fetchAndDrawHistory(memberId: string) {
    if (!mapRef.current) return;
    const { data } = await supabase
      .from('location_history')
      .select('latitude, longitude, recorded_at')
      .eq('user_id', memberId)
      .order('recorded_at', { ascending: true })
      .limit(200);

    const rows = (data as Pick<LocationHistory, 'latitude' | 'longitude' | 'recorded_at'>[] | null) ?? [];
    if (rows.length < 2 || !mapRef.current) return;

    clearHistory();
    const latlngs: [number, number][] = rows.map(p => [p.latitude, p.longitude]);
    historyLayerRef.current = L.polyline(latlngs, {
      color: '#6366f1', weight: 4, opacity: 0.8,
    }).addTo(mapRef.current);
    mapRef.current.fitBounds(historyLayerRef.current.getBounds(), { padding: [50, 50] });
    setShowingHistory(true);
  }

  // Efface la polyline si l'on change de membre ou si l'on ferme le panneau
  useEffect(() => { clearHistory(); }, [selectedMember?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Nettoyage à l'unmount ─────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      historyLayerRef.current?.remove();
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
      if (DEBUG_GPS) console.log('[MAP] flyTo position initiale', userCenter, 'zoom 15');
    } else {
      userMarkerRef.current.setLatLng(userCenter);
      if (DEBUG_GPS) console.log('[MAP] marker déplacé →', userCenter);
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

  // ── Géocodage inversé — se déclenche quand un membre est sélectionné ────────
  useEffect(() => {
    setSelectedAddress(null);
    if (!selectedMember) return;
    const loc = memberLocations[selectedMember.id];
    if (!loc) return;
    let cancelled = false;
    reverseGeocode(loc.latitude, loc.longitude).then(addr => {
      if (!cancelled) setSelectedAddress(addr);
    });
    return () => { cancelled = true; };
  }, [selectedMember, memberLocations]);

  // ── Actions ───────────────────────────────────────────────────────────────
  async function handleSOS() {
    if (sosState === 'sending') return;
    const ok = window.confirm(
      `Envoyer une alerte SOS à toute votre famille ?\n\nVotre position actuelle sera transmise immédiatement.`
    );
    if (!ok) return;
    setSosState('sending');
    await pushLocation();
    const { error } = await supabase.functions.invoke('send-sos');
    setSosState(error ? 'error' : 'sent');
    setTimeout(() => setSosState('idle'), 8000);
  }

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
    if (DEBUG_GPS) console.log('[GPS] pushLocation → bouton cliqué');
    setPushing(true);
    setPushMsg(null);
    const r = await pushLocation();
    setPushing(false);
    setPushMsg(r.success
      ? { ok: true,  text: '✓ Position envoyée !' }
      : { ok: false, text: r.error ?? 'Erreur inconnue' });
    if (r.success && r.location && mapRef.current) {
      const center: [number, number] = [r.location.coords.latitude, r.location.coords.longitude];
      if (DEBUG_GPS) console.log('[MAP] flyTo après push manuel', center);
      mapRef.current.flyTo(center, Math.max(mapRef.current.getZoom(), 15), { animate: true, duration: 0.8 });
    }
    setTimeout(() => setPushMsg(null), 5000);
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

      {/* ════ PANNEAU DIAGNOSTIC GPS (DEBUG_GPS=true uniquement) ════ */}
      {DEBUG_GPS && (
        <div style={{
          position: 'absolute', top: 14, left: 14, zIndex: 1025,
          width: 272, fontFamily: 'monospace', fontSize: 11,
        }}>
          {/* Bouton toggle */}
          <button
            onClick={() => setDebugOpen(o => !o)}
            style={{
              width: '100%', textAlign: 'left', cursor: 'pointer',
              background: 'rgba(20,20,36,0.97)', fontFamily: 'monospace', fontSize: 11,
              border: '1px solid rgba(99,102,241,.55)', fontWeight: 700,
              color: '#a5b4fc', padding: '5px 10px',
              borderRadius: debugOpen ? '10px 10px 0 0' : 10,
            }}
          >🔧 DIAG GPS {debugOpen ? '▲' : '▼'}</button>

          {debugOpen && (
            <div style={{
              background: 'rgba(8,8,18,0.97)', color: 'rgba(255,255,255,.82)',
              border: '1px solid rgba(99,102,241,.4)', borderTop: 'none',
              borderRadius: '0 0 10px 10px', padding: '8px 10px',
              maxHeight: 440, overflowY: 'auto', lineHeight: 1.55,
            }}>

              {/* ── Position locale ── */}
              <div style={{ color: '#818cf8', fontWeight: 700, marginBottom: 3 }}>📍 Position locale (navigator)</div>
              {debugInfo.lastLocalPos ? (<>
                <div>Lat : <span style={{ color: '#86efac' }}>{debugInfo.lastLocalPos.lat.toFixed(6)}</span></div>
                <div>Lng : <span style={{ color: '#86efac' }}>{debugInfo.lastLocalPos.lng.toFixed(6)}</span></div>
                <div>Accuracy : {debugInfo.lastLocalPos.accuracy != null ? `${Math.round(debugInfo.lastLocalPos.accuracy)} m` : '—'}</div>
                <div>Timestamp : {debugInfo.lastLocalPos.tsStr}</div>
                {debugInfo.samePos && (
                  <div style={{ color: '#fbbf24', fontWeight: 700, marginTop: 2 }}>
                    ⚠️ Même timestamp = cache navigateur
                  </div>
                )}
              </>) : <div style={{ color: '#6b7280' }}>En attente du GPS…</div>}

              {/* ── Dernier push Supabase ── */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,.08)', margin: '7px 0 4px' }} />
              <div style={{ color: '#818cf8', fontWeight: 700, marginBottom: 3 }}>☁️ Dernier push Supabase</div>
              {debugInfo.lastPushed ? (<>
                <div>Lat : {debugInfo.lastPushed.lat.toFixed(6)}</div>
                <div>Lng : {debugInfo.lastPushed.lng.toFixed(6)}</div>
                <div>updated_at : <span style={{ color: '#86efac' }}>{new Date(debugInfo.lastPushed.updatedAt).toLocaleTimeString('fr-FR')}</span></div>
                <div>Résultat : {debugInfo.lastPushed.ok
                  ? <span style={{ color: '#86efac' }}>✓ OK</span>
                  : <span style={{ color: '#f87171' }}>✗ {debugInfo.lastPushed.error}</span>}
                </div>
              </>) : <div style={{ color: '#6b7280' }}>Aucun push encore</div>}

              {/* ── État suivi ── */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,.08)', margin: '7px 0 4px' }} />
              <div style={{ color: '#818cf8', fontWeight: 700, marginBottom: 3 }}>📡 Suivi</div>
              <div>Tracking : {tracking
                ? <span style={{ color: '#86efac' }}>✓ Actif</span>
                : <span style={{ color: '#6b7280' }}>Inactif</span>}
              </div>
              <div>watchPosition : {debugInfo.watchActive
                ? <span style={{ color: '#86efac' }}>✓ Actif</span>
                : <span style={{ color: '#f87171' }}>✗ Inactif</span>}
              </div>
              <div>watchId : {debugInfo.watchId ?? '—'}</div>
              <div>Erreur GPS : {debugInfo.lastGeoError
                ? <span style={{ color: '#f87171' }}>{debugInfo.lastGeoError}</span>
                : <span style={{ color: '#86efac' }}>—</span>}
              </div>
              <div>Erreur Supabase : {debugInfo.lastSupabaseError
                ? <span style={{ color: '#f87171' }}>{debugInfo.lastSupabaseError}</span>
                : <span style={{ color: '#86efac' }}>—</span>}
              </div>

              {/* ── Permission ── */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,.08)', margin: '7px 0 4px' }} />
              <div style={{ color: '#818cf8', fontWeight: 700, marginBottom: 3 }}>🔒 Permission</div>
              <div>État : <span style={{ fontWeight: 700,
                color: debugInfo.permState === 'granted' ? '#86efac'
                     : debugInfo.permState === 'denied'  ? '#f87171'
                     :                                      '#fbbf24',
              }}>{debugInfo.permState}</span></div>

              {/* ── Avertissement cache ── */}
              {debugInfo.samePos && (
                <div style={{
                  marginTop: 8, padding: '6px 8px', lineHeight: 1.4,
                  background: 'rgba(251,191,36,.1)', border: '1px solid rgba(251,191,36,.35)',
                  borderRadius: 6, color: '#fbbf24', fontSize: 10,
                }}>
                  Le navigateur renvoie encore la même position.{'\n'}
                  Testez sur un téléphone ou vérifiez la localisation système.
                </div>
              )}

              <div style={{ marginTop: 7, color: '#374151', fontSize: 9 }}>
                DEBUG_GPS=true · throttle {tracking ? '5 s' : '—'} · intervalle 30 s
              </div>
            </div>
          )}
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
                {tracking ? 'Actif · mise à jour en temps réel (onglet ouvert)' : 'Famille ne peut pas vous voir'}
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

        {/* Bouton SOS */}
        <TouchableOpacity
          onPress={handleSOS}
          disabled={sosState === 'sending'}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            backgroundColor: sosState === 'sent'    ? 'rgba(34,197,94,.15)'
                           : sosState === 'error'   ? 'rgba(239,68,68,.15)'
                           : sosState === 'sending' ? 'rgba(239,68,68,.1)'
                           :                          'rgba(239,68,68,.12)',
            borderRadius: 12, paddingVertical: 10, marginBottom: 6,
            borderWidth: 1,
            borderColor: sosState === 'sent'  ? 'rgba(34,197,94,.4)'
                       : sosState === 'error' ? 'rgba(239,68,68,.6)'
                       :                        'rgba(239,68,68,.35)',
          }}
        >
          <Text style={{ fontSize: 16, marginRight: 6 }}>
            {sosState === 'sending' ? '⏳' : sosState === 'sent' ? '✅' : sosState === 'error' ? '⚠️' : '🆘'}
          </Text>
          <Text style={{ fontWeight: '600', fontSize: 13,
            color: sosState === 'sent' ? '#86efac' : sosState === 'error' ? '#fca5a5' : '#fca5a5' }}>
            {sosState === 'sending' ? 'Envoi en cours…'
           : sosState === 'sent'    ? 'SOS envoyé à votre famille'
           : sosState === 'error'   ? 'Erreur — réessayez'
           :                          'Alerte SOS'}
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
            borderWidth: 1, borderColor: 'rgba(99,102,241,.3)',
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '600', color: '#a5b4fc', fontSize: 13 }}>
                {selectedMember.full_name ?? selectedMember.email}
              </Text>
              <TouchableOpacity onPress={() => setSelectedMember(null)} style={{ padding: 4 }}>
                <Text style={{ color: 'rgba(255,255,255,.35)', fontSize: 16 }}>✕</Text>
              </TouchableOpacity>
            </View>
            {selectedMember.status_text ? (
              <Text style={{ fontSize: 11, color: 'rgba(165,180,252,.75)', marginTop: 2, fontStyle: 'italic' }}>
                {selectedMember.status_text}
              </Text>
            ) : null}
            {memberLocations[selectedMember.id] && (
              <Text style={{ fontSize: 11, color: 'rgba(165,180,252,.6)', marginTop: 2 }}>
                🕐 {formatTime(memberLocations[selectedMember.id].updated_at)}
              </Text>
            )}
            {selectedAddress && (
              <Text style={{ fontSize: 11, color: 'rgba(165,180,252,.5)', marginTop: 2 }} numberOfLines={1}>
                📍 {selectedAddress}
              </Text>
            )}
            {/* Actions — Y aller + Voir le trajet */}
            {memberLocations[selectedMember.id] && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <TouchableOpacity
                  onPress={() => {
                    const loc = memberLocations[selectedMember.id];
                    window.open(
                      `https://www.google.com/maps/dir/?api=1&destination=${loc.latitude},${loc.longitude}`,
                      '_blank'
                    );
                  }}
                  style={{
                    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    backgroundColor: 'rgba(59,130,246,.15)', borderRadius: 10, paddingVertical: 7,
                    borderWidth: 1, borderColor: 'rgba(59,130,246,.3)',
                  }}
                >
                  <Text style={{ fontSize: 13, marginRight: 4 }}>🗺️</Text>
                  <Text style={{ fontSize: 12, color: '#93c5fd', fontWeight: '600' }}>Y aller</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => showingHistory ? clearHistory() : fetchAndDrawHistory(selectedMember.id)}
                  style={{
                    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    backgroundColor: showingHistory ? 'rgba(99,102,241,.25)' : 'rgba(99,102,241,.1)',
                    borderRadius: 10, paddingVertical: 7,
                    borderWidth: 1, borderColor: showingHistory ? 'rgba(99,102,241,.6)' : 'rgba(99,102,241,.3)',
                  }}
                >
                  <Text style={{ fontSize: 13, marginRight: 4 }}>📍</Text>
                  <Text style={{ fontSize: 12, color: '#a5b4fc', fontWeight: '600' }}>
                    {showingHistory ? 'Masquer' : 'Voir le trajet'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Avatars membres */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 2 }}>
          {members.map((member, idx) => {
            const loc     = memberLocations[member.id];
            const status  = memberStatus(loc?.updated_at);
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
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 3 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: status.color }} />
                  {status.label ? (
                    <Text style={{ fontSize: 9, color: status.color, fontWeight: '600' }}>{status.label}</Text>
                  ) : null}
                </View>
                {member.status_text ? (
                  <Text style={{ fontSize: 9, color: 'rgba(255,255,255,.38)', marginTop: 1, fontStyle: 'italic' }} numberOfLines={1}>
                    {member.status_text}
                  </Text>
                ) : null}
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
