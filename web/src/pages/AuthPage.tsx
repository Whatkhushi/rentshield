import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Logo } from '../components/Logo';
import { Alert, Button, Field } from '../components/ui';

const DEMO = [
  { label: 'Demo tenant', email: 'tenant@rentshield.dev', password: 'tenant1234' },
  { label: 'Demo landlord', email: 'landlord@rentshield.dev', password: 'landlord1234' },
];

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/app';
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={from} replace />;

  async function submit(e: FormEvent | null, creds = form) {
    e?.preventDefault();
    setBusy(true);
    setError('');
    setFieldErrors({});
    try {
      if (mode === 'register') await register(creds.name, creds.email, creds.password);
      else await login(creds.email, creds.password);
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.details) setFieldErrors(err.details);
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-ink-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="bg-grid absolute inset-0 opacity-[0.07] invert" />
        <div className="absolute -bottom-32 -left-20 size-[30rem] rounded-full bg-ok-500/15 blur-3xl" />
        <div className="relative">
          <Logo light />
        </div>
        <div className="relative">
          <h2 className="max-w-md text-3xl font-bold leading-tight">A handover record that both of you agreed to, and nobody can quietly change.</h2>
          <ul className="mt-8 space-y-3 text-ink-200">
            {['Room-by-room inspection with photos', 'Every file fingerprinted on upload', 'Itemised, evidence-backed deposit settlement'].map((t) => (
              <li key={t} className="flex items-center gap-2.5">
                <CheckCircle2 className="size-5 text-ok-500" /> {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-ink-400">Not legal advice. An organised, verifiable record.</p>
      </aside>

      <div className="flex flex-col justify-center px-4 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
          <p className="mt-1 text-sm text-ink-500">
            {mode === 'login' ? 'Log in to your tenancies.' : 'Tenants and landlords use the same account.'}
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            {error && <Alert>{error}</Alert>}
            {mode === 'register' && <Field label="Full name" required value={form.name} onChange={set('name')} error={fieldErrors.name?.[0]} />}
            <Field label="Email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} error={fieldErrors.email?.[0]} />
            <Field
              label="Password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={mode === 'register' ? 8 : undefined}
              required
              value={form.password}
              onChange={set('password')}
              error={fieldErrors.password?.[0]}
              hint={mode === 'register' ? 'At least 8 characters' : undefined}
            />
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-ink-500">
            {mode === 'login' ? 'New to RentShield? ' : 'Already have an account? '}
            <Link to={mode === 'login' ? '/register' : '/login'} state={location.state} className="font-semibold text-ink-900 hover:underline">
              {mode === 'login' ? 'Create an account' : 'Log in'}
            </Link>
          </p>

          {mode === 'login' && (
            <div className="mt-8 rounded-2xl bg-white p-4 ring-1 ring-ink-100">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Try the demo</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {DEMO.map((d) => (
                  <Button key={d.label} variant="secondary" size="sm" disabled={busy} onClick={() => submit(null, { name: '', ...d })}>
                    {d.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
