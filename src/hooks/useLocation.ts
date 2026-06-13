import { useState, useEffect } from 'react';
import * as Location from 'expo-location';
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

  return { currentLocation, tracking, permissionDenied, enableTracking, disableTracking };
}
