import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, Camera, CheckCircle2, ClipboardCheck, Fingerprint, Link2, MoveHorizontal, Scale } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useT } from '../lib/i18n';
import { Logo } from '../components/Logo';
import { LanguageToggle, ThemeToggle } from '../components/Toggles';
import { cx } from '../components/ui';

/** Illustrated example of the core idea: same spot, move-in vs move-out, agreed by both. */
function HeroVisual() {
  const t = useT();
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="absolute -inset-6 rounded-[2.5rem] bg-gradient-to-br from-ok-500/25 via-ink-400/15 to-transparent blur-2xl" />
      <div className="relative rounded-3xl bg-white p-4 shadow-2xl ring-1 ring-ink-100">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">{t('Bedroom · Walls & paint')}</p>
            <p className="text-sm font-semibold text-ink-900">{t('Move-in vs move-out')}</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-ok-50 px-2 py-0.5 text-[11px] font-semibold text-ok-700 ring-1 ring-ok-100">
            <CheckCircle2 className="size-3" /> {t('Agreed by both')}
          </span>
        </div>
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-gradient-to-b from-[#e9e4da] to-[#d9d2c4]">
          <div className="absolute inset-x-0 bottom-0 h-[22%] bg-gradient-to-b from-[#b9a58a] to-[#a38e72]" />
          <div className="absolute left-[12%] top-[18%] h-[38%] w-[26%] rounded-sm bg-gradient-to-br from-sky-200 to-sky-100 ring-4 ring-[#f4f1ea]" />
          <div className="absolute right-[14%] top-[28%] size-[22%] rounded-full bg-[radial-gradient(circle,rgb(120_95_60/0.55),rgb(120_95_60/0.15)_60%,transparent_70%)]" />
          <div className="absolute right-[10%] top-[24%] size-[30%] rounded-full ring-2 ring-red-500/80" />
          <div className="absolute inset-y-0 left-1/2 w-0.5 bg-white">
            <span className="absolute top-1/2 left-1/2 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-ink-900 shadow-lg">
              <MoveHorizontal className="size-4" />
            </span>
          </div>
          <span className="absolute left-2 top-2 rounded-full bg-night/70 px-2 py-0.5 text-[10px] font-semibold text-snow">{t('Move-in')}</span>
          <span className="absolute right-2 top-2 rounded-full bg-night/70 px-2 py-0.5 text-[10px] font-semibold text-snow">{t('Move-out')}</span>
        </div>
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-2 text-xs text-ink-600">
          <Fingerprint className="size-4 shrink-0 text-ok-600" />
          {t('Photo fingerprinted on upload. Unchanged since.')}
        </p>
      </div>
    </div>
  );
}

const FLOW = [
  { icon: Link2, who: 'Either of you', title: 'Create & invite', text: 'Add the flat and its rooms, then send the other person a link.' },
  { icon: ClipboardCheck, who: 'Both', title: 'Move-in inspection', text: 'One documents each item with photos; the other approves or disputes. Then it locks.' },
  { icon: Camera, who: 'Both', title: 'Move-out & compare', text: 'Re-photograph the same items and see move-in vs move-out side by side.' },
  { icon: Scale, who: 'Both', title: 'Settle the deposit', text: 'Each deduction needs a reason and evidence, and is accepted or disputed one by one.' },
];

export default function LandingPage() {
  const { user, loading } = useAuth();
  const t = useT();

  // Signed-in users go straight to their tenancies.
  if (loading) return <div className="min-h-screen bg-night" />;
  if (user) return <Navigate to="/app" replace />;

  return (
    <div className="keep-light relative flex min-h-screen flex-col bg-night text-snow">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-[0.06] invert" />

      <nav className="relative mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-5 sm:px-6">
        <Logo light />
        <div className="flex items-center gap-2">
          <LanguageToggle onDark />
          <ThemeToggle onDark />
          <Link to="/login" className="rounded-xl px-3 py-2 text-sm font-semibold text-white/80 hover:text-white sm:px-4">
            {t('Log in')}
          </Link>
          <Link to="/register" className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-ink-900 hover:bg-ink-50">
            {t('Sign up')}
          </Link>
        </div>
      </nav>

      {/* ---- Hero: the problem and the promise ---- */}
      <section className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pt-8 pb-14 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-14">
        <div className="animate-rise">
          <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-6xl">
            {t('Get your deposit back.')}
            <br />
            <span className="bg-gradient-to-r from-ok-500 to-emerald-300 bg-clip-text text-transparent">{t('With proof.')}</span>
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-ink-200">
            {t(
              'Most deposit fights come down to “it was already like that.” RentShield lets tenant and landlord record the flat’s condition together on day one, so at move-out there’s nothing to argue about.',
            )}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 rounded-xl bg-ok-500 px-6 py-3.5 font-semibold text-night shadow-lg shadow-ok-500/20 hover:bg-emerald-400"
            >
              {t('Get started')} <ArrowRight className="size-4" />
            </Link>
            <Link to="/login" className="inline-flex items-center gap-2 rounded-xl px-6 py-3.5 font-semibold text-white ring-1 ring-white/20 hover:bg-white/10">
              {t('Try the demo')}
            </Link>
          </div>
        </div>
        <HeroVisual />
      </section>

      {/* ---- How it works: one schematic flow ---- */}
      <section className="relative flex-1 border-t border-white/10 bg-ink-900/40">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <p className="text-sm font-semibold uppercase tracking-wider text-ok-500">{t('How it works')}</p>
          <ol className="mt-6 grid gap-4 md:grid-cols-4">
            {FLOW.map((s, i) => (
              <li key={s.title} className="relative">
                <div className="h-full rounded-2xl bg-white/[0.04] p-5 ring-1 ring-white/10">
                  <div className="flex items-center justify-between">
                    <span className="grid size-9 place-items-center rounded-full bg-ok-500 text-sm font-bold text-night">{i + 1}</span>
                    <s.icon className="size-5 text-ink-300" />
                  </div>
                  <h3 className="mt-4 font-semibold">{t(s.title)}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-300">{t(s.text)}</p>
                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{t(s.who)}</p>
                </div>
                {i < FLOW.length - 1 && (
                  <ArrowRight
                    className={cx('absolute top-1/2 -right-[14px] z-10 hidden size-5 -translate-y-1/2 rounded-full bg-night text-ok-500 md:block')}
                  />
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>
      <footer className="relative border-t border-white/10 py-5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 text-xs text-ink-400 sm:px-6">
          <span>© {new Date().getFullYear()} RentShield</span>
          <span>
            {t('Made with')} <span className="text-red-400">♥</span> {t('in India')}
          </span>
        </div>
      </footer>
    </div>
  );
}
