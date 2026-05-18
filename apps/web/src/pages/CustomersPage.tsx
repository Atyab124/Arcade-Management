import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../auth';

interface Customer {
  id: string;
  fullName: string;
  phoneE164: string;
  email: string | null;
  membershipType: string;
  loyaltyPoints: number;
  vipFlag: boolean;
}

export function CustomersPage() {
  const [q, setQ] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['customers', q],
    queryFn: () => api<{ customers: Customer[] }>(`/customers?q=${encodeURIComponent(q)}`),
  });

  const addMutation = useMutation({
    mutationFn: (input: { fullName: string; phoneE164: string; email?: string }) =>
      api<Customer>('/customers', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      setShowAdd(false);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-4">
        <h1 className="text-2xl font-bold">Customers</h1>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>+ New customer</button>
      </div>
      <input
        className="input max-w-md"
        placeholder="Search by name, phone, or email…"
        value={q}
        onChange={e => setQ(e.target.value)}
      />
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-4 py-2">Name</th>
              <th className="text-left px-4 py-2">Phone</th>
              <th className="text-left px-4 py-2">Membership</th>
              <th className="text-right px-4 py-2">Points</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td className="px-4 py-3 text-slate-500" colSpan={4}>Loading…</td></tr>}
            {data?.customers.map(c => (
              <tr key={c.id} className="border-t hover:bg-slate-50">
                <td className="px-4 py-2">
                  <Link to={`/customers/${c.id}`} className="text-brand-600 hover:underline">
                    {c.fullName}
                  </Link>
                  {c.vipFlag && <span className="ml-2 badge bg-yellow-100 text-yellow-800">VIP</span>}
                </td>
                <td className="px-4 py-2 font-mono text-xs">{c.phoneE164}</td>
                <td className="px-4 py-2 capitalize">{c.membershipType.replace('_', ' ')}</td>
                <td className="px-4 py-2 text-right">{c.loyaltyPoints}</td>
              </tr>
            ))}
            {data?.customers.length === 0 && (
              <tr><td className="px-4 py-3 text-slate-500" colSpan={4}>No customers match.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <AddCustomerForm
          onCancel={() => setShowAdd(false)}
          onSubmit={async (input) => { await addMutation.mutateAsync(input); }}
        />
      )}
    </div>
  );
}

function AddCustomerForm({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (i: { fullName: string; phoneE164: string; email?: string }) => Promise<void> }) {
  const [fullName, setFullName] = useState('');
  const [phoneE164, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <form
        className="card p-6 w-full max-w-md space-y-4"
        onSubmit={async e => {
          e.preventDefault();
          try {
            await onSubmit({ fullName, phoneE164, email: email || undefined });
          } catch (er) {
            setErr(er instanceof Error ? er.message : 'error');
          }
        }}
      >
        <h2 className="text-lg font-semibold">New customer</h2>
        <div>
          <label className="label">Full name</label>
          <input className="input" value={fullName} onChange={e => setFullName(e.target.value)} required />
        </div>
        <div>
          <label className="label">Phone (E.164, e.g. +60123456789)</label>
          <input className="input" value={phoneE164} onChange={e => setPhone(e.target.value)} required />
        </div>
        <div>
          <label className="label">Email (optional)</label>
          <input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        {err && <div className="text-sm text-red-600">{err}</div>}
        <div className="flex gap-2 justify-end">
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn-primary">Save</button>
        </div>
      </form>
    </div>
  );
}
