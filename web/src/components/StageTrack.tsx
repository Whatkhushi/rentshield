import { Check } from 'lucide-react';
import { STAGES, stageIndex } from '../lib/format';
import type { Stage } from '../lib/types';
import { cx } from './ui';

/** Compact progress bar of the tenancy workflow. */
export function StageBar({ stage }: { stage: Stage }) {
  const idx = stageIndex(stage);
  return (
    <div className="flex gap-1">
      {STAGES.map((s, i) => (
        <span key={s.key} className={cx('h-1.5 flex-1 rounded-full', i < idx || stage === 'SETTLED' ? 'bg-ok-500' : i === idx ? 'bg-ink-900' : 'bg-ink-100')} />
      ))}
    </div>
  );
}

/** Full stepper with labels, for the tenancy header. */
export function StageStepper({ stage }: { stage: Stage }) {
  const idx = stageIndex(stage);
  return (
    <ol className="flex items-center gap-1 overflow-x-auto pb-1">
      {STAGES.map((s, i) => {
        const done = i < idx || stage === 'SETTLED';
        const current = i === idx && stage !== 'SETTLED';
        return (
          <li key={s.key} className="flex shrink-0 items-center gap-1">
            <span
              className={cx(
                'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
                done && 'bg-ok-500/15 text-ok-500',
                current && 'bg-white text-ink-900',
                !done && !current && 'text-ink-400',
              )}
            >
              {done ? <Check className="size-3.5" /> : <span className="font-mono text-[10px]">{i + 1}</span>}
              {s.label}
            </span>
            {i < STAGES.length - 1 && <span className={cx('h-px w-4', done ? 'bg-ok-500/40' : 'bg-white/15')} />}
          </li>
        );
      })}
    </ol>
  );
}
