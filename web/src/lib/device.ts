/** True on phones/tablets (finger as the main pointer), false on laptops with a mouse/trackpad. */
export const isTouchDevice = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

/** Current position from the browser, or null if denied/unavailable (never throws). */
export function currentPosition(timeoutMs = 8000): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}

/** Rough centres of common Indian cities, so the map opens near the right place without calling a geocoding service. */
export const CITY_CENTRES: Record<string, [number, number]> = {
  bengaluru: [12.9716, 77.5946],
  bangalore: [12.9716, 77.5946],
  mumbai: [19.076, 72.8777],
  delhi: [28.6139, 77.209],
  'new delhi': [28.6139, 77.209],
  gurugram: [28.4595, 77.0266],
  gurgaon: [28.4595, 77.0266],
  noida: [28.5355, 77.391],
  hyderabad: [17.385, 78.4867],
  chennai: [13.0827, 80.2707],
  pune: [18.5204, 73.8567],
  kolkata: [22.5726, 88.3639],
  ahmedabad: [23.0225, 72.5714],
  jaipur: [26.9124, 75.7873],
  chandigarh: [30.7333, 76.7794],
  kochi: [9.9312, 76.2673],
  indore: [22.7196, 75.8577],
};

export const INDIA_CENTRE: [number, number] = [22.5, 79];

export function cityCentre(city: string): [number, number] | null {
  return CITY_CENTRES[city.trim().toLowerCase()] ?? null;
}
