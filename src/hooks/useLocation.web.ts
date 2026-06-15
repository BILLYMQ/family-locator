import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

// ── Mode diagnostic ───────────────────────────────────────────────────────────
// Passer à false avant de déployer en production.
export const DEBUG_GPS = true;

// En mode debug : push Supabase toutes les 5 s (au lieu de 60 s)
// et intervalle de fallback à 30 s (au lieu de 5 min).
const PUSH_THROTTLE_MS   = DEBUG_GPS ?      5_000 :  60_000;
const TRACKING_INTERV_MS = DEBUG_GPS ?     30_000 : 300_000;

// ── Types publics ────────────────────────────────────────────────────────────
export interface WebLocationObject {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    altitude: number | null;
    altitudeAccuracy: number | null;
    heading: number | null;
    speed: number | null;
  };
  timestamp: number;
}

export interface PushResult {
  success: boolean;
  error?: string;
  location?: WebLocationObject; // retourné pour que MapScreen puisse flyTo
}

export interface DebugInfo {
  watchId: number | null;
  watchActive: boolean;
  lastLocalPos: {
    lat: number; lng: number;
    accuracy: number | null;
    ts: number; tsStr: string;
  } | null;
  samePos: boolean;           // vrai si navigateur renvoie le même timestamp → cache
  lastPushed: {
    lat: number; lng: number;
    accuracy: number | null;
    updatedAt: string;
    ok: boolean;
    error?: string;
  } | null;
  lastGeoError: string | null;
  lastSupabaseError: string | null;
  permState: 'granted' | 'prompt' | 'denied' | 'checking' | 'n/a';
}

// ── Options GPS unifiées ─────────────────────────────────────────────────────
// maximumAge: 0  → jamais de position en cache navigateur
// timeout: 15 000 → délai maxi pour obtenir un fix GPS
const GEO_OPTS: PositionOptions = {
  enableHighAccuracy: true,
  timeout:    15_000,
  maximumAge: 0,
};

function geoErrorMsg(err: GeolocationPositionError): string {
  switch (err.code) {
    case GeolocationPositionError.PERMISSION_DENIED:
      return 'Accès refusé (🔒 → Position → Autoriser).';
    case GeolocationPositionError.TIMEOUT:
      return 'Délai GPS dépassé. Réessayez en extérieur.';
    default:
      return 'Position indisponible. Vérifiez la localisation système.';
  }
}

const INIT_DEBUG: DebugInfo = {
  watchId: null, watchActive: false,
  lastLocalPos: null, samePos: false,
  lastPushed: null,
  lastGeoError: null, lastSupabaseError: null,
  permState: 'checking',
};

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useLocation() {
  const [currentLocation,  setCurrentLocation]  = useState<WebLocationObject | null>(null);
  const [tracking,         setTracking]          = useState(false);
  const [permissionDenied, setPermissionDenied]  = useState(false);
  const [trackingUntil,    setTrackingUntil]     = useState<Date | null>(null);
  const [debugInfo,        setDebugInfo]         = useState<DebugInfo>(INIT_DEBUG);

  const watchIdRef   = useRef<number | null>(null);
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackingRef  = useRef(false);      // miroir de `tracking` pour les callbacks
  const lastPushRef  = useRef<number>(0);  // debounce push Supabase
  const prevTsRef    = useRef<number | null>(null); // détection position en cache

  useEffect(() => { trackingRef.current = tracking; }, [tracking]);

  // ── Vérification permission ───────────────────────────────────────────────
  useEffect(() => {
    if (!('permissions' in navigator)) {
      if (DEBUG_GPS) setDebugInfo(p => ({ ...p, permState: 'n/a' }));
      return;
    }
    navigator.permissions
      .query({ name: 'geolocation' })
      .then(status => {
        setDebugInfo(p => ({ ...p, permState: status.state as DebugInfo['permState'] }));
        status.addEventListener('change', () =>
          setDebugInfo(p => ({ ...p, permState: status.state as DebugInfo['permState'] }))
        );
      })
      .catch(() => setDebugInfo(p => ({ ...p, permState: 'n/a' })));
  }, []);

  // ── Upsert interne Supabase ───────────────────────────────────────────────
  async function _upsert(loc: WebLocationObject): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const updatedAt = new Date().toISOString();
    const { error } = await supabase.from('locations').upsert(
      {
        user_id:    user.id,
        latitude:   loc.coords.latitude,
        longitude:  loc.coords.longitude,
        accuracy:   loc.coords.accuracy,
        updated_at: updatedAt,
      },
      { onConflict: 'user_id' }
    );
    if (DEBUG_GPS) {
      const info = { lat: loc.coords.latitude, lng: loc.coords.longitude, updatedAt };
      if (error) {
        console.warn('[GPS] _upsert ERROR', error.message, info);
        setDebugInfo(p => ({ ...p,
          lastSupabaseError: error.message,
          lastPushed: { lat: loc.coords.latitude, lng: loc.coords.longitude, accuracy: loc.coords.accuracy, updatedAt, ok: false, error: error.message },
        }));
      } else {
        console.log('[GPS] _upsert OK', info);
        setDebugInfo(p => ({ ...p,
          lastSupabaseError: null,
          lastPushed: { lat: loc.coords.latitude, lng: loc.coords.longitude, accuracy: loc.coords.accuracy, updatedAt, ok: true },
        }));
      }
    }
  }

  // ── Surveillance continue ─────────────────────────────────────────────────
  // Démarre au montage pour animer le marqueur bleu localement.
  // Si tracking actif : upsert Supabase au max tous les PUSH_THROTTLE_MS.
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setPermissionDenied(true);
      if (DEBUG_GPS) setDebugInfo(p => ({ ...p, watchActive: false, lastGeoError: 'API absente' }));
      return;
    }

    if (DEBUG_GPS) console.log('[GPS] watchPosition START (maximumAge:0, timeout:15s, highAccuracy:true)');

    const watchId = navigator.geolocation.watchPosition(
      async pos => {
        const loc     = posToObj(pos);
        const samePos = prevTsRef.current === pos.timestamp;
        prevTsRef.current = pos.timestamp;

        if (DEBUG_GPS) {
          const tsStr = new Date(pos.timestamp).toLocaleTimeString('fr-FR');
          console.log(
            `[GPS] watchPosition success${samePos ? ' ⚠️ MÊME TIMESTAMP = cache navigateur' : ''}`,
            { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy, tsStr }
          );
          setDebugInfo(p => ({ ...p,
            lastLocalPos: { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, ts: pos.timestamp, tsStr },
            samePos,
            lastGeoError: null,
          }));
        }

        setCurrentLocation(loc);

        if (trackingRef.current) {
          const now = Date.now();
          if (now - lastPushRef.current >= PUSH_THROTTLE_MS) {
            lastPushRef.current = now;
            await _upsert(loc);
          }
        }
      },
      err => {
        const msg = geoErrorMsg(err);
        if (DEBUG_GPS) {
          console.warn('[GPS] watchPosition ERROR', err.code, msg);
          setDebugInfo(p => ({ ...p, lastGeoError: msg }));
        }
        if (err.code === GeolocationPositionError.PERMISSION_DENIED) setPermissionDenied(true);
      },
      GEO_OPTS,
    );

    watchIdRef.current = watchId;
    if (DEBUG_GPS) setDebugInfo(p => ({ ...p, watchId, watchActive: true }));

    return () => {
      navigator.geolocation.clearWatch(watchId);
      if (DEBUG_GPS) setDebugInfo(p => ({ ...p, watchActive: false, watchId: null }));
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mise à jour manuelle ─────────────────────────────────────────────────
  async function pushLocation(): Promise<PushResult> {
    if (!('geolocation' in navigator)) {
      return { success: false, error: 'Géolocalisation non supportée.' };
    }
    if (DEBUG_GPS) console.log('[GPS] pushLocation START (getCurrentPosition)');

    return new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(
        async pos => {
          const loc = posToObj(pos);
          setCurrentLocation(loc);
          lastPushRef.current = Date.now();

          if (DEBUG_GPS) {
            console.log('[GPS] getCurrentPosition success',
              { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy });
          }

          const { data: { user } } = await supabase.auth.getUser();
          if (!user) { resolve({ success: false, error: 'Non connecté.' }); return; }

          const updatedAt = new Date().toISOString();
          const { error } = await supabase.from('locations').upsert(
            {
              user_id:    user.id,
              latitude:   loc.coords.latitude,
              longitude:  loc.coords.longitude,
              accuracy:   loc.coords.accuracy,
              updated_at: updatedAt,
            },
            { onConflict: 'user_id' }
          );

          if (DEBUG_GPS) {
            if (error) {
              console.warn('[GPS] pushLocation ERROR (Supabase)', error.message);
              setDebugInfo(p => ({ ...p,
                lastSupabaseError: error.message,
                lastPushed: { lat: loc.coords.latitude, lng: loc.coords.longitude, accuracy: loc.coords.accuracy, updatedAt, ok: false, error: error.message },
              }));
            } else {
              console.log('[GPS] pushLocation SUCCESS', { lat: loc.coords.latitude, lng: loc.coords.longitude, updatedAt });
              setDebugInfo(p => ({ ...p,
                lastSupabaseError: null,
                lastPushed: { lat: loc.coords.latitude, lng: loc.coords.longitude, accuracy: loc.coords.accuracy, updatedAt, ok: true },
              }));
            }
          }

          resolve(error
            ? { success: false, error: error.message }
            : { success: true, location: loc }
          );
        },
        err => {
          const msg = geoErrorMsg(err);
          if (DEBUG_GPS) {
            console.warn('[GPS] pushLocation ERROR (GPS)', err.code, msg);
            setDebugInfo(p => ({ ...p, lastGeoError: msg }));
          }
          resolve({ success: false, error: msg });
        },
        GEO_OPTS,
      );
    });
  }

  // ── Suivi continu ────────────────────────────────────────────────────────
  async function enableTracking(durationMs?: number): Promise<boolean> {
    if (!('geolocation' in navigator)) return false;
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (autoStopRef.current) { clearTimeout(autoStopRef.current);  autoStopRef.current = null; }
    setTracking(true);
    await pushLocation();
    intervalRef.current = setInterval(pushLocation, TRACKING_INTERV_MS);

    if (durationMs && durationMs > 0) {
      const until = new Date(Date.now() + durationMs);
      setTrackingUntil(until);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        supabase.from('profiles')
          .update({ tracking_until: until.toISOString() })
          .eq('id', user.id)
          .then(() => {});
      }
      autoStopRef.current = setTimeout(() => disableTracking(), durationMs);
    }
    return true;
  }

  async function disableTracking(): Promise<void> {
    setTracking(false);
    setTrackingUntil(null);
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (autoStopRef.current) { clearTimeout(autoStopRef.current);  autoStopRef.current = null; }
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      supabase.from('profiles')
        .update({ tracking_until: null })
        .eq('id', user.id)
        .then(() => {});
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
      latitude:         pos.coords.latitude,
      longitude:        pos.coords.longitude,
      accuracy:         pos.coords.accuracy,
      altitude:         pos.coords.altitude,
      altitudeAccuracy: pos.coords.altitudeAccuracy,
      heading:          pos.coords.heading,
      speed:            pos.coords.speed,
    },
    timestamp: pos.timestamp,
  };
}
