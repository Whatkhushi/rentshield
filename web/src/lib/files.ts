import { useEffect, useState } from 'react';
import { apiBlob } from './api';

/**
 * Evidence files are behind auth, and <img src> can't send an Authorization
 * header. So we fetch them as blobs and hand <img> an object URL.
 * Cached per evidence id so a photo is downloaded once per session.
 */
const cache = new Map<number, Promise<string>>();

export function evidenceUrl(id: number): Promise<string> {
  let p = cache.get(id);
  if (!p) {
    p = apiBlob(`/evidence/${id}/file`).then((b) => URL.createObjectURL(b));
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}

export function useEvidenceUrl(id: number | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (id) evidenceUrl(id).then((u) => alive && setUrl(u)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [id]);
  return url;
}

/** Save the PDF to the Downloads folder. */
export async function downloadReport(id: number) {
  const blob = await apiBlob(`/reports/${id}/file`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rentshield-report-${id}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Open the PDF in a new browser tab. The tab is opened immediately (inside
 * the click) so pop-up blockers allow it, then pointed at the file once it
 * has downloaded.
 */
export async function openReport(id: number) {
  const tab = window.open('', '_blank');
  try {
    const blob = await apiBlob(`/reports/${id}/file`);
    const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
    if (tab) tab.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    tab?.close();
    throw err;
  }
}
