import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Columns2, Info, MoveHorizontal, ScanSearch } from 'lucide-react';
import { api } from '../../lib/api';
import { CONDITIONS, conditionLabel } from '../../lib/format';
import { useT } from '../../lib/i18n';
import type { Condition, Evidence } from '../../lib/types';
import { BeforeAfter, ChangeDetector } from '../../components/Compare';
import { NoPhoto, PhotoTile } from '../../components/Photo';
import { Alert, Badge, Card, Spinner, cx, type Tone } from '../../components/ui';

interface Pair {
  room: string;
  name: string;
  changed: boolean;
  moveIn: { itemId: number; condition: Condition | null; notes: string | null; evidence: Evidence[] } | null;
  moveOut: { itemId: number; condition: Condition | null; notes: string | null; evidence: Evidence[] };
}

const toneOf = (c: Condition | null) => (CONDITIONS.find((x) => x.value === c)?.tone as Tone) ?? 'muted';
const firstPhoto = (e: Evidence[] | undefined) => e?.find((x) => x.mimeType.startsWith('image/'));

type View = 'slider' | 'side' | 'changes';

export default function CompareTab({ inspectionId }: { inspectionId: number }) {
  const t = useT();
  const [filter, setFilter] = useState<'all' | 'changed'>('changed');
  const { data, isLoading, error } = useQuery({
    queryKey: ['comparison', inspectionId],
    queryFn: () => api<{ pairs: Pair[] }>(`/inspections/${inspectionId}/comparison`),
  });

  if (isLoading) return <Spinner />;
  if (error || !data) return <Alert>{(error as Error)?.message}</Alert>;

  const changed = data.pairs.filter((p) => p.changed);
  const shown = filter === 'changed' && changed.length ? changed : data.pairs;

  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">{t('Move-in vs move-out')}</p>
          <p className="text-lg font-semibold text-ink-900">
            {changed.length === 0 ? t('No condition changes recorded') : t('{a} of {b} items changed condition', { a: changed.length, b: data.pairs.length })}
          </p>
        </div>
        <div className="flex rounded-xl bg-ink-50 p-1 text-sm font-semibold">
          {(['changed', 'all'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={cx('rounded-lg px-3 py-1.5', filter === f ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500')}>
              {f === 'changed' ? t('Changed ({n})', { n: changed.length }) : t('All ({n})', { n: data.pairs.length })}
            </button>
          ))}
        </div>
      </Card>

      <div className="flex items-start gap-2 rounded-xl bg-ink-50 p-3 text-xs text-ink-600">
        <Info className="mt-0.5 size-4 shrink-0" />
        A visual difference is a reason to look closer, not proof of who caused it. Differences are most reliable when both photos were taken from the same
        position, which is what the ghost overlay during move-out is for.
      </div>

      <div className="space-y-5">
        {shown.map((p) => (
          <PairCard key={p.moveOut.itemId} p={p} />
        ))}
      </div>
    </div>
  );
}

function PairCard({ p }: { p: Pair }) {
  const t = useT();
  const before = firstPhoto(p.moveIn?.evidence);
  const after = firstPhoto(p.moveOut.evidence);
  const both = before && after;
  const [view, setView] = useState<View>(both ? 'slider' : 'side');

  return (
    <Card className={cx('p-5', p.changed && 'ring-2 ring-warn-500/30')}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">{p.room}</p>
          <h3 className="font-semibold text-ink-900">{p.name}</h3>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Badge tone={toneOf(p.moveIn?.condition ?? null)}>{t(conditionLabel(p.moveIn?.condition ?? null))}</Badge>
          <ArrowRight className="size-4 text-ink-300" />
          <Badge tone={toneOf(p.moveOut.condition)}>{t(conditionLabel(p.moveOut.condition))}</Badge>
          {p.changed && <Badge tone="warn">{t('Changed')}</Badge>}
        </div>
      </div>

      {both && (
        <div className="mb-3 inline-flex rounded-xl bg-ink-50 p-1 text-xs font-semibold">
          {(
            [
              ['slider', MoveHorizontal, 'Slider'],
              ['side', Columns2, 'Side by side'],
              ['changes', ScanSearch, 'Highlight changes'],
            ] as const
          ).map(([v, Icon, label]) => (
            <button key={v} onClick={() => setView(v)} className={cx('flex items-center gap-1.5 rounded-lg px-3 py-1.5', view === v ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500')}>
              <Icon className="size-3.5" /> {t(label)}
            </button>
          ))}
        </div>
      )}

      {both && view === 'slider' && (
        <div className="max-w-2xl">
          <BeforeAfter beforeId={before.id} afterId={after.id} />
        </div>
      )}
      {both && view === 'changes' && (
        <div className="max-w-2xl">
          <ChangeDetector beforeId={before.id} afterId={after.id} />
        </div>
      )}
      {(!both || view === 'side') && (
        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              ['Move-in', p.moveIn],
              ['Move-out', p.moveOut],
            ] as const
          ).map(([label, side]) => (
            <div key={label}>
              <p className="mb-1.5 text-xs font-semibold text-ink-500">{label}</p>
              {firstPhoto(side?.evidence) ? <PhotoTile ev={firstPhoto(side?.evidence)!} /> : <NoPhoto />}
              {side?.notes && <p className="mt-2 text-sm text-ink-600">{side.notes}</p>}
              {side && side.evidence.length > 1 && <p className="mt-1 text-xs text-ink-400">+{side.evidence.length - 1} more photo(s)</p>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
