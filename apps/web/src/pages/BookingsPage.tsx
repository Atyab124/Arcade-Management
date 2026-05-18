import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../auth';

interface Booking {
  id: string;
  startAt: string;
  endAt: string;
  guestCount: number;
  customer: { fullName: string; phoneE164: string };
  resource: { name: string; color: string };
  package: { name: string };
  invoice: { total: string; payments: Array<{ amount: string; type: string }> } | null;
  cancelledAt: string | null;
}

function startOfWeek(d: Date): Date {
  const out = new Date(d);
  const dow = out.getUTCDay();
  out.setUTCDate(out.getUTCDate() - dow);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

export function BookingsPage() {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  const { data, isLoading } = useQuery({
    queryKey: ['bookings', weekStart.toISOString()],
    queryFn: () => api<Booking[]>(`/bookings?from=${weekStart.toISOString()}&to=${weekEnd.toISOString()}`),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Bookings</h1>
        <div className="flex items-center gap-2">
          <button
            className="btn-secondary"
            onClick={() => {
              const w = new Date(weekStart);
              w.setUTCDate(w.getUTCDate() - 7);
              setWeekStart(w);
            }}
          >← Prev week</button>
          <span className="text-sm text-slate-600">
            {weekStart.toISOString().slice(0, 10)} – {new Date(weekEnd.getTime() - 86400000).toISOString().slice(0, 10)}
          </span>
          <button
            className="btn-secondary"
            onClick={() => {
              const w = new Date(weekStart);
              w.setUTCDate(w.getUTCDate() + 7);
              setWeekStart(w);
            }}
          >Next week →</button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }, (_, i) => {
          const day = new Date(weekStart);
          day.setUTCDate(day.getUTCDate() + i);
          const dayKey = day.toISOString().slice(0, 10);
          const dayBookings = data?.filter(b => b.startAt.slice(0, 10) === dayKey) ?? [];
          return (
            <div key={dayKey} className="card p-3 min-h-[200px]">
              <div className="text-xs uppercase text-slate-500 mb-2">
                {day.toLocaleDateString(undefined, { weekday: 'short' })}<br />
                <span className="text-sm text-slate-700 normal-case">{dayKey.slice(5)}</span>
              </div>
              {dayBookings.map(b => (
                <div
                  key={b.id}
                  className="text-xs p-2 rounded mb-1 border-l-2"
                  style={{ borderColor: b.resource.color, background: `${b.resource.color}15` }}
                >
                  <div className="font-medium">{b.startAt.slice(11, 16)} · {b.customer.fullName}</div>
                  <div className="text-slate-600">{b.package.name}</div>
                  <div className="text-slate-500">{b.guestCount} guests · {b.resource.name}</div>
                  {b.cancelledAt && <div className="text-red-500 mt-1">Cancelled</div>}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {isLoading && <div className="text-slate-500">Loading…</div>}
    </div>
  );
}
