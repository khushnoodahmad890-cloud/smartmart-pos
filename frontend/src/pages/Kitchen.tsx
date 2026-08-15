import React, { useEffect, useState } from 'react';
import { UtensilsCrossed, ChefHat, CheckCircle2, Clock } from 'lucide-react';
import { api, errMsg } from '../api/client';
import { Card, Button, EmptyState, Spinner, Badge } from '../components/ui';
import { toast } from '../stores/toast';
import { useEvents } from '../hooks/useEvents';

/** Kitchen display: live queue of kitchen orders, updates in real time via SSE. */
export default function Kitchen() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    api.get('/kitchen/orders').then(({ data }) => setOrders(data.data)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  useEvents({
    kitchen: () => load(),
  });

  const setStatus = async (id: number, status: string) => {
    try {
      await api.put(`/kitchen/orders/${id}`, { status });
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const age = (d: string) => {
    const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
    return mins < 1 ? 'just now' : `${mins} min`;
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><UtensilsCrossed size={22} className="text-orange-500" /> Kitchen Display</h1>
        <p className="text-sm text-slate-400">Live order queue — updates automatically</p>
      </div>

      {loading ? <Spinner /> : orders.length === 0 ? (
        <Card><EmptyState title="No open kitchen orders" subtitle="Kitchen orders placed at the POS appear here instantly" icon={<ChefHat size={40} />} /></Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {orders.map((o) => (
            <Card key={o.id} className={`p-4 border-2 ${o.kitchen_status === 'preparing' ? 'border-amber-300 dark:border-amber-800' : 'border-slate-200 dark:border-slate-800'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono font-bold">{o.invoice_number.slice(-6)}</span>
                <span className="flex items-center gap-1 text-xs text-slate-400"><Clock size={12} /> {age(o.created_at)}</span>
              </div>
              <Badge color={o.kitchen_status === 'pending' ? 'amber' : 'blue'}>{o.kitchen_status}</Badge>
              <div className="mt-3 space-y-1.5">
                {o.items?.map((it: any, i: number) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span>{it.name}</span>
                    <span className="font-bold">×{it.quantity}</span>
                  </div>
                ))}
              </div>
              {o.notes && <p className="text-xs text-amber-600 mt-2">Note: {o.notes}</p>}
              <div className="mt-4">
                {o.kitchen_status === 'pending' ? (
                  <Button className="w-full !bg-amber-500 hover:!bg-amber-600" onClick={() => setStatus(o.id, 'preparing')}>
                    <ChefHat size={15} /> Start preparing
                  </Button>
                ) : (
                  <Button variant="success" className="w-full" onClick={() => setStatus(o.id, 'ready')}>
                    <CheckCircle2 size={15} /> Mark ready
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
