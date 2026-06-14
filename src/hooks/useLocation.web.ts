import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

// Interface compatible avec Location.LocationObject d'expo-location
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
}

export function useLocation() {
  const [currentLocation,  setCurrentLocation]  = useState<WebLocationObject | null>(null);
  const [tracking,         setTracking]          = useState(false);
  const [permissionDenied, setPermissionDenied]  = useState(false);
  const watchIdRef  = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Surveillance continue (mise à jour de l'état local uniquement) ─────────
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setPermissionDenied(true);
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      pos => setCurrentLocation(posToObj(pos)),
      err => { if (err.code === GeolocationPositionError.PERMISSION_DENIED) setPermissionDenied(true); },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 10_000 }
    );

    watchIdRef.current = watchId;
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // ── Mise à jour ponctuelle (lecture fraîche + UPSERT Supabase) ─────────────
  // Utilise getCurrentPosition() plutôt que le cache de watchPosition,
  // ce qui garantit une coordonnée fraîche même si watchPosition n'a pas encore
  // répondu (première ouverture de l'onglet Carte).
  async function pushLocation(): Promise<PushResult> {
    if (!('geolocation' in navigator)) {
      return { success: false, error: 'Géolocalisation non supportée par ce navigateur' };
    }

    return new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(
        async pos => {
          const loc = posToObj(pos);
          setCurrentLocation(loc); // mise à jour de l'état local

          const { data: { user } } = await supabase.auth.getUser();
          if (!user) { resolve({ success: false, error: 'Non connecté' }); return; }

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

          resolve(error ? { success: false, error: error.message } : { success: true });
        },
        err => resolve({ success: false, error: err.message }),
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 }
      );
    });
  }

  // ── Suivi continu (tracking toutes les 5 min) ─────────────────────────────
  async function enableTracking(): Promise<boolean> {
    if (!('geolocation' in navigator)) return false;
    setTracking(true);
    await pushLocation(); // envoi immédiat
    intervalRef.current = setInterval(pushLocation, 5 * 60 * 1000);
    return true;
  }

  async function disableTracking(): Promise<void> {
    setTracking(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  return {
    currentLocation,
    tracking,
    permissionDenied,
    enableTracking,
    disableTracking,
    pushLocation,   // ← exposé pour le bouton "Mettre à jour ma position"
  };
}

// ── Helper ────────────────────────────────────────────────────────────────────
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
