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

export function useLocation() {
  const [currentLocation, setCurrentLocation] = useState<WebLocationObject | null>(null);
  const [tracking, setTracking]               = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const watchIdRef   = useRef<number | null>(null);
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  // Surveillance continue de la position
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setPermissionDenied(true);
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      pos => {
        setCurrentLocation({
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
        });
      },
      err => {
        if (err.code === GeolocationPositionError.PERMISSION_DENIED) {
          setPermissionDenied(true);
        }
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 10_000 }
    );

    watchIdRef.current = watchId;
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  async function pushToSupabase() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !currentLocation) return;
    await supabase.from('locations').upsert(
      {
        user_id:    user.id,
        latitude:   currentLocation.coords.latitude,
        longitude:  currentLocation.coords.longitude,
        accuracy:   currentLocation.coords.accuracy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
  }

  async function enableTracking(): Promise<boolean> {
    if (!('geolocation' in navigator)) return false;
    setTracking(true);
    await pushToSupabase();
    // Envoi toutes les 5 minutes (comme la tâche native)
    intervalRef.current = setInterval(pushToSupabase, 5 * 60 * 1000);
    return true;
  }

  async function disableTracking(): Promise<void> {
    setTracking(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  return { currentLocation, tracking, permissionDenied, enableTracking, disableTracking };
}
