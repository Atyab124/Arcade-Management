import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../auth';

interface CustomerDetail {
  id: string;
  fullName: string;
  phoneE164: string;
  email: string | null;
  dateOfBirth: string | null;
  membershipType: string;
  loyaltyPoints: number;
  lifetimeSpend: string;
  visitCount: number;
  lastVisitDate: string | null;
  vipFlag: boolean;
  notes: string | null;
  consents: Array<{ id: string; channel: string; action: string; source: string; createdAt: string }>;
}

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => api<CustomerDetail>(`/customers/${id}`),
    enabled: !!id,
  });

  const optMutation = useMutation({
    mutationFn: (action: 'opt_in' | 'opt_out') =>
      api(`/customers/${id}/consent`, {
        method: 'POST',
        body: JSON.stringify({
          channel: 'whatsapp',
          action,
          source: 'manual',
          noticeVersion: '1.0',
        }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customer', id] }),
  });

  if (isLoading || !data) return <div>Loading…</div>;

  const latestWa = [...data.consents].reverse().find(c => c.channel === 'whatsapp');
  const optedIn = latestWa?.action === 'opt_in';

  return (
    <div className="space-y-6">
      <div>
        <Link to="/customers" className="text-sm text-slate-500 hover:text-slate-900">← All customers</Link>
        <h1 className="text-2xl font-bold mt-1">{data.fullName}</h1>
        {data.vipFlag && <span className="badge bg-yellow-100 text-yellow-800 ml-2">VIP</span>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card p-5 space-y-2 text-sm">
          <h2 className="text-lg font-semibold mb-2">Contact</h2>
          <div><span className="text-slate-500">Phone:</span> <span className="font-mono">{data.phoneE164}</span></div>
          <div><span className="text-slate-500">Email:</span> {data.email ?? '—'}</div>
          <div><span className="text-slate-500">DOB:</span> {data.dateOfBirth?.slice(0, 10) ?? '—'}</div>
          <div><span className="text-slate-500">Membership:</span> <span className="capitalize">{data.membershipType.replace('_', ' ')}</span></div>
          {data.notes && <div className="mt-2"><div className="text-slate-500 mb-1">Notes</div>{data.notes}</div>}
        </div>

        <div className="card p-5 text-sm space-y-2">
          <h2 className="text-lg font-semibold mb-2">Lifetime</h2>
          <div><span className="text-slate-500">Loyalty points:</span> {data.loyaltyPoints}</div>
          <div><span className="text-slate-500">Lifetime spend:</span> RM {Number(data.lifetimeSpend).toFixed(2)}</div>
          <div><span className="text-slate-500">Visits:</span> {data.visitCount}</div>
          <div><span className="text-slate-500">Last visit:</span> {data.lastVisitDate?.slice(0, 10) ?? '—'}</div>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-semibold">WhatsApp consent</h2>
          <span className={`badge ${optedIn ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-700'}`}>
            {optedIn ? 'Opted in' : 'Not opted in'}
          </span>
        </div>
        <div className="flex gap-2 mb-4">
          <button
            className="btn-primary"
            disabled={optedIn || optMutation.isPending}
            onClick={() => optMutation.mutate('opt_in')}
          >
            Record opt-in
          </button>
          <button
            className="btn-secondary"
            disabled={!optedIn || optMutation.isPending}
            onClick={() => optMutation.mutate('opt_out')}
          >
            Record opt-out
          </button>
        </div>
        <table className="w-full text-sm">
          <thead className="text-slate-500">
            <tr><th className="text-left py-1">Date</th><th className="text-left py-1">Channel</th><th className="text-left py-1">Action</th><th className="text-left py-1">Source</th></tr>
          </thead>
          <tbody>
            {data.consents.map(c => (
              <tr key={c.id} className="border-t">
                <td className="py-1">{new Date(c.createdAt).toLocaleString()}</td>
                <td className="py-1">{c.channel}</td>
                <td className="py-1">{c.action}</td>
                <td className="py-1 text-slate-500">{c.source}</td>
              </tr>
            ))}
            {data.consents.length === 0 && <tr><td colSpan={4} className="text-slate-500 py-2">No consent events recorded.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
