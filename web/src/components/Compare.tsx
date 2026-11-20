import { useEffect, useRef, useState } from 'react';
import { ssim } from 'ssim.js';
import { MoveHorizontal, ScanSearch } from 'lucide-react';
import { evidenceUrl, useEvidenceUrl } from '../lib/files';
import { Button, cx } from './ui';

/** Drag the handle to wipe between the move-in and move-out photo. */
export function BeforeAfter({ beforeId, afterId }: { beforeId: number; afterId: number }) {
  const before = useEvidenceUrl(beforeId);
  const after = useEvidenceUrl(afterId);
  const [pos, setPos] = useState(50);
  const box = useRef<HTMLDivElement>(null);

  const move = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (r) setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  };

  return (
    <div
      ref={box}
      className="relative aspect-[4/3] w-full cursor-ew-resize touch-none select-none overflow-hidden rounded-2xl bg-night"
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        move(e.clientX);
      }}
      onPointerMove={(e) => e.buttons === 1 && move(e.clientX)}
    >
      {after && <img src={after} alt="Move-out" className="absolute inset-0 size-full object-cover" draggable={false} />}
      {before && (
        <img
          src={before}
          alt="Move-in"
          className="absolute inset-0 size-full object-cover"
          style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
          draggable={false}
        />
      )}
      <span className="absolute left-3 top-3 rounded-full bg-night/70 px-2.5 py-1 text-[11px] font-semibold text-snow backdrop-blur">Move-in</span>
      <span className="absolute right-3 top-3 rounded-full bg-night/70 px-2.5 py-1 text-[11px] font-semibold text-snow backdrop-blur">Move-out</span>
      <div className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.15)]" style={{ left: `${pos}%` }}>
        <span className="absolute top-1/2 left-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-ink-900 shadow-lg">
          <MoveHorizontal className="size-4" />
        </span>
      </div>
    </div>
  );
}

async function toImageData(id: number, width: number, height: number) {
  const url = await evidenceUrl(id);
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d')!;
  // Cover-crop to the same aspect so both images line up pixel for pixel.
  const scale = Math.max(width / img.width, height / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
  return ctx.getImageData(0, 0, width, height);
}

/**
 * Structural Similarity (SSIM) between the two photos, computed in the
 * browser. Low-similarity regions are painted as a red overlay on the
 * move-out photo. This is a hint for humans to look closer, not a verdict.
 */
export function ChangeDetector({ beforeId, afterId }: { beforeId: number; afterId: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const after = useEvidenceUrl(afterId);
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [score, setScore] = useState<number | null>(null);
  const [changedPct, setChangedPct] = useState<number | null>(null);

  useEffect(() => {
    setState('idle');
    setScore(null);
  }, [beforeId, afterId]);

  async function run() {
    setState('running');
    try {
      const W = 320;
      const H = 240;
      const [a, b] = await Promise.all([toImageData(beforeId, W, H), toImageData(afterId, W, H)]);
      const { mssim, ssim_map } = ssim(a, b, { ssim: 'bezkrovny' });

      const ctx = canvas.current!.getContext('2d')!;
      canvas.current!.width = ssim_map.width;
      canvas.current!.height = ssim_map.height;
      const heat = ctx.createImageData(ssim_map.width, ssim_map.height);
      let changed = 0;
      for (let i = 0; i < ssim_map.data.length; i++) {
        const v = ssim_map.data[i];
        const diff = Math.max(0, Math.min(1, (0.75 - v) / 0.75)); // only highlight clearly different areas
        if (v < 0.5) changed++;
        heat.data[i * 4] = 239;
        heat.data[i * 4 + 1] = 68;
        heat.data[i * 4 + 2] = 68;
        heat.data[i * 4 + 3] = Math.round(diff * 190);
      }
      ctx.putImageData(heat, 0, 0);
      setScore(mssim);
      setChangedPct((changed / ssim_map.data.length) * 100);
      setState('done');
    } catch {
      setState('error');
    }
  }

  return (
    <div>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-night">
        {after && <img src={after} alt="Move-out" className="absolute inset-0 size-full object-cover" />}
        <canvas ref={canvas} className={cx('absolute inset-0 size-full transition-opacity', state === 'done' ? 'opacity-100' : 'opacity-0')} />
        {state !== 'done' && (
          <div className="absolute inset-0 grid place-items-center bg-night/40 backdrop-blur-[2px]">
            <Button variant="light" onClick={run} disabled={state === 'running'}>
              <ScanSearch className="size-4" />
              {state === 'running' ? 'Comparing pixels…' : state === 'error' ? 'Try again' : 'Highlight possible changes'}
            </Button>
          </div>
        )}
      </div>
      {state === 'done' && score !== null && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
          <span>
            Similarity <strong className="font-mono text-ink-800">{(score * 100).toFixed(1)}%</strong>
          </span>
          <span>
            Area flagged <strong className="font-mono text-ink-800">{changedPct!.toFixed(1)}%</strong>
          </span>
          <span className="text-ink-400">Red = looks different. Only meaningful if both photos were taken from the same spot.</span>
        </div>
      )}
    </div>
  );
}
