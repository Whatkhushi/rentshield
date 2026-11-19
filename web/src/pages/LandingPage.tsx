import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Fingerprint,
  Handshake,
  Link2,
  MoveHorizontal,
  Scale,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Logo } from '../components/Logo';

function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="absolute -inset-6 rounded-[2.5rem] bg-gradient-to-br from-ok-500/30 via-ink-400/20 to-transparent blur-2xl" />
      <div className="relative rotate-1 rounded-3xl bg-white p-4 shadow-2xl ring-1 ring-ink-100">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Bedroom · Walls & paint</p>
            <p className="text-sm font-semibold text-ink-900">Move-in vs move-out</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-ok-50 px-2 py-0.5 text-[11px] font-semibold text-ok-700 ring-1 ring-ok-100">
            <CheckCircle2 className="size-3" /> Agreed by both
          </span>
        </div>
        {/* Illustrated wall: left half = move-in, right half = move-out with a stain */}
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-gradient-to-b from-[#e9e4da] to-[#d9d2c4]">
          <div className="absolute inset-x-0 bottom-0 h-[22%] bg-gradient-to-b from-[#b9a58a] to-[#a38e72]" />
          <div className="absolute left-[12%] top-[18%] h-[38%] w-[26%] rounded-sm bg-gradient-to-br from-sky-200 to-sky-100 ring-4 ring-[#f4f1ea]" />
          <div className="absolute right-[14%] top-[28%] size-[22%] rounded-full bg-[radial-gradient(circle,rgb(120_95_60/0.55),rgb(120_95_60/0.15)_60%,transparent_70%)]" />
          <div className="absolute right-[10%] top-[24%] size-[30%] rounded-full ring-2 ring-red-500/80 ring-offset-2 ring-offset-transparent" />
          <div className="absolute inset-y-0 left-1/2 w-0.5 bg-white">
            <span className="absolute top-1/2 left-1/2 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-ink-900 shadow-lg">
              <MoveHorizontal className="size-4" />
            </span>
          </div>
          <span className="absolute left-2 top-2 rounded-full bg-ink-950/70 px-2 py-0.5 text-[10px] font-semibold text-white">Move-in</span>
          <span className="absolute right-2 top-2 rounded-full bg-ink-950/70 px-2 py-0.5 text-[10px] font-semibold text-white">Move-out</span>
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-2">
          <Fingerprint className="size-4 text-ok-600" />
          <span className="font-mono text-[11px] text-ink-600">sha256 8f2a91c4…a7d91c</span>
          <span className="ml-auto text-[11px] font-semibold text-ok-700">Verified</span>
        </div>
      </div>
      <div className="absolute -bottom-8 -left-6 hidden -rotate-3 rounded-2xl bg-ink-900 p-4 text-white shadow-xl sm:block">
        <p className="text-[11px] uppercase tracking-wider text-ink-300">Deposit settlement</p>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-2xl font-bold">₹92,000</span>
          <span className="text-xs text-ok-500">refund</span>
        </div>
        <p className="text-[11px] text-ink-300">₹1,00,000 − ₹8,000 agreed</p>
      </div>
    </div>
  );
}

const STEPS = [
  { icon: Link2, title: 'Create & invite', text: 'Either of you sets up the tenancy and shares a secure link. The other side joins from any browser.' },
  { icon: ClipboardCheck, title: 'Inspect together', text: 'Room-by-room checklist with photos and meter readings. The other party approves or disputes each item.' },
  { icon: Camera, title: 'Compare at move-out', text: 'Retake each photo with the move-in shot as a ghost overlay, then compare side by side.' },
  { icon: Scale, title: 'Settle with evidence', text: 'Every deduction carries a reason and proof. Accept or dispute each one until both of you confirm.' },
];

const FEATURES = [
  { icon: Handshake, title: 'Two-party agreement', text: 'Nothing is “agreed” until the other side approves it. Disputed items get revised and re-reviewed.' },
  { icon: Fingerprint, title: 'Tamper-evident photos', text: 'Each file is fingerprinted with SHA-256 on upload and can be re-verified any time.' },
  { icon: ShieldCheck, title: 'History that can’t be rewritten', text: 'Every action is written to a hash-chained, append-only log. Edits would break the chain.' },
  { icon: MoveHorizontal, title: 'Before / after comparison', text: 'Swipe between move-in and move-out photos, and highlight regions that look different.' },
  { icon: Scale, title: 'Itemised deposit settlement', text: 'Deductions can’t exceed the deposit, must have a reason, and only count once accepted.' },
  { icon: FileText, title: 'One-click PDF record', text: 'Both inspections, photos, the settlement, fingerprints and the full audit log in one file.' },
];

export default function LandingPage() {
  const { user } = useAuth();
  return (
    <div className="min-h-screen overflow-x-hidden">
      {/* ---- Hero ---- */}
      <section className="relative bg-ink-950 text-white">
        <div className="bg-grid absolute inset-0 opacity-[0.07] invert" />
        <div className="absolute -top-40 right-0 size-[36rem] rounded-full bg-ok-500/10 blur-3xl" />
        <nav className="relative mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
          <Logo light />
          <div className="flex items-center gap-2">
            {user ? (
              <Link to="/app" className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-ink-900 hover:bg-ink-50">
                Open dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" className="rounded-xl px-4 py-2 text-sm font-semibold text-white/80 hover:text-white">
                  Log in
                </Link>
                <Link to="/register" className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-ink-900 hover:bg-ink-50">
                  Get started
                </Link>
              </>
            )}
          </div>
        </nav>

        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-24 pt-10 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-16">
          <div className="animate-rise">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-ink-200 ring-1 ring-white/15">
              <span className="size-1.5 rounded-full bg-ok-500" /> For tenants and landlords in India
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
              Get your deposit back.
              <br />
              <span className="bg-gradient-to-r from-ok-500 to-emerald-300 bg-clip-text text-transparent">With proof.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-200">
              Document the flat’s condition <em>together</em> on day one, keep a record neither side can quietly change, and settle the deposit item by
              item when you move out.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to={user ? '/app/new' : '/register'}
                className="inline-flex items-center gap-2 rounded-xl bg-ok-500 px-6 py-3.5 font-semibold text-ink-950 shadow-lg shadow-ok-500/20 hover:bg-emerald-400"
              >
                Start a handover <ArrowRight className="size-4" />
              </Link>
              <a href="#how" className="inline-flex items-center gap-2 rounded-xl px-6 py-3.5 font-semibold text-white ring-1 ring-white/20 hover:bg-white/10">
                See how it works
              </a>
            </div>
            <p className="mt-6 text-sm text-ink-300">Free · Works in the browser · The other party doesn’t need to install anything</p>
          </div>
          <HeroVisual />
        </div>
      </section>

      {/* ---- Problem ---- */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-ok-700">The problem</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">Deposit disputes come down to “it was already like that.”</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { big: '2–10×', small: 'monthly rent is a common security deposit in Indian cities' },
              { big: '0', small: 'shared, agreed record of the flat’s condition in most rentals' },
              { big: '1 line', small: 'is often all a tenant gets: a lump-sum deduction, no breakdown' },
            ].map((s) => (
              <div key={s.big} className="rounded-2xl bg-white p-5 ring-1 ring-ink-100">
                <p className="text-3xl font-extrabold tracking-tight text-ink-900">{s.big}</p>
                <p className="mt-1 text-sm leading-snug text-ink-500">{s.small}</p>
              </div>
            ))}
            <p className="text-sm leading-relaxed text-ink-600 sm:col-span-3">
              Scattered WhatsApp photos don’t settle anything: the other side never agreed to them, and nobody can tell if they were taken on day one.
              RentShield turns the handover into a shared, verifiable record.
            </p>
          </div>
        </div>
      </section>

      {/* ---- How it works ---- */}
      <section id="how" className="border-y border-ink-100 bg-white py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="text-sm font-semibold uppercase tracking-wider text-ok-700">How it works</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">One workflow, from keys handed over to deposit returned.</h2>
          <ol className="mt-10 grid gap-5 md:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative rounded-2xl bg-paper p-5 ring-1 ring-ink-100">
                <span className="absolute right-4 top-4 font-mono text-xs text-ink-300">0{i + 1}</span>
                <div className="grid size-11 place-items-center rounded-xl bg-ink-900 text-white">
                  <s.icon className="size-5" />
                </div>
                <h3 className="mt-4 font-semibold text-ink-900">{s.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-500">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---- Features ---- */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="text-3xl font-bold tracking-tight">Built so neither side has to trust the other’s word.</h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="group rounded-2xl bg-white p-6 ring-1 ring-ink-100 transition-shadow hover:shadow-lg">
              <f.icon className="size-6 text-ok-600" />
              <h3 className="mt-4 font-semibold text-ink-900">{f.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-500">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---- Honesty ---- */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="rounded-3xl bg-warn-50 p-8 ring-1 ring-warn-100">
          <div className="flex items-start gap-4">
            <TriangleAlert className="mt-0.5 size-6 shrink-0 text-warn-700" />
            <div>
              <h3 className="font-semibold text-ink-900">What RentShield doesn’t claim</h3>
              <ul className="mt-2 grid gap-2 text-sm text-ink-700 md:grid-cols-3">
                <li>A fingerprint proves a photo hasn’t changed since upload, not when or where it was taken.</li>
                <li>A highlighted difference is a hint to look closer, not proof of who caused damage.</li>
                <li>The PDF is an organised record both of you acknowledged. It isn’t legal advice.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ---- CTA ---- */}
      <section className="bg-ink-950 py-16 text-center text-white">
        <h2 className="text-3xl font-bold tracking-tight">Moving in soon? Do the handover right.</h2>
        <p className="mt-2 text-ink-300">It takes about 20 minutes, and it can save you months of rent.</p>
        <Link
          to={user ? '/app/new' : '/register'}
          className="mt-7 inline-flex items-center gap-2 rounded-xl bg-ok-500 px-6 py-3.5 font-semibold text-ink-950 hover:bg-emerald-400"
        >
          Start a handover <ArrowRight className="size-4" />
        </Link>
        <p className="mt-10 text-xs text-ink-400">
          RentShield ·{' '}
          <a href="https://github.com/Whatkhushi/rentshield" className="underline hover:text-white">
            Source on GitHub
          </a>
        </p>
      </section>
    </div>
  );
}
