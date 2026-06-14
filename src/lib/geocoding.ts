// Cache en mémoire : évite de re-requêter Nominatim pour une position déjà résolue.
// Clé = lat/lng arrondi à 3 décimales (~110 m de précision).
const geoCache = new Map<string, string>();

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (geoCache.has(key)) return geoCache.get(key)!;

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=fr`,
      { headers: { 'User-Agent': 'FamilyLocator/1.0 (contact: ngoheyoboalphonse@gmail.com)' } }
    );
    if (!res.ok) return null;

    const data = await res.json();
    const a = data.address ?? {};

    const road  = a.road ?? a.pedestrian ?? a.footway ?? a.path ?? '';
    const city  = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? '';
    const parts = [road, city].filter(Boolean);

    const result = parts.length > 0
      ? parts.join(', ')
      : (data.display_name ?? '').split(',').slice(0, 2).join(',').trim() || null;

    if (result) geoCache.set(key, result);
    return result;
  } catch {
    return null;
  }
}
