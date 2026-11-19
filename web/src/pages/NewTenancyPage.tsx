import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Building, KeyRound, Plus, X } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { inr, PROPERTY_TYPES } from '../lib/format';
import type { Role } from '../lib/types';
import { Alert, Button, Card, Field, cx } from '../components/ui';

const PRESETS: Record<string, string[]> = {
  '1 RK': ['Room', 'Kitchen', 'Bathroom'],
  '1 BHK': ['Living room', 'Bedroom', 'Kitchen', 'Bathroom'],
  '2 BHK': ['Living room', 'Master bedroom', 'Bedroom 2', 'Kitchen', 'Bathroom 1', 'Bathroom 2', 'Balcony'],
  '3 BHK': ['Living room', 'Master bedroom', 'Bedroom 2', 'Bedroom 3', 'Kitchen', 'Bathroom 1', 'Bathroom 2', 'Balcony'],
};

export default function NewTenancyPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [role, setRole] = useState<Role | null>(null);
  const [property, setProperty] = useState({ addressLine: '', city: '', propertyType: 'APARTMENT' });
  const [rooms, setRooms] = useState<string[]>(PRESETS['1 BHK']);
  const [newRoom, setNewRoom] = useState('');
  const [money, setMoney] = useState({ startDate: new Date().toISOString().slice(0, 10), monthlyRent: '', securityDeposit: '' });

  const create = useMutation({
    mutationFn: () =>
      api<{ lease: { id: number } }>('/leases', {
        method: 'POST',
        body: {
          myRole: role,
          property: { ...property, rooms },
          startDate: money.startDate,
          monthlyRent: Number(money.monthlyRent),
          securityDeposit: Number(money.securityDeposit),
        },
      }),
    onSuccess: ({ lease }) => {
      qc.invalidateQueries({ queryKey: ['leases'] });
      navigate(`/app/tenancy/${lease.id}`);
    },
  });

  const canNext = [role !== null, property.addressLine.trim().length >= 5 && property.city.trim().length >= 2 && rooms.length > 0, Number(money.monthlyRent) > 0 && money.securityDeposit !== ''][step];
  const months = Number(money.monthlyRent) > 0 ? Number(money.securityDeposit) / Number(money.monthlyRent) : 0;

  return (
    <div className="animate-rise mx-auto max-w-2xl">
      <button onClick={() => (step ? setStep(step - 1) : navigate('/app'))} className="mb-4 flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft className="size-4" /> {step ? 'Back' : 'Dashboard'}
      </button>
      <h1 className="text-3xl font-bold tracking-tight">New tenancy</h1>
      <div className="mt-4 mb-8 flex gap-2">
        {['Your role', 'The property', 'Rent & deposit'].map((s, i) => (
          <div key={s} className="flex-1">
            <div className={cx('h-1 rounded-full', i <= step ? 'bg-ink-900' : 'bg-ink-100')} />
            <p className={cx('mt-2 text-xs font-medium', i === step ? 'text-ink-900' : 'text-ink-400')}>{s}</p>
          </div>
        ))}
      </div>

      <Card className="p-6">
        {step === 0 && (
          <div>
            <h2 className="text-lg font-semibold">Are you the tenant or the landlord?</h2>
            <p className="mt-1 text-sm text-ink-500">You’ll invite the other party next. They review everything you document.</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {(
                [
                  { value: 'TENANT', icon: KeyRound, title: 'I’m the tenant', text: 'I’m renting this place and want my deposit protected.' },
                  { value: 'LANDLORD', icon: Building, title: 'I’m the landlord', text: 'I own this place and want a clear record of its condition.' },
                ] as const
              ).map((o) => (
                <button
                  key={o.value}
                  onClick={() => setRole(o.value)}
                  className={cx(
                    'rounded-2xl p-5 text-left ring-2 transition-all',
                    role === o.value ? 'bg-ink-900 text-white ring-ink-900' : 'bg-white ring-ink-100 hover:ring-ink-300',
                  )}
                >
                  <o.icon className={cx('size-6', role === o.value ? 'text-ok-500' : 'text-ink-700')} />
                  <p className="mt-3 font-semibold">{o.title}</p>
                  <p className={cx('mt-1 text-sm', role === o.value ? 'text-ink-200' : 'text-ink-500')}>{o.text}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <Field label="Address" placeholder="Flat 402, Lakeview Apartments, 5th Cross, HSR Layout" value={property.addressLine} onChange={(e) => setProperty({ ...property, addressLine: e.target.value })} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="City" placeholder="Bengaluru" value={property.city} onChange={(e) => setProperty({ ...property, city: e.target.value })} />
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink-800">Type</span>
                <select
                  className="block w-full rounded-xl border-0 bg-white px-3.5 py-2.5 text-sm ring-1 ring-ink-200 focus:ring-2 focus:ring-ink-700"
                  value={property.propertyType}
                  onChange={(e) => setProperty({ ...property, propertyType: e.target.value })}
                >
                  {PROPERTY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-ink-800">Rooms ({rooms.length})</span>
                <div className="flex gap-1">
                  {Object.keys(PRESETS).map((p) => (
                    <button key={p} onClick={() => setRooms(PRESETS[p])} className="rounded-lg px-2 py-1 text-xs font-medium text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50">
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 rounded-xl bg-ink-50 p-3">
                {rooms.map((r, i) => (
                  <span key={`${r}-${i}`} className="inline-flex items-center gap-1 rounded-lg bg-white py-1 pr-1 pl-2.5 text-sm ring-1 ring-ink-100">
                    {r}
                    <button onClick={() => setRooms(rooms.filter((_, j) => j !== i))} className="rounded p-0.5 text-ink-300 hover:bg-ink-50 hover:text-red-600" aria-label={`Remove ${r}`}>
                      <X className="size-3.5" />
                    </button>
                  </span>
                ))}
                <form
                  className="inline-flex"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (newRoom.trim().length >= 2) setRooms([...rooms, newRoom.trim()]);
                    setNewRoom('');
                  }}
                >
                  <input value={newRoom} onChange={(e) => setNewRoom(e.target.value)} placeholder="Add room…" className="w-28 rounded-lg border-0 bg-transparent px-2 py-1 text-sm focus:bg-white focus:ring-1 focus:ring-ink-200 focus:outline-none" />
                  <button className="rounded-lg p-1 text-ink-500 hover:bg-white" aria-label="Add room">
                    <Plus className="size-4" />
                  </button>
                </form>
              </div>
              <p className="mt-2 text-xs text-ink-400">Each room gets a standard checklist (walls, floor, fittings…) based on its name.</p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <Field label="Tenancy start date" type="date" value={money.startDate} onChange={(e) => setMoney({ ...money, startDate: e.target.value })} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Monthly rent (₹)" type="number" min={1} inputMode="numeric" placeholder="25000" value={money.monthlyRent} onChange={(e) => setMoney({ ...money, monthlyRent: e.target.value })} />
              <Field label="Security deposit (₹)" type="number" min={0} inputMode="numeric" placeholder="100000" value={money.securityDeposit} onChange={(e) => setMoney({ ...money, securityDeposit: e.target.value })} />
            </div>
            {months > 0 && (
              <div className={cx('rounded-xl p-4 text-sm', months > 2 ? 'bg-warn-50 text-warn-700' : 'bg-ok-50 text-ok-700')}>
                Deposit is <strong>{months.toFixed(1)} months</strong> of rent ({inr(Number(money.securityDeposit))}).
                {months > 2 && ' That’s a lot of money to protect, so the move-in record matters.'}
              </div>
            )}
            {create.error && <Alert>{create.error instanceof ApiError ? create.error.message : 'Could not create tenancy'}</Alert>}
          </div>
        )}

        <div className="mt-8 flex justify-end">
          {step < 2 ? (
            <Button disabled={!canNext} onClick={() => setStep(step + 1)}>
              Continue <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button disabled={!canNext || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? 'Creating…' : 'Create tenancy'} <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
