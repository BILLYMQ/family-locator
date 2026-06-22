import { useState, useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { supabase } from '@/lib/supabase';
import { startLocationTracking, stopLocationTracking, pushCurrentLocation } from '@/tasks/locationTask';

// Intervalle foreground : fallback si la tâche background est tuée par l'OS
const FOREGROUND_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function useLocation() {
  const [currentLocation,  setCurrentLocation]  = useState<Location.LocationObject | null>(null);
  const [tracking,         setTracking]          = useState(false);
  const [permissionDenied, setPermissionDenied]  = useState(false);
  const [trackingUntil,    setTrackingUntil]     = useState<Date | null>(null);

  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef  = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const restoredRef  = useRef(false);

  // ── Restauration du suivi si la tâche background tourne déjà ─────────────
  // Sur Android, le foreground service survit aux redémarrages de l'app.
  // On détecte cet état et on rebranche l'intervalle foreground.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    import('@/tasks/locationTask').then(({ LOCATION_TASK_NAME }) => {
      import('expo-location').then(Location => {
        Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
          .then(running => {
            if (running) {
              console.log('[LOCATION] tracking restauré (background task déjà actif)');
              setTracking(true);
              if (intervalRef.current) clearInterval(intervalRef.current);
              intervalRef.current = setInterval(async () => {
                try { await pushCurrentLocation(); }
                catch (e) { console.warn('[LOCATION] foreground push error (interval):', e); }
              }, FOREGROUND_INTERVAL_MS);
            }
          })
          .catch(() => {});
      });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Écoute locale de la position (marqueur bleu — ne pousse PAS vers Supabase) ──
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setPermissionDenied(true); return; }
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 10_000, distanceInterval: 10 },
        loc => setCurrentLocation(loc)
      );
    })();
    return () => { sub?.remove(); };
  }, []);

  // ── Activer le suivi ──────────────────────────────────────────────────────
  async function enableTracking(durationMs?: number): Promise<boolean> {
    console.log('[LOCATION] tracking enabled');
    setTracking(true);

    // Tâche background (Android foreground service / iOS background location)
    const bgStarted = await startLocationTracking();
    if (!bgStarted) {
      console.warn('[LOCATION] background task not started — permission manquante ou erreur');
    }

    // Push immédiat au moment de l'activation
    try {
      await pushCurrentLocation();
    } catch (e) {
      console.warn('[LOCATION] foreground push error (on enable):', e);
    }

    // Intervalle foreground — sécurité si la tâche background est tuée
    // (app forcée, optimisation batterie, redémarrage téléphone)
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(async () => {
      try {
        await pushCurrentLocation();
      } catch (e) {
        console.warn('[LOCATION] foreground push error (interval):', e);
      }
    }, FOREGROUND_INTERVAL_MS);

    // Arrêt automatique si une durée est spécifiée (partage temporaire)
    if (durationMs && durationMs > 0) {
      const until = new Date(Date.now() + durationMs);
      setTrackingUntil(until);
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        supabase.from('profiles').update({ tracking_until: until.toISOString() }).eq('id', session.user.id).then(() => {});
      }
      if (autoStopRef.current) clearTimeout(autoStopRef.current);
      autoStopRef.current = setTimeout(() => disableTracking(), durationMs);
    }

    return true;
  }

  // ── Désactiver le suivi ───────────────────────────────────────────────────
  async function disableTracking(): Promise<void> {
    console.log('[LOCATION] tracking disabled');
    setTracking(false);
    setTrackingUntil(null);
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (autoStopRef.current) { clearTimeout(autoStopRef.current);  autoStopRef.current = null; }
    await stopLocationTracking();
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      supabase.from('profiles').update({ tracking_until: null }).eq('id', session.user.id).then(() => {});
    }
  }

  // ── Push ponctuel (bouton "Mettre à jour ma position") ───────────────────
  async function pushLocation(): Promise<{ success: boolean; error?: string }> {
    try {
      await pushCurrentLocation();
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Erreur inconnue' };
    }
  }

  return {
    currentLocation, tracking, permissionDenied, trackingUntil,
    enableTracking, disableTracking, pushLocation,
  };
}
