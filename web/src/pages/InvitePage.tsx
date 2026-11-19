import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Clock, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dateShort, inr } from '../lib/format';
import { Logo } from '../components/Logo';
import { Alert, Button, Card, Spinner } from '../components/ui';

interface Preview {
  role: 'LANDLORD' | 'TENANT';
  inviterName: string;
  property: { addressLine: string; city: string };
  securityDeposit: number;
  expiresAt: string;
  expired: boolean;
  accepted: boolean;
}

export default function InvitePage() {
  const { token } = useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const preview = useQuery({
    queryKey: ['invite', token],
    queryFn: () => api<{ invitation: Preview }>(`/invitations/${token}`),
  });
  const accept = useMutation({
    mutationFn: () => api<{ leaseId: number }>(`/invitations/${token}/accept`, { method: 'POST' }),
    onSuccess: ({ leaseId }) => {
      qc.invalidateQueries({ queryKey: ['leases'] });
      navigate(`/app/tenancy/${leaseId}`);
    },
  });

  const inv = preview.data?.invitation;
  const here = `/invite/${token}`;

  return (
    <div className="bg-grid flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="mb-8">
        <Logo />
      </div>
      <Card className="animate-rise w-full max-w-md p-7">
        {preview.isLoading || loading ? (
          <Spinner />
        ) : preview.error || !inv ? (
          <Alert>This invitation link isn’t valid.</Alert>
        ) : (
          <>
            <div className="grid size-12 place-items-center rounded-2xl bg-ink-900 text-white">
              <ShieldCheck className="size-6" />
            </div>
            <h1 className="mt-5 text-2xl font-bold tracking-tight">
              {inv.inviterName} invited you as the {inv.role === 'LANDLORD' ? 'landlord' : 'tenant'}
            </h1>
            <p className="mt-2 text-sm text-ink-500">
              You’ll review their inspection of the property item by item, so you both agree on its condition, and settle the deposit together at the end.
            </p>
            <div className="mt-6 space-y-3 rounded-2xl bg-ink-50 p-4 text-sm">
              <p className="flex items-start gap-2">
                <Building2 className="mt-0.5 size-4 text-ink-500" />
                <span>
                  {inv.property.addressLine}, {inv.property.city}
                </span>
              </p>
              <p className="flex items-center gap-2">
                <span className="w-4 text-center font-semibold text-ink-500">₹</span> Deposit {inr(inv.securityDeposit)}
              </p>
              <p className="flex items-center gap-2">
                <Clock className="size-4 text-ink-500" /> Link valid until {dateShort(inv.expiresAt)}
              </p>
            </div>

            <div className="mt-6 space-y-3">
              {inv.accepted ? (
                <Alert tone="warn">This invitation has already been used.</Alert>
              ) : inv.expired ? (
                <Alert tone="warn">This invitation has expired. Ask {inv.inviterName} for a new link.</Alert>
              ) : user ? (
                <>
                  {accept.error && <Alert>{(accept.error as Error).message}</Alert>}
                  <Button size="lg" className="w-full" onClick={() => accept.mutate()} disabled={accept.isPending}>
                    {accept.isPending ? 'Joining…' : `Join as ${user.name}`}
                  </Button>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Link to="/register" state={{ from: here }}>
                    <Button size="lg" className="w-full">
                      Sign up
                    </Button>
                  </Link>
                  <Link to="/login" state={{ from: here }}>
                    <Button size="lg" variant="secondary" className="w-full">
                      Log in
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
