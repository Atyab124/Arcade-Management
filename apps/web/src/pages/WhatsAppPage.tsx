import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../auth';

interface Template {
  id: string;
  name: string;
  category: string;
  trengoHsmId: string;
  body: string;
  status: string;
}

export function WhatsAppPage() {
  const qc = useQueryClient();
  const { data: templates } = useQuery({
    queryKey: ['wa-templates'],
    queryFn: () => api<Template[]>('/whatsapp/templates'),
  });

  const [campaignName, setCampaignName] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [optInOnly, setOptInOnly] = useState(true);
  const [count, setCount] = useState<number | null>(null);

  const previewMutation = useMutation({
    mutationFn: () => api<{ count: number }>('/customers/segment/count', {
      method: 'POST',
      body: JSON.stringify({ whatsappOptIn: optInOnly ? true : undefined }),
    }),
    onSuccess: r => setCount(r.count),
  });

  const campaignMutation = useMutation({
    mutationFn: () => api('/whatsapp/campaigns', {
      method: 'POST',
      body: JSON.stringify({
        name: campaignName,
        templateName,
        variables: {},
        segment: { whatsappOptIn: optInOnly ? true : undefined },
      }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa-campaigns'] });
      setCampaignName('');
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">WhatsApp</h1>

      <div className="card p-5">
        <h2 className="text-lg font-semibold mb-3">Templates</h2>
        <p className="text-sm text-slate-500 mb-3">
          These are the approved Meta templates registered in our system. The `trengoHsmId` is the
          internal Trengo template ID — it must be looked up from the Trengo settings UI after Meta approves
          the template.
        </p>
        <table className="w-full text-sm">
          <thead className="text-slate-500"><tr><th className="text-left">Name</th><th>Category</th><th className="text-left">Body</th><th>Status</th></tr></thead>
          <tbody>
            {templates?.map(t => (
              <tr key={t.id} className="border-t">
                <td className="py-2 font-medium">{t.name}</td>
                <td><span className="badge bg-slate-100 text-slate-700">{t.category}</span></td>
                <td className="text-slate-600 py-2 max-w-md">{t.body}</td>
                <td>{t.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card p-5 max-w-2xl">
        <h2 className="text-lg font-semibold mb-3">New campaign</h2>
        <div className="space-y-3">
          <div>
            <label className="label">Campaign name</label>
            <input className="input" value={campaignName} onChange={e => setCampaignName(e.target.value)} />
          </div>
          <div>
            <label className="label">Template</label>
            <select className="input" value={templateName} onChange={e => setTemplateName(e.target.value)}>
              <option value="">Select…</option>
              {templates?.filter(t => t.status === 'active').map(t => <option key={t.id} value={t.name}>{t.name} ({t.category})</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={optInOnly} onChange={e => setOptInOnly(e.target.checked)} />
            Only customers with WhatsApp opt-in (mandatory for marketing templates)
          </label>
          <div className="flex items-center gap-2">
            <button className="btn-secondary" onClick={() => previewMutation.mutate()}>
              Preview audience size
            </button>
            {count !== null && <span className="text-sm">→ {count} recipients</span>}
          </div>
          <button
            className="btn-primary"
            disabled={!campaignName || !templateName || campaignMutation.isPending}
            onClick={() => campaignMutation.mutate()}
          >
            {campaignMutation.isPending ? 'Sending…' : 'Send campaign'}
          </button>
        </div>
      </div>
    </div>
  );
}
