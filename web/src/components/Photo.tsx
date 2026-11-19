import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, FileText, Fingerprint, ImageOff, ShieldAlert, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useEvidenceUrl } from '../lib/files';
import { bytes, dateTime, shortHash } from '../lib/format';
import type { Evidence } from '../lib/types';
import { Badge, Button, Modal, cx } from './ui';

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
export function EvidenceViewer({ ev, open, onClose }: { ev: Evidence; open: boolean; onClose: () => void }) {
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

export function PhotoTile({ ev, onRemove, size = 'md' }: { ev: Evidence; onRemove?: () => void; size?: 'sm' | 'md' }) {
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
          <span className="pointer-events-none absolute inset-x-1.5 bottom-1.5 flex items-center gap-1 truncate rounded-md bg-ink-950/70 px-1.5 py-0.5 font-mono text-[9px] text-white/90 backdrop-blur">
            <Fingerprint className="size-2.5 shrink-0" />
            {shortHash(ev.sha256)}
          </span>
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
      <EvidenceViewer ev={ev} open={open} onClose={() => setOpen(false)} />
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
