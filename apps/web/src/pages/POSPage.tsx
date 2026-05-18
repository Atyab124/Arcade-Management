import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../auth';

interface TillSession {
  id: string;
  registerId: string;
  openingCash: string;
  status: string;
  openedAt: string;
}

export function POSPage() {
  const qc = useQueryClient();
  const { data: openTills } = useQuery({
    queryKey: ['till-open'],
    queryFn: () => api<TillSession[]>('/pos/till/open'),
  });
  const openMutation = useMutation({
    mutationFn: () => api<TillSession>('/pos/till/open', {
      method: 'POST',
      body: JSON.stringify({ registerId: 'main', openingCash: 200 }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['till-open'] }),
  });

  const session = openTills?.[0];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Point of Sale</h1>

      {!session && (
        <div className="card p-6 max-w-md">
          <h2 className="text-lg font-semibold mb-2">No till is currently open</h2>
          <p className="text-sm text-slate-500 mb-4">Open a till session before recording sales.</p>
          <button className="btn-primary" disabled={openMutation.isPending} onClick={() => openMutation.mutate()}>
            Open till (RM 200 opening cash)
          </button>
        </div>
      )}

      {session && <ActiveTill session={session} onClosed={() => qc.invalidateQueries({ queryKey: ['till-open'] })} />}
    </div>
  );
}

function ActiveTill({ session, onClosed }: { session: TillSession; onClosed: () => void }) {
  const [items, setItems] = useState<Array<{ sku: string; description: string; qty: number; unitPrice: number }>>([
    { sku: 'TOKEN-10', description: 'Game tokens (10-pack)', qty: 1, unitPrice: 20 },
  ]);
  const [payment, setPayment] = useState('cash');
  const [closing, setClosing] = useState(false);
  const [actualCash, setActualCash] = useState('');

  const total = items.reduce((acc, l) => acc + l.qty * l.unitPrice, 0);

  const saleMutation = useMutation({
    mutationFn: () => api('/pos/sale', {
      method: 'POST',
      body: JSON.stringify({
        tillSessionId: session.id,
        paymentMethod: payment,
        lines: items,
        taxRate: 0,
      }),
    }),
    onSuccess: () => {
      setItems([{ sku: 'TOKEN-10', description: 'Game tokens (10-pack)', qty: 1, unitPrice: 20 }]);
    },
  });

  const closeMutation = useMutation({
    mutationFn: () => api(`/pos/till/${session.id}/close`, {
      method: 'POST',
      body: JSON.stringify({ actualCash: Number(actualCash) }),
    }),
    onSuccess: () => {
      onClosed();
      setClosing(false);
    },
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 card p-5 space-y-4">
        <h2 className="text-lg font-semibold">New sale</h2>
        <table className="w-full text-sm">
          <thead className="text-slate-500">
            <tr><th className="text-left py-1">Item</th><th>Qty</th><th>Price</th><th>Total</th><th /></tr>
          </thead>
          <tbody>
            {items.map((l, idx) => (
              <tr key={idx} className="border-t">
                <td className="py-2">
                  <input className="input" value={l.description} onChange={e => {
                    const next = [...items]; next[idx] = { ...l, description: e.target.value }; setItems(next);
                  }} />
                </td>
                <td><input type="number" className="input w-20" value={l.qty} onChange={e => {
                  const next = [...items]; next[idx] = { ...l, qty: Number(e.target.value) }; setItems(next);
                }} /></td>
                <td><input type="number" step="0.01" className="input w-24" value={l.unitPrice} onChange={e => {
                  const next = [...items]; next[idx] = { ...l, unitPrice: Number(e.target.value) }; setItems(next);
                }} /></td>
                <td className="text-right pr-2">RM {(l.qty * l.unitPrice).toFixed(2)}</td>
                <td><button className="text-red-500" onClick={() => setItems(items.filter((_, i) => i !== idx))}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn-secondary" onClick={() => setItems([...items, { sku: '', description: '', qty: 1, unitPrice: 0 }])}>
          + Add line
        </button>
        <div className="flex justify-between items-center pt-4 border-t">
          <select className="input max-w-xs" value={payment} onChange={e => setPayment(e.target.value)}>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="qr">QR</option>
            <option value="wallet">Wallet</option>
          </select>
          <div className="text-right">
            <div className="text-slate-500 text-sm">Total</div>
            <div className="text-2xl font-bold">RM {total.toFixed(2)}</div>
          </div>
        </div>
        <button className="btn-primary w-full justify-center" disabled={saleMutation.isPending || total <= 0} onClick={() => saleMutation.mutate()}>
          {saleMutation.isPending ? 'Recording…' : 'Record sale'}
        </button>
      </div>

      <div className="card p-5 space-y-3 self-start">
        <h2 className="text-lg font-semibold">Active till</h2>
        <div className="text-sm">
          <div><span className="text-slate-500">Register:</span> {session.registerId}</div>
          <div><span className="text-slate-500">Opened:</span> {new Date(session.openedAt).toLocaleString()}</div>
          <div><span className="text-slate-500">Opening cash:</span> RM {Number(session.openingCash).toFixed(2)}</div>
        </div>
        {!closing ? (
          <button className="btn-secondary w-full" onClick={() => setClosing(true)}>Close till</button>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="label">Actual cash counted</label>
              <input type="number" step="0.01" className="input" value={actualCash} onChange={e => setActualCash(e.target.value)} />
            </div>
            <button className="btn-primary w-full" disabled={closeMutation.isPending || actualCash === ''} onClick={() => closeMutation.mutate()}>
              Close
            </button>
            <button className="btn-secondary w-full" onClick={() => setClosing(false)}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}
