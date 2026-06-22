import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

export const DEBUG_GPS = true;

// Clé localStorage pour restaurer le suivi après rechargement de page
const TRACKING_PERSIST_KEY = 'fl_tracking_active';

const PUSH_THROTTLE_MS   = DEBUG_GPS ?   5_000 :  60_000;
const TRACKING_INTERV_MS = DEBUG_GPS ?  30_000 : 300_000;

// ── Types publics ────────────────────────────────────────────────────────────
export interface WebLocationObject {
  coords: {
    latitude: number; longitude: number;
    accuracy: number | null; altitude: number | null;
    altitudeAccuracy: number | null; heading: number | null; speed: number | null;
  };
  timestamp: number;
}

export interface PushResult {
  success: boolean;
  error?: string;
  location?: WebLocationObject;
}

export interface DebugInfo {
  watchId: number | null;
  watchActive: boolean;
  lastLocalPos: { lat: number; lng: number; accuracy: number | null; ts: number; tsStr: string; } | null;
  samePos: boolean;
  distanceMoved: number | null;
  posFixed: boolean;
  lastPushed: { lat: number; lng: number; accuracy: number | null; updatedAt: string; ok: boolean; error?: string; } | null;
  lastGeoError: string | null;
  lastSupabaseError: string | null;
  permState: 'granted' | 'prompt' | 'denied' | 'checking' | 'n/a';
}

const GEO_OPTS: PositionOptions = { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 };

function geoErrorMsg(err: GeolocationPositionError): string {
  switch (err.code) {
    case GeolocationPositionError.PERMISSION_DENIED: return 'Accès refusé (🔒 → Position → Autoriser).';
    case GeolocationPositionError.TIMEOUT:           return 'Délai GPS dépassé. Réessayez en extérieur.';
    default:                                         return 'Position indisponible. Vérifiez la localisation système.';
  }
}

const INIT_DEBUG: DebugInfo = {
  watchId: null, watchActive: false,
  lastLocalPos: null, samePos: false, distanceMoved: null, posFixed: false,
  lastPushed: null, lastGeoError: null, lastSupabaseError: null, permState: 'checking',
};

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLa = (lat2 - lat1) * Math.PI / 180;
  const dLo = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLa / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useLocation() {
  const [currentLocation,  setCurrentLocation]  = useState<WebLocationObject | null>(null);
  const [tracking,         setTracking]          = useState(false);
  const [permissionDenied, setPermissionDenied]  = useState(false);
  const [trackingUntil,    setTrackingUntil]     = useState<Date | null>(null);
  const [debugInfo,        setDebugInfo]         = useState<DebugInfo>(INIT_DEBUG);

  const intervalRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef   = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const trackingRef   = useRef(false);
  const lastPushRef   = useRef<number>(0);
  const prevTsRef     = useRef<number | null>(null);
  const prevCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const restoredRef   = useRef(false);

  useEffect(() => { trackingRef.current = tracking; }, [tracking]);

  // ── Permission ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!('permissions' in navigator)) { setDebugInfo(p => ({ ...p, permState: 'n/a' })); return; }
    navigator.permissions.query({ name: 'geolocation' }).then(status => {
      setDebugInfo(p => ({ ...p, permState: status.state as DebugInfo['permState'] }));
      status.addEventListener('change', () =>
        setDebugInfo(p => ({ ...p, permState: status.state as DebugInfo['permState'] }))
      );
    }).catch(() => setDebugInfo(p => ({ ...p, permState: 'n/a' })));
  }, []);

  // ── Restauration du suivi après rechargement de page ─────────────────────
  // Si l'utilisateur avait activé le partage avant de recharger la page,
  // on le restaure automatiquement sans lui redemander.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(TRACKING_PERSIST_KEY) !== '1') return;
    console.log('[LOCATION] tracking restauré depuis session précédente');
    // Restauration légère : on relance l'intervalle sans re-push immédiat
    setTracking(true);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(_pushViaGetCurrent, TRACKING_INTERV_MS);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Upsert Supabase ───────────────────────────────────────────────────────
  async function _upsert(loc: WebLocationObject): Promise<void> {
    // getSession() lit depuis AsyncStorage sans appel réseau supplémentaire
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const updatedAt = new Date().toISOString();
    const { error } = await supabase.from('locations').upsert(
      { user_id: session.user.id, latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracy: loc.coords.accuracy, updated_at: updatedAt },
      { onConflict: 'user_id' }
    );
    console.log(error ? '[LOCATION] push error' : '[LOCATION] push success',
      { lat: loc.coords.latitude.toFixed(6), lng: loc.coords.longitude.toFixed(6), updatedAt, err: error?.message }
    );
    setDebugInfo(p => ({ ...p,
      lastSupabaseError: error?.message ?? null,
      lastPushed: { lat: loc.coords.latitude, lng: loc.coords.longitude, accuracy: loc.coords.accuracy, updatedAt, ok: !error, error: error?.message },
    }));
    if (error) throw error;
  }

  // ── Push via getCurrentPosition (bouton manuel + intervalle) ─────────────
  async function _pushViaGetCurrent(): Promise<WebLocationObject> {
    return new Promise((resolve, reject) => {
      console.log('[LOCATION] push start');
      navigator.geolocation.getCurrentPosition(
        async pos => {
          const loc = posToObj(pos);
          setCurrentLocation(loc);
          lastPushRef.current = Date.now();
          try { await _upsert(loc); resolve(loc); }
          catch (e) { reject(e); }
        },
        err => {
          const msg = geoErrorMsg(err);
          console.warn('[LOCATION] push error (GPS)', msg);
          setDebugInfo(p => ({ ...p, lastGeoError: msg }));
          if (err.code === GeolocationPositionError.PERMISSION_DENIED) setPermissionDenied(true);
          reject(new Error(msg));
        },
        GEO_OPTS,
      );
    });
  }

  // ── watchPosition — écoute continue, pousse vers Supabase si tracking actif ──
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setPermissionDenied(true);
      setDebugInfo(p => ({ ...p, watchActive: false, lastGeoError: 'API absente' }));
      return;
    }
    console.log('[LOCATION] watchPosition START');
    const watchId = navigator.geolocation.watchPosition(
      async pos => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        const samePos = prevTsRef.current === pos.timestamp;
        prevTsRef.current = pos.timestamp;
        const prev = prevCoordsRef.current;
        const distanceMoved = prev ? haversineM(prev.lat, prev.lng, lat, lng) : null;
        const posFixed = distanceMoved !== null && distanceMoved < 0.1;
        prevCoordsRef.current = { lat, lng };
        const tsStr = new Date(pos.timestamp).toLocaleTimeString('fr-FR');
        setCurrentLocation(posToObj(pos));
        setDebugInfo(p => ({ ...p,
          lastLocalPos: { lat, lng, accuracy: pos.coords.accuracy, ts: pos.timestamp, tsStr },
          samePos, distanceMoved, posFixed, lastGeoError: null,
        }));
        // Push automatique si tracking actif et throttle respecté
        if (trackingRef.current) {
          const now = Date.now();
          if (now - lastPushRef.current >= PUSH_THROTTLE_MS) {
            lastPushRef.current = now;
            console.log('[LOCATION] push start (watchPosition auto)');
            await _upsert(posToObj(pos));
          }
        }
      },
      err => {
        const msg = geoErrorMsg(err);
        console.warn('[LOCATION] GPS error', msg);
        setDebugInfo(p => ({ ...p, lastGeoError: msg }));
        if (err.code === GeolocationPositionError.PERMISSION_DENIED) setPermissionDenied(true);
      },
      GEO_OPTS,
    );
    setDebugInfo(p => ({ ...p, watchId, watchActive: true }));
    return () => {
      navigator.geolocation.clearWatch(watchId);
      setDebugInfo(p => ({ ...p, watchActive: false, watchId: null }));
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── enableTracking ────────────────────────────────────────────────────────
  async function enableTracking(durationMs?: number): Promise<boolean> {
    if (!('geolocation' in navigator)) return false;
    console.log('[LOCATION] tracking enabled');
    setTracking(true);
    // Persister pour restauration après rechargement
    if (typeof window !== 'undefined') localStorage.setItem(TRACKING_PERSIST_KEY, '1');
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (autoStopRef.current) { clearTimeout(autoStopRef.current);  autoStopRef.current = null; }
    // Push immédiat
    try { await _pushViaGetCurrent(); }
    catch (e) { console.warn('[LOCATION] push error (on enable)', e); }
    // Intervalle périodique
    intervalRef.current = setInterval(_pushViaGetCurrent, TRACKING_INTERV_MS);
    if (durationMs && durationMs > 0) {
      const until = new Date(Date.now() + durationMs);
      setTrackingUntil(until);
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        supabase.from('profiles').update({ tracking_until: until.toISOString() }).eq('id', session.user.id).then(() => {});
      }
      autoStopRef.current = setTimeout(() => disableTracking(), durationMs);
    }
    return true;
  }

  // ── disableTracking ───────────────────────────────────────────────────────
  async function disableTracking(): Promise<void> {
    console.log('[LOCATION] tracking disabled');
    setTracking(false);
    setTrackingUntil(null);
    if (typeof window !== 'undefined') localStorage.removeItem(TRACKING_PERSIST_KEY);
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (autoStopRef.current) { clearTimeout(autoStopRef.current);  autoStopRef.current = null; }
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      supabase.from('profiles').update({ tracking_until: null }).eq('id', session.user.id).then(() => {});
    }
  }

  // ── pushLocation (bouton manuel) ─────────────────────────────────────────
  async function pushLocation(): Promise<PushResult> {
    if (!('geolocation' in navigator)) return { success: false, error: 'Géolocalisation non supportée.' };
    try {
      const loc = await _pushViaGetCurrent();
      return { success: true, location: loc };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Erreur inconnue' };
    }
  }

  return {
    currentLocation, tracking, permissionDenied, trackingUntil,
    enableTracking, disableTracking, pushLocation,
    debugInfo,
  };
}

function posToObj(pos: GeolocationPosition): WebLocationObject {
  return {
    coords: {
      latitude: pos.coords.latitude, longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy, altitude: pos.coords.altitude,
      altitudeAccuracy: pos.coords.altitudeAccuracy,
      heading: pos.coords.heading, speed: pos.coords.speed,
    },
    timestamp: pos.timestamp,
  };
}
