import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { supabase } from '@/lib/supabase';

export const LOCATION_TASK_NAME = 'FAMILY_LOCATOR_BACKGROUND_TASK';

// Intervalle de mise à jour en millisecondes (5 minutes)
const UPDATE_INTERVAL_MS = 5 * 60 * 1000;

// Définition de la tâche d'arrière-plan
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('[LocationTask] Erreur:', error.message);
    return;
  }

  if (!data) return;

  const { locations } = data as { locations: Location.LocationObject[] };
  const latest = locations[locations.length - 1];
  if (!latest) return;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('locations').upsert(
      {
        user_id: user.id,
        latitude: latest.coords.latitude,
        longitude: latest.coords.longitude,
        accuracy: latest.coords.accuracy ?? null,
        updated_at: new Date(latest.timestamp).toISOString(),
      },
      { onConflict: 'user_id' }
    );
  } catch (err) {
    console.error('[LocationTask] Échec upsert:', err);
  }
});

export async function startLocationTracking(): Promise<boolean> {
  // Vérifier les permissions
  const { status: foreground } = await Location.requestForegroundPermissionsAsync();
  if (foreground !== 'granted') return false;

  const { status: background } = await Location.requestBackgroundPermissionsAsync();
  if (background !== 'granted') return false;

  const isAlreadyRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
    .catch(() => false);

  if (isAlreadyRunning) return true;

  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: UPDATE_INTERVAL_MS,
    distanceInterval: 50,          // Met à jour si déplacement > 50 m
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true, // iOS : icône dans la barre de statut
    foregroundService: {             // Android : notification persistante requise
      notificationTitle: 'FamilyLocator actif',
      notificationBody: 'Partage de position en cours…',
      notificationColor: '#1e40af',
    },
  });

  return true;
}

export async function stopLocationTracking(): Promise<void> {
  const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
    .catch(() => false);
  if (isRunning) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
}

export async function pushCurrentLocation(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });

  await supabase.from('locations').upsert(
    {
      user_id: user.id,
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
}
