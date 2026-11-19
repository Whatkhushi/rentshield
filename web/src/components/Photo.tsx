import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock, FileText, Fingerprint, ImageOff, MapPin, MapPinOff, ShieldAlert, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useEvidenceUrl } from '../lib/files';
import { bytes, dateTime, distance, shortHash } from '../lib/format';
import type { Evidence, PhotoCheck } from '../lib/types';
import { EvidenceMap } from './Maps';
import { Badge, Button, Modal, cx } from './ui';

type Pin = { latitude: number | null; longitude: number | null } | undefined;

/** Small chip: was this photo taken at the property, and recently? */
export function PlaceBadge({ check, compact }: { check?: PhotoCheck; compact?: boolean }) {
  if (!check) return null;
  const base = 'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold backdrop-blur';
  const chip =
    check.place === 'AT_PROPERTY' ? (
      <span className={cx(base, 'bg-ok-600/90 text-white')} title="Photo location is within 150 m of the property pin">
        <MapPin className="size-3" /> {compact ? 'At property' : `At property · ${check.distanceMeters} m`}
      </span>
    ) : check.place === 'AWAY' ? (
      <span className={cx(base, 'bg-warn-500/95 text-white')} title="Photo location is far from the property pin">
        <MapPin className="size-3" /> {distance(check.distanceMeters!)} away
      </span>
    ) : check.place === 'PROPERTY_NOT_PINNED' ? (
      <span className={cx(base, 'bg-ink-950/70 text-white')}>
        <MapPin className="size-3" /> Located
      </span>
    ) : (
      <span className={cx(base, 'bg-ink-950/60 text-white/90')} title="This file has no location data (common for screenshots and laptop uploads)">
        <MapPinOff className="size-3" /> No location
      </span>
    );
  return (
    <span className="flex flex-wrap gap-1">
      {chip}
      {check.stale && (
        <span className={cx(base, 'bg-warn-500/95 text-white')} title="Taken well before it was uploaded">
          <Clock className="size-3" /> {Math.round(check.ageDays!)}d old
        </span>
      )}
    </span>
  );
}

function WhereWhen({ ev, property }: { ev: Evidence; property: Pin }) {
  const c = ev.check;
  if (!c || ev.kind !== 'PHOTO') return null;
  const hasPin = property?.latitude != null && property?.longitude != null;
  const text = {
    AT_PROPERTY: `Taken ${c.distanceMeters} m from the property pin, so at the property.`,
    AWAY: `Taken ${distance(c.distanceMeters!)} from the property pin. Worth asking why.`,
    PROPERTY_NOT_PINNED: 'This photo has a location, but the property isn’t pinned on the map yet.',
    NO_LOCATION: 'No location data in this file. Common for screenshots, edited images and laptop uploads.',
  }[c.place];
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-400">
        <MapPin className="size-3.5" /> Where & when
      </p>
      <div className="space-y-2 rounded-xl bg-ink-50 p-3.5 text-xs text-ink-700">
        <p>{text}</p>
        {c.source && <p className="text-ink-400">Source: {c.source === 'EXIF' ? 'GPS saved inside the photo by the camera' : 'phone location when the in-app camera fired'}</p>}
        <p>
          {c.takenAt ? (
            <>
              Taken {dateTime(c.takenAt)}
              {c.stale && <strong className="text-warn-700"> · {Math.round(c.ageDays!)} days before upload</strong>}
            </>
          ) : (
            <span className="text-ink-400">Capture time unknown</span>
          )}
        </p>
        {hasPin && ev.latitude != null && ev.longitude != null && (
          <EvidenceMap
            className="h-36"
            interactive={false}
            property={{ lat: property!.latitude!, lng: property!.longitude! }}
            photos={[{ id: ev.id, lat: ev.latitude, lng: ev.longitude, label: ev.originalName, ok: c.place === 'AT_PROPERTY' }]}
          />
        )}
      </div>
    </div>
  );
}

export function AuthedImage({ id, className, alt = '' }: { id: number; className?: string; alt?: string }) {
  const url = useEvidenceUrl(id);
  if (!url) return <div className={cx('animate-pulse bg-ink-100', className)} />;
  return <img src={url} alt={alt} className={cx('object-cover', className)} />;
}

interface VerifyResult {
  verified: boolean;
  recordedHash: string;
  currentHash: string | null;
  checkedAt: string;
}

/** Full-size view with the evidence record and an on-demand integrity check. */
export function EvidenceViewer({ ev, open, onClose, property }: { ev: Evidence; open: boolean; onClose: () => void; property?: Pin }) {
  const url = useEvidenceUrl(open ? ev.id : null);
  const verify = useQuery({
    queryKey: ['verify', ev.id],
    queryFn: () => api<VerifyResult>(`/evidence/${ev.id}/verify`),
    enabled: false,
  });
  const isImage = ev.mimeType.startsWith('image/');

  return (
    <Modal open={open} onClose={onClose} title={ev.originalName} wide>
      <div className="grid gap-5 md:grid-cols-[1fr_300px]">
        <div className="grid min-h-64 place-items-center overflow-hidden rounded-2xl bg-ink-950">
          {isImage ? (
            url ? <img src={url} alt="" className="max-h-[65vh] w-auto" /> : <div className="size-10 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          ) : (
            <a href={url ?? '#'} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-2 p-10 text-white/80 hover:text-white">
              <FileText className="size-12" />
              Open document
            </a>
          )}
        </div>
        <div className="space-y-4 text-sm">
          <WhereWhen ev={ev} property={property} />
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-400">
              <Fingerprint className="size-3.5" /> Evidence record
            </p>
            <dl className="space-y-2 rounded-xl bg-ink-50 p-3.5">
              <Row k="Uploaded" v={dateTime(ev.uploadedAt)} />
              <Row k="Size" v={bytes(ev.sizeBytes)} />
              <Row k="Type" v={ev.mimeType} />
              <div>
                <dt className="text-xs text-ink-400">SHA-256 fingerprint</dt>
                <dd className="mt-0.5 break-all font-mono text-[11px] leading-relaxed text-ink-700">{ev.sha256}</dd>
              </div>
            </dl>
          </div>

          <Button variant="secondary" className="w-full" onClick={() => verify.refetch()} disabled={verify.isFetching}>
            <Fingerprint className="size-4" />
            {verify.isFetching ? 'Re-hashing stored file…' : 'Verify integrity now'}
          </Button>

          {verify.data &&
            (verify.data.verified ? (
              <div className="animate-rise rounded-xl bg-ok-50 p-3.5 text-ok-700 ring-1 ring-ok-100">
                <p className="flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 className="size-4" /> Unchanged since upload
                </p>
                <p className="mt-1 text-xs opacity-80">The stored file still produces the exact fingerprint recorded on {dateTime(ev.uploadedAt)}.</p>
              </div>
            ) : (
              <div className="animate-rise rounded-xl bg-red-50 p-3.5 text-red-700 ring-1 ring-red-100">
                <p className="flex items-center gap-1.5 font-semibold">
                  <ShieldAlert className="size-4" /> Fingerprint mismatch
                </p>
                <p className="mt-1 text-xs">The stored file is different from what was uploaded, or is missing.</p>
              </div>
            ))}
          <p className="text-xs leading-relaxed text-ink-400">
            A fingerprint proves the file hasn’t changed since upload. It doesn’t prove when or where the photo was taken.
          </p>
        </div>
      </div>
    </Modal>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-xs text-ink-400">{k}</dt>
      <dd className="text-right text-xs font-medium text-ink-700">{v}</dd>
    </div>
  );
}

export function PhotoTile({ ev, onRemove, size = 'md', property }: { ev: Evidence; onRemove?: () => void; size?: 'sm' | 'md'; property?: Pin }) {
  const [open, setOpen] = useState(false);
  const isImage = ev.mimeType.startsWith('image/');
  return (
    <>
      <div className={cx('group relative overflow-hidden rounded-xl bg-ink-100 ring-1 ring-ink-100', size === 'sm' ? 'size-16' : 'aspect-[4/3] w-full')}>
        <button onClick={() => setOpen(true)} className="block size-full" aria-label={`View ${ev.originalName}`}>
          {isImage ? (
            <AuthedImage id={ev.id} className="size-full transition-transform duration-300 group-hover:scale-105" />
          ) : (
            <div className="grid size-full place-items-center text-ink-500">
              <FileText className="size-6" />
            </div>
          )}
        </button>
        {size === 'md' && (
          <>
            <span className="pointer-events-none absolute left-1.5 top-1.5">
              <PlaceBadge check={ev.check} compact />
            </span>
            <span className="pointer-events-none absolute inset-x-1.5 bottom-1.5 flex items-center gap-1 truncate rounded-md bg-ink-950/70 px-1.5 py-0.5 font-mono text-[9px] text-white/90 backdrop-blur">
              <Fingerprint className="size-2.5 shrink-0" />
              {shortHash(ev.sha256)}
            </span>
          </>
        )}
        {onRemove && (
          <button
            onClick={onRemove}
            className="absolute right-1.5 top-1.5 rounded-lg bg-white/90 p-1 text-red-600 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
            aria-label="Remove photo"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
      <EvidenceViewer ev={ev} open={open} onClose={() => setOpen(false)} property={property} />
    </>
  );
}

export function NoPhoto({ label = 'No photo' }: { label?: string }) {
  return (
    <div className="grid aspect-[4/3] w-full place-items-center rounded-xl bg-stone-100 text-stone-400 ring-1 ring-stone-200">
      <span className="flex flex-col items-center gap-1 text-xs">
        <ImageOff className="size-5" />
        {label}
      </span>
    </div>
  );
}

export function HashBadge({ hash }: { hash: string }) {
  return (
    <Badge tone="muted" className="font-mono">
      <Fingerprint className="size-3" />
      {shortHash(hash)}
    </Badge>
  );
}
