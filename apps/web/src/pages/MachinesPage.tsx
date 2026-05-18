import { useQuery } from '@tanstack/react-query';
import { api } from '../auth';

interface Machine {
  id: string;
  name: string;
  model: string | null;
  locationZone: string | null;
  status: string;
  qrToken: string;
}

export function MachinesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['machines'],
    queryFn: () => api<Machine[]>('/machines'),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Machines</h1>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-4 py-2">Name</th>
              <th className="text-left px-4 py-2">Model</th>
              <th className="text-left px-4 py-2">Zone</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">QR scan URL</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td className="px-4 py-3 text-slate-500" colSpan={5}>Loading…</td></tr>}
            {data?.map(m => (
              <tr key={m.id} className="border-t">
                <td className="px-4 py-2 font-medium">{m.name}</td>
                <td className="px-4 py-2">{m.model ?? '—'}</td>
                <td className="px-4 py-2">{m.locationZone ?? '—'}</td>
                <td className="px-4 py-2">
                  <span className={`badge ${m.status === 'in_service' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {m.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-4 py-2 font-mono text-xs text-slate-500">/api/machines/qr/{m.qrToken}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-slate-500">
        Print the QR scan URL on a sticker per machine. Technicians scan the code → land directly on the machine's
        open service requests + maintenance schedule. No login required — the token is the capability.
      </p>
    </div>
  );
}
