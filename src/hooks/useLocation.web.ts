import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

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
  location?: WebLocationObject; // retourné pour que MapScreen puisse recentrer
}

// Options communes à tous les appels géolocalisation
// maximumAge: 0  → jamais de position en cache navigateur
// timeout: 15 000 → délai maximum pour obtenir un fix GPS
const GEO_OPTS: PositionOptions = {
  enableHighAccuracy: true,
  timeout:     15_000,
  maximumAge:  0,
};

function geoErrorMsg(err: GeolocationPositionError): string {
  switch (err.code) {
    case GeolocationPositionError.PERMISSION_DENIED:
      return 'Accès à la localisation refusé. Autorisez-le dans les paramètres du navigateur (🔒 → Position → Autoriser).';
    case GeolocationPositionError.TIMEOUT:
      return 'Délai dépassé pour obtenir la position GPS. Réessayez ou déplacez-vous vers un endroit dégagé.';
    default:
      return 'Position indisponible. Vérifiez que la localisation est activée sur votre appareil.';
  }
}

export function useLocation() {
  const [currentLocation,  setCurrentLocation]  = useState<WebLocationObject | null>(null);
  const [tracking,         setTracking]          = useState(false);
  const [permissionDenied, setPermissionDenied]  = useState(false);
  const [trackingUntil,    setTrackingUntil]     = useState<Date | null>(null);

  const watchIdRef   = useRef<number | null>(null);
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Miroir de `tracking` accessible dans les callbacks sans déclencher de re-render
  const trackingRef  = useRef(false);
  // Timestamp du dernier push Supabase — limite watchPosition à 1 push/min max
  const lastPushRef  = useRef<number>(0);

  useEffect(() => { trackingRef.current = tracking; }, [tracking]);

  // ── Upsert interne vers Supabase ─────────────────────────────────────────
  async function _upsert(loc: WebLocationObject): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('locations').upsert(
      {
        user_id:    user.id,
        latitude:   loc.coords.latitude,
        longitude:  loc.coords.longitude,
        accuracy:   loc.coords.accuracy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
  }

  // ── Surveillance continue ────────────────────────────────────────────────
  // Démarre dès le montage pour animer le marqueur bleu en temps réel.
  // Quand le tracking est actif, envoie aussi vers Supabase (au max 1×/min)
  // pour que la famille voie la position à jour — pas seulement lors des
  // intervalles de 5 min ou des clics manuels.
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setPermissionDenied(true);
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      async pos => {
        const loc = posToObj(pos);
        setCurrentLocation(loc);

        if (trackingRef.current) {
          const now = Date.now();
          if (now - lastPushRef.current >= 60_000) {
            lastPushRef.current = now;
            await _upsert(loc);
          }
        }
      },
      err => {
        if (err.code === GeolocationPositionError.PERMISSION_DENIED) {
          setPermissionDenied(true);
        }
      },
      GEO_OPTS,
    );
    watchIdRef.current = watchId;
    return () => navigator.geolocation.clearWatch(watchId);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mise à jour manuelle (bouton ou intervalle) ───────────────────────────
  async function pushLocation(): Promise<PushResult> {
    if (!('geolocation' in navigator)) {
      return { success: false, error: 'Géolocalisation non supportée par ce navigateur.' };
    }
    return new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(
        async pos => {
          const loc = posToObj(pos);
          setCurrentLocation(loc);
          lastPushRef.current = Date.now();

          const { data: { user } } = await supabase.auth.getUser();
          if (!user) { resolve({ success: false, error: 'Non connecté.' }); return; }

          const { error } = await supabase.from('locations').upsert(
            {
              user_id:    user.id,
              latitude:   loc.coords.latitude,
              longitude:  loc.coords.longitude,
              accuracy:   loc.coords.accuracy,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' }
          );
          resolve(error
            ? { success: false, error: error.message }
            : { success: true, location: loc }
          );
        },
        err => resolve({ success: false, error: geoErrorMsg(err) }),
        GEO_OPTS,
      );
    });
  }

  // ── Suivi continu (fallback intervalle 5 min + auto-stop optionnel) ────────
  async function enableTracking(durationMs?: number): Promise<boolean> {
    if (!('geolocation' in navigator)) return false;
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (autoStopRef.current) { clearTimeout(autoStopRef.current);  autoStopRef.current = null; }
    setTracking(true);
    await pushLocation();
    // Intervalle de 5 min comme filet de sécurité si watchPosition est suspendu
    intervalRef.current = setInterval(pushLocation, 5 * 60 * 1000);

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
    currentLocation,
    tracking,
    permissionDenied,
    trackingUntil,
    enableTracking,
    disableTracking,
    pushLocation,
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
