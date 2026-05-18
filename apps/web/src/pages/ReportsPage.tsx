import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../auth';

export function ReportsPage() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const { data: daily } = useQuery({
    queryKey: ['daily-revenue', date],
    queryFn: () => api<{ pos: { saleCount: number; cashTotal: number; cardTotal: number; walletTotal: number; refundTotal: number; netRevenue: number }; bookings: { deposits: number; balances: number; refunds: number; net: number } }>(`/reports/daily-revenue?date=${date}`),
  });
  const { data: byPackage } = useQuery({
    queryKey: ['booking-revenue'],
    queryFn: () => api<Array<{ packageName: string; bookings: number; revenue: number }>>('/reports/booking-revenue'),
  });
  const { data: machines } = useQuery({
    queryKey: ['machine-performance'],
    queryFn: () => api<Array<{ id: string; name: string; status: string; totalPlays: number; totalCollection: number; payoutAvgPct: number | null }>>('/reports/machine-performance'),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Reports</h1>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Daily revenue</h2>
          <input type="date" className="input max-w-xs" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        {daily && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><div className="text-slate-500">Cash sales</div><div className="text-xl font-bold">RM {daily.pos.cashTotal.toFixed(2)}</div></div>
            <div><div className="text-slate-500">Card/QR</div><div className="text-xl font-bold">RM {daily.pos.cardTotal.toFixed(2)}</div></div>
            <div><div className="text-slate-500">Wallet</div><div className="text-xl font-bold">RM {daily.pos.walletTotal.toFixed(2)}</div></div>
            <div><div className="text-slate-500">Refunds</div><div className="text-xl font-bold text-red-600">RM {daily.pos.refundTotal.toFixed(2)}</div></div>
            <div><div className="text-slate-500">POS net</div><div className="text-xl font-bold">RM {daily.pos.netRevenue.toFixed(2)}</div></div>
            <div><div className="text-slate-500">Booking deposits</div><div className="text-xl font-bold">RM {daily.bookings.deposits.toFixed(2)}</div></div>
            <div><div className="text-slate-500">Booking balances</div><div className="text-xl font-bold">RM {daily.bookings.balances.toFixed(2)}</div></div>
            <div><div className="text-slate-500">Booking net</div><div className="text-xl font-bold">RM {daily.bookings.net.toFixed(2)}</div></div>
          </div>
        )}
      </div>

      <div className="card p-5">
        <h2 className="text-lg font-semibold mb-3">Booking revenue by package (last 90 days)</h2>
        <table className="w-full text-sm">
          <thead className="text-slate-500"><tr><th className="text-left">Package</th><th className="text-right">Bookings</th><th className="text-right">Revenue</th></tr></thead>
          <tbody>
            {byPackage?.map(r => (
              <tr key={r.packageName} className="border-t">
                <td className="py-2">{r.packageName}</td>
                <td className="text-right">{r.bookings}</td>
                <td className="text-right">RM {r.revenue.toFixed(2)}</td>
              </tr>
            ))}
            {byPackage?.length === 0 && <tr><td colSpan={3} className="text-slate-500 py-3">No bookings in period.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card p-5">
        <h2 className="text-lg font-semibold mb-3">Machine performance (last 30 days)</h2>
        <table className="w-full text-sm">
          <thead className="text-slate-500"><tr><th className="text-left">Machine</th><th>Status</th><th className="text-right">Plays</th><th className="text-right">Collection</th><th className="text-right">Avg payout</th></tr></thead>
          <tbody>
            {machines?.map(m => (
              <tr key={m.id} className="border-t">
                <td className="py-2">{m.name}</td>
                <td>{m.status.replace('_', ' ')}</td>
                <td className="text-right">{m.totalPlays}</td>
                <td className="text-right">RM {m.totalCollection.toFixed(2)}</td>
                <td className="text-right">{m.payoutAvgPct !== null ? `${m.payoutAvgPct.toFixed(1)}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
