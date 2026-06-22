import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { supabase } from '@/lib/supabase';

export const LOCATION_TASK_NAME = 'FAMILY_LOCATOR_BACKGROUND_TASK';

const UPDATE_INTERVAL_MS = 5 * 60 * 1000;

// ── Tâche background ─────────────────────────────────────────────────────────
// Appelée par expo-location quand l'OS fournit une nouvelle position.
// getSession() est préféré à getUser() en contexte background : il lit depuis
// AsyncStorage sans requête réseau supplémentaire pour vérifier le token.
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('[LOCATION] background task error:', error.message);
    return;
  }
  if (!data) return;

  const { locations } = data as { locations: Location.LocationObject[] };
  const latest = locations[locations.length - 1];
  if (!latest) return;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      console.warn('[LOCATION] background push skipped: no session');
      return;
    }

    const { error: upsertError } = await supabase.from('locations').upsert(
      {
        user_id:    session.user.id,
        latitude:   latest.coords.latitude,
        longitude:  latest.coords.longitude,
        accuracy:   latest.coords.accuracy ?? null,
        updated_at: new Date().toISOString(), // heure serveur, pas horodatage GPS
      },
      { onConflict: 'user_id' }
    );

    if (upsertError) {
      console.error('[LOCATION] background push error:', upsertError.message);
    } else {
      console.log('[LOCATION] background push success', {
        lat: latest.coords.latitude.toFixed(6),
        lng: latest.coords.longitude.toFixed(6),
        acc: latest.coords.accuracy,
      });
    }
  } catch (err) {
    console.error('[LOCATION] background push error (exception):', err);
  }
});

// ── Démarrage de la tâche background ────────────────────────────────────────
export async function startLocationTracking(): Promise<boolean> {
  const { status: fg } = await Location.requestForegroundPermissionsAsync();
  if (fg !== 'granted') return false;

  const { status: bg } = await Location.requestBackgroundPermissionsAsync();
  if (bg !== 'granted') return false;

  const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
  if (running) return true;

  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy:                       Location.Accuracy.Balanced,
    timeInterval:                   UPDATE_INTERVAL_MS,
    distanceInterval:               50,
    pausesUpdatesAutomatically:     false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'FamilyLocator actif',
      notificationBody:  'Partage de position en cours…',
      notificationColor: '#1e40af',
    },
  });

  console.log('[LOCATION] background task started');
  return true;
}

// ── Arrêt de la tâche background ─────────────────────────────────────────────
export async function stopLocationTracking(): Promise<void> {
  const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
  if (running) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    console.log('[LOCATION] background task stopped');
  }
}

// ── Push ponctuel (foreground) ───────────────────────────────────────────────
// Lance un getCurrentPositionAsync et upsert dans Supabase.
// Utilisé à l'activation du suivi et par l'intervalle foreground.
export async function pushCurrentLocation(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    console.warn('[LOCATION] foreground push skipped: no session');
    return;
  }

  const loc = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });

  const { error } = await supabase.from('locations').upsert(
    {
      user_id:    session.user.id,
      latitude:   loc.coords.latitude,
      longitude:  loc.coords.longitude,
      accuracy:   loc.coords.accuracy ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    console.error('[LOCATION] foreground push error:', error.message);
    throw error;
  }
  console.log('[LOCATION] foreground push success', {
    lat: loc.coords.latitude.toFixed(6),
    lng: loc.coords.longitude.toFixed(6),
    acc: loc.coords.accuracy,
  });
}
