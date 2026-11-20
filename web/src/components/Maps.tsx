import { useEffect, useState } from 'react';
import { Circle, MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed } from 'lucide-react';
import { currentPosition, INDIA_CENTRE } from '../lib/device';
import { Button, cx } from './ui';

// OpenStreetMap's standard tiles: free, no API key. OSM requires visible
// credit; it lives in the app footer (MapCredit) instead of on every map,
// so the map corner control is turned off below. Colours are muted in
// index.css. For real traffic, OSM's tile policy asks you to use a
// commercial provider or host your own.
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/**
 * OpenStreetMap's licence requires visible credit on the map. Instead of
 * Leaflet's text strip, a small "i" in the corner reveals it on hover/tap
 * (the same pattern most map apps use).
 */
function MapCredit() {
  return (
    <div className="group absolute bottom-2 right-2 z-[400] flex items-center gap-1.5">
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
        className="pointer-events-none whitespace-nowrap rounded-md bg-white/90 px-2 py-0.5 text-[10px] text-ink-600 opacity-0 shadow-sm transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
      >
        © OpenStreetMap contributors
      </a>
      <button
        type="button"
        aria-label="Map data credits"
        className="grid size-5 place-items-center rounded-full bg-white/90 font-serif text-[11px] font-bold italic text-ink-500 shadow-sm"
      >
        i
      </button>
    </div>
  );
}

/** CSS-only pins (avoids Leaflet's default image paths breaking under Vite). */
const pin = (color: string, size = 30) =>
  L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    html: `<svg viewBox="0 0 24 24" width="${size}" height="${size}"><path d="M12 2C7.6 2 4 5.4 4 9.7 4 15.4 12 22 12 22s8-6.6 8-12.3C20 5.4 16.4 2 12 2z" fill="${color}" stroke="white" stroke-width="1.5"/><circle cx="12" cy="9.5" r="3.2" fill="white"/></svg>`,
  });
const dot = (color: string) =>
  L.divIcon({
    className: '',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    html: `<span style="display:block;width:14px;height:14px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 1px 4px rgb(0 0 0/.35)"></span>`,
  });

export const HOME_PIN = pin('#11284b', 34);
export const PHOTO_OK = dot('#059669');
export const PHOTO_AWAY = dot('#d97706');

function Recenter({ center, zoom }: { center: [number, number]; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom ?? map.getZoom());
  }, [center[0], center[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** Re-fit the view whenever the set of points changes (photos load after the map mounts). */
function FitTo({ points, fallback }: { points: [number, number][]; fallback: [number, number] }) {
  const map = useMap();
  const key = points.map((p) => p.join(',')).join(';');
  useEffect(() => {
    if (points.length > 1) map.fitBounds(L.latLngBounds(points).pad(0.3), { maxZoom: 17 });
    else map.setView(fallback, 16);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function ClickToPlace({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

/** Pick the property's position: click the map, drag the pin, or use your current location. */
export function MapPicker({
  value,
  onChange,
  fallbackCenter,
  className,
}: {
  value: { lat: number; lng: number } | null;
  onChange: (v: { lat: number; lng: number }) => void;
  fallbackCenter?: [number, number] | null;
  className?: string;
}) {
  const [locating, setLocating] = useState(false);
  const center: [number, number] = value ? [value.lat, value.lng] : (fallbackCenter ?? INDIA_CENTRE);
  const zoom = value ? 16 : fallbackCenter ? 12 : 4;

  return (
    <div className={cx('relative isolate overflow-hidden rounded-2xl ring-1 ring-ink-200', className)}>
      <MapContainer center={center} zoom={zoom} className="size-full" scrollWheelZoom attributionControl={false}>
        <TileLayer url={TILES} />
        <Recenter center={center} zoom={value ? Math.max(15, zoom) : zoom} />
        <ClickToPlace onPick={(lat, lng) => onChange({ lat, lng })} />
        {value && (
          <Marker
            position={[value.lat, value.lng]}
            icon={HOME_PIN}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const p = (e.target as L.Marker).getLatLng();
                onChange({ lat: p.lat, lng: p.lng });
              },
            }}
          />
        )}
      </MapContainer>
      <MapCredit />
      <div className="absolute right-3 top-3 z-[400]">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="shadow-md"
          disabled={locating}
          onClick={async () => {
            setLocating(true);
            const p = await currentPosition();
            setLocating(false);
            if (p) onChange(p);
          }}
        >
          <LocateFixed className="size-3.5" /> {locating ? 'Locating…' : 'Use my location'}
        </Button>
      </div>
      {!value && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[400] text-center">
          <span className="rounded-full bg-night/80 px-3 py-1.5 text-xs font-medium text-snow">Tap the map to drop a pin on the building</span>
        </div>
      )}
    </div>
  );
}

export interface PhotoPoint {
  id: number;
  lat: number;
  lng: number;
  label: string;
  ok: boolean;
}

/** Read-only map: the property pin, a 150 m "at the property" ring, and photo locations. */
export function EvidenceMap({
  property,
  photos = [],
  className,
  interactive = true,
  radius = 150,
}: {
  property: { lat: number; lng: number };
  photos?: PhotoPoint[];
  className?: string;
  interactive?: boolean;
  radius?: number;
}) {
  const home: [number, number] = [property.lat, property.lng];
  // Zoom out only as far as needed to also show photos taken away from the flat.
  const far = photos.filter((p) => !p.ok).map((p) => [p.lat, p.lng] as [number, number]);
  return (
    <div className={cx('relative isolate overflow-hidden rounded-2xl ring-1 ring-ink-100', className)}>
      <MapContainer
        center={home}
        zoom={16}
        className="size-full"
        zoomControl={interactive}
        dragging={interactive}
        scrollWheelZoom={false}
        doubleClickZoom={interactive}
        touchZoom={interactive}
        attributionControl={false}
      >
        <TileLayer url={TILES} />
        <FitTo points={far.length ? [home, ...far] : []} fallback={home} />
        {radius > 0 &&<Circle center={[property.lat, property.lng]} radius={radius} pathOptions={{ color: '#059669', weight: 1, fillOpacity: 0.08 }} />}
        <Marker position={[property.lat, property.lng]} icon={HOME_PIN} />
        {photos.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={p.ok ? PHOTO_OK : PHOTO_AWAY}>
            {interactive && <Tooltip>{p.label}</Tooltip>}
          </Marker>
        ))}
      </MapContainer>
      <MapCredit />
    </div>
  );
}
