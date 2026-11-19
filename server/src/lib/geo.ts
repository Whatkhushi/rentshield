import exifr from 'exifr';

/**
 * Photo location checks.
 *
 * Phone cameras embed EXIF metadata in each photo: when it was taken and,
 * if location is on, GPS coordinates. We compare that position with the
 * property's pin to answer two questions a deposit dispute cares about:
 *   1. Was this photo actually taken at the flat?
 *   2. Was it taken around the time it was uploaded (not an old photo)?
 * The answers are shown as badges, never used to block anything:
 * metadata can be missing (screenshots, edited files) or spoofed.
 */

export const AT_PROPERTY_METERS = 150; // GPS on phones is typically accurate to ~5-50 m
export const STALE_DAYS = 3;

export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Great-circle distance in metres (haversine formula). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const validLatLng = (lat: unknown, lng: unknown) =>
  typeof lat === 'number' && typeof lng === 'number' && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

/** Read capture time and GPS from a photo's EXIF block. Missing data -> nulls. */
export async function readPhotoMetadata(file: Buffer): Promise<{ takenAt: Date | null; gps: LatLng | null }> {
  let takenAt: Date | null = null;
  let gps: LatLng | null = null;
  try {
    const tags = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate']);
    const t = tags?.DateTimeOriginal ?? tags?.CreateDate;
    if (t instanceof Date && !Number.isNaN(t.getTime())) takenAt = t;
  } catch {
    // no EXIF (PNG, screenshot, stripped file)
  }
  try {
    const g = await exifr.gps(file);
    if (g && validLatLng(g.latitude, g.longitude)) gps = { latitude: g.latitude, longitude: g.longitude };
  } catch {
    // no GPS block
  }
  return { takenAt, gps };
}

export type PlaceStatus = 'AT_PROPERTY' | 'AWAY' | 'NO_LOCATION' | 'PROPERTY_NOT_PINNED';

export interface PhotoCheck {
  place: PlaceStatus;
  distanceMeters: number | null;
  source: 'EXIF' | 'DEVICE' | null;
  takenAt: Date | null;
  /** Days between capture and upload, when the capture time is known. */
  ageDays: number | null;
  stale: boolean;
}

/** The verdict shown next to a photo. */
export function checkPhoto(
  ev: { latitude: number | null; longitude: number | null; locationSource: 'EXIF' | 'DEVICE' | null; takenAt: Date | null; uploadedAt: Date },
  property: { latitude: number | null; longitude: number | null },
): PhotoCheck {
  const ageDays = ev.takenAt ? (ev.uploadedAt.getTime() - ev.takenAt.getTime()) / 86_400_000 : null;
  const base = { source: ev.locationSource, takenAt: ev.takenAt, ageDays, stale: ageDays !== null && ageDays > STALE_DAYS };

  if (ev.latitude === null || ev.longitude === null) return { ...base, place: 'NO_LOCATION', distanceMeters: null };
  if (property.latitude === null || property.longitude === null) return { ...base, place: 'PROPERTY_NOT_PINNED', distanceMeters: null };

  const d = distanceMeters({ latitude: ev.latitude, longitude: ev.longitude }, { latitude: property.latitude, longitude: property.longitude });
  return { ...base, place: d <= AT_PROPERTY_METERS ? 'AT_PROPERTY' : 'AWAY', distanceMeters: Math.round(d) };
}

export function describePlace(c: PhotoCheck): string {
  switch (c.place) {
    case 'AT_PROPERTY':
      return `Taken at the property (${c.distanceMeters} m, ${c.source === 'EXIF' ? 'photo GPS' : 'device location'})`;
    case 'AWAY':
      return `Taken ${c.distanceMeters! >= 1000 ? `${(c.distanceMeters! / 1000).toFixed(1)} km` : `${c.distanceMeters} m`} from the property`;
    case 'PROPERTY_NOT_PINNED':
      return 'Has location, but the property is not pinned on the map';
    default:
      return 'No location data in this photo';
  }
}
