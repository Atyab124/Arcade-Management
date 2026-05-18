import { useQuery } from '@tanstack/react-query';
import { api } from '../auth';

interface DailyRevenue {
  date: string;
  pos: { saleCount: number; cashTotal: number; cardTotal: number; walletTotal: number; refundTotal: number; netRevenue: number };
  bookings: { deposits: number; balances: number; refunds: number; net: number };
}
interface Segments {
  total: number;
  byMembership: { vip: number; premium: number; basic: number; walkIn: number };
  birthdayThisWeek: number;
  lapsed: number;
}

export function DashboardPage() {
  const today = new Date().toISOString().slice(0, 10);
  const { data: rev } = useQuery({
    queryKey: ['daily-revenue', today],
    queryFn: () => api<DailyRevenue>(`/reports/daily-revenue?date=${today}`),
  });
  const { data: seg } = useQuery({
    queryKey: ['segments'],
    queryFn: () => api<Segments>('/reports/segment-counts'),
  });
  const { data: bookings } = useQuery({
    queryKey: ['todays-bookings', today],
    queryFn: () => api<Array<{ id: string; startAt: string; customer: { fullName: string }; resource: { name: string }; package: { name: string }; guestCount: number }>>(
      `/bookings?from=${today}T00:00:00.000Z&to=${today}T23:59:59.999Z`,
    ),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Kpi label="Today's revenue (POS)" value={rev?.pos.netRevenue ?? 0} currency />
        <Kpi label="Booking deposits today" value={rev?.bookings.deposits ?? 0} currency />
        <Kpi label="Customers" value={seg?.total ?? 0} />
        <Kpi label="Birthdays this week" value={seg?.birthdayThisWeek ?? 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h2 className="text-lg font-semibold mb-3">Today's bookings</h2>
          {bookings && bookings.length === 0 && <div className="text-slate-500 text-sm">No bookings scheduled.</div>}
          <ul className="divide-y">
            {bookings?.map(b => (
              <li key={b.id} className="py-2 flex justify-between text-sm">
                <div>
                  <div className="font-medium">{b.customer.fullName}</div>
                  <div className="text-slate-500">{b.package.name} · {b.resource.name} · {b.guestCount} guests</div>
                </div>
                <div className="text-slate-700">{new Date(b.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-5">
          <h2 className="text-lg font-semibold mb-3">Membership breakdown</h2>
          <ul className="space-y-1 text-sm">
            <li className="flex justify-between"><span>VIP</span><span className="font-medium">{seg?.byMembership.vip ?? 0}</span></li>
            <li className="flex justify-between"><span>Premium</span><span className="font-medium">{seg?.byMembership.premium ?? 0}</span></li>
            <li className="flex justify-between"><span>Basic</span><span className="font-medium">{seg?.byMembership.basic ?? 0}</span></li>
            <li className="flex justify-between"><span>Walk-in</span><span className="font-medium">{seg?.byMembership.walkIn ?? 0}</span></li>
            <li className="flex justify-between border-t pt-2 mt-2"><span className="text-slate-500">Lapsed (60+ days)</span><span className="font-medium">{seg?.lapsed ?? 0}</span></li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, currency }: { label: string; value: number; currency?: boolean }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-2xl font-bold mt-1">{currency ? `RM ${Number(value).toFixed(2)}` : value}</div>
    </div>
  );
}
