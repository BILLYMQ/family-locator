import { useState, useEffect } from 'react';
import * as Location from 'expo-location';
import { supabase } from '@/lib/supabase';
import { startLocationTracking, stopLocationTracking, pushCurrentLocation } from '@/tasks/locationTask';

export function useLocation() {
  const [currentLocation, setCurrentLocation] = useState<Location.LocationObject | null>(null);
  const [tracking, setTracking] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPermissionDenied(true);
        return;
      }

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 10_000,
          distanceInterval: 10,
        },
        loc => setCurrentLocation(loc)
      );
    })();

    return () => { subscription?.remove(); };
  }, []);

  async function enableTracking() {
    const started = await startLocationTracking();
    if (started) {
      await pushCurrentLocation();
      setTracking(true);
    }
    return started;
  }

  async function disableTracking() {
    await stopLocationTracking();
    setTracking(false);
  }

  async function pushLocation(): Promise<{ success: boolean; error?: string }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Non connecté' };
    try {
      await pushCurrentLocation();
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Erreur inconnue' };
    }
  }

  return { currentLocation, tracking, permissionDenied, enableTracking, disableTracking, pushLocation };
}
