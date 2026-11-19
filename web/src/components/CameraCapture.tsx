import { useEffect, useRef, useState } from 'react';
import { Camera, Layers } from 'lucide-react';
import { useEvidenceUrl } from '../lib/files';
import { Alert, Button, Modal } from './ui';

/**
 * Live camera with the move-in photo as a "ghost" overlay, so the move-out
 * photo can be taken from the same position. That alignment is what makes
 * the later side-by-side and SSIM comparison meaningful.
 */
export function CameraCapture({
  open,
  onClose,
  onCapture,
  ghostEvidenceId,
}: {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
  ghostEvidenceId?: number | null;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [error, setError] = useState('');
  const [ghost, setGhost] = useState(45);
  const ghostUrl = useEvidenceUrl(open ? ghostEvidenceId : null);

  useEffect(() => {
    if (!open) return;
    setError('');
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false })
      .then((s) => {
        stream.current = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch(() => setError('Camera not available. Allow camera access, or use “Upload photos” instead.'));
    return () => {
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, [open]);

  function capture() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    c.toBlob(
      (blob) => {
        if (!blob) return;
        onCapture(new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' }));
        onClose();
      },
      'image/jpeg',
      0.92,
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={ghostEvidenceId ? 'Line up with the move-in photo' : 'Take a photo'} wide>
      {error ? (
        <Alert tone="warn">{error}</Alert>
      ) : (
        <div className="space-y-4">
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-black">
            <video ref={video} autoPlay playsInline muted className="absolute inset-0 size-full object-cover" />
            {ghostUrl && (
              <img src={ghostUrl} alt="" className="pointer-events-none absolute inset-0 size-full object-cover mix-blend-screen" style={{ opacity: ghost / 100 }} />
            )}
            <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="border border-white/10" />
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4">
            {ghostUrl ? (
              <label className="flex flex-1 items-center gap-3 text-sm text-ink-600">
                <Layers className="size-4 shrink-0" />
                Ghost
                <input type="range" min={0} max={90} value={ghost} onChange={(e) => setGhost(Number(e.target.value))} className="w-full max-w-48 accent-ink-900" />
              </label>
            ) : (
              <span className="text-sm text-ink-500">Fill the frame with the item. Good light helps later comparison.</span>
            )}
            <Button size="lg" onClick={capture}>
              <Camera className="size-5" /> Capture
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
