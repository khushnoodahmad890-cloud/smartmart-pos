import React, { useEffect, useState } from 'react';
import { Clock, Banknote, ArrowDownCircle, ArrowUpCircle, Printer, FileText } from 'lucide-react';
import { api, errMsg } from '../api/client';
import { Card, Button, Input, Badge, Spinner, EmptyState, Pagination, Modal, Textarea } from '../components/ui';
import { money, fmtDateTime } from '../utils/format';
import { toast } from '../stores/toast';
import type { Meta } from '../types';

export default function Shifts() {
  const [current, setCurrent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [openModal, setOpenModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [cashModal, setCashModal] = useState<'in' | 'out' | null>(null);
  const [zReport, setZReport] = useState<any>(null);

  const load = () => {
    setLoading(true);
    api.get('/shifts/current').then(({ data }) => setCurrent(data.data)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold">Shifts & Cash Drawer</h1>
          <p className="text-sm text-slate-400">Open/close shifts, track cash and reconcile the drawer</p>
        </div>
        <div className="ml-auto flex gap-2">
          {!loading && !current && <Button onClick={() => setOpenModal(true)}><Clock size={15} /> Open shift</Button>}
          {current && <>
            <Button variant="secondary" onClick={() => setCashModal('in')}><ArrowDownCircle size={15} /> Cash in</Button>
            <Button variant="secondary" onClick={() => setCashModal('out')}><ArrowUpCircle size={15} /> Cash out</Button>
            <Button variant="danger" onClick={() => setCloseModal(true)}>Close shift (Z-report)</Button>
          </>}
        </div>
      </div>

      {loading ? <Spinner /> : current ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="p-4">
            <p className="text-xs text-slate-400">Shift opened</p>
            <p className="font-bold">{fmtDateTime(current.shift.opened_at)}</p>
            <p className="text-xs text-slate-400 mt-1">Float: {money(current.shift.opening_float)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-400">Sales this shift</p>
            <p className="font-bold text-lg">{money(current.sales_total)}</p>
            <p className="text-xs text-slate-400 mt-1">{current.sales_count} transactions</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-400">Cash received</p>
            <p className="font-bold text-lg text-emerald-600">{money(current.cash_sales)}</p>
            <p className="text-xs text-slate-400 mt-1">refunds {money(current.cash_refunds)} · moves {money(current.cash_movements_net)}</p>
          </Card>
          <Card className="p-4 border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/30">
            <p className="text-xs text-indigo-400">Expected in drawer</p>
            <p className="font-bold text-2xl text-indigo-600 dark:text-indigo-400">{money(current.expected)}</p>
          </Card>
          {current.by_method?.length > 0 && (
            <Card className="p-4 md:col-span-2">
              <p className="text-sm font-semibold mb-2">Takings by method</p>
              {current.by_method.map((m: any) => (
                <div key={m.method} className="flex justify-between py-1 text-sm">
                  <span className="capitalize text-slate-500">{m.method.replace('_', ' ')}</span>
                  <span className="font-medium">{money(m.amount)}</span>
                </div>
              ))}
            </Card>
          )}
          {current.movements?.length > 0 && (
            <Card className="p-4 md:col-span-2">
              <p className="text-sm font-semibold mb-2">Cash movements</p>
              {current.movements.map((m: any) => (
                <div key={m.id} className="flex justify-between py-1 text-sm">
                  <span className="text-slate-500">{m.reason}</span>
                  <span className={`font-medium ${m.type === 'in' ? 'text-emerald-600' : 'text-rose-500'}`}>{m.type === 'in' ? '+' : '−'}{money(m.amount)}</span>
                </div>
              ))}
            </Card>
          )}
        </div>
      ) : (
        <Card><EmptyState title="No open shift" subtitle="Open a shift with your starting float to begin tracking the cash drawer" icon={<Banknote size={40} />} /></Card>
      )}

      <ShiftHistory onView={(r) => setZReport(r)} />

      {/* Open shift */}
      <OpenShiftModal open={openModal} onClose={() => setOpenModal(false)} onDone={() => { setOpenModal(false); load(); }} />
      {/* Cash in/out */}
      {cashModal && <CashModal type={cashModal} onClose={() => setCashModal(null)} onDone={() => { setCashModal(null); load(); }} />}
      {/* Close shift */}
      {closeModal && current && <CloseShiftModal expected={current.expected} onClose={() => setCloseModal(false)}
        onDone={(report: any) => { setCloseModal(false); load(); setZReport(report); }} />}
      {/* Z-report viewer */}
      {zReport && <ZReportModal report={zReport} onClose={() => setZReport(null)} />}
    </div>
  );
}

function OpenShiftModal({ open, onClose, onDone }: any) {
  const [float, setFloat] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    setLoading(true);
    try {
      await api.post('/shifts/open', { opening_float: Number(float) || 0 });
      toast.success('Shift opened');
      onDone();
    } catch (e) { toast.error(errMsg(e)); }
    setLoading(false);
  };
  return (
    <Modal open={open} onClose={onClose} title="Open shift">
      <Input label="Opening float (cash in drawer at start)" type="number" min={0} step="0.01" value={float} onChange={(e) => setFloat(e.target.value)} autoFocus />
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={loading}>Open shift</Button>
      </div>
    </Modal>
  );
}

function CashModal({ type, onClose, onDone }: any) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    setLoading(true);
    try {
      await api.post('/shifts/cash-movement', { type, amount: Number(amount), reason });
      toast.success(`Cash ${type === 'in' ? 'added to' : 'removed from'} drawer`);
      onDone();
    } catch (e) { toast.error(errMsg(e)); }
    setLoading(false);
  };
  return (
    <Modal open onClose={onClose} title={type === 'in' ? 'Cash in (add to drawer)' : 'Cash out (remove from drawer)'}>
      <div className="space-y-3">
        <Input label="Amount" type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        <Input label="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={type === 'in' ? 'e.g. Extra change from safe' : 'e.g. Paid delivery rider'} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={loading}>Record</Button>
        </div>
      </div>
    </Modal>
  );
}

function CloseShiftModal({ expected, onClose, onDone }: any) {
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const diff = counted !== '' ? Math.round((Number(counted) - expected) * 100) / 100 : null;
  const submit = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/shifts/close', { closing_cash: Number(counted), notes });
      toast.success('Shift closed');
      onDone(data.data);
    } catch (e) { toast.error(errMsg(e)); }
    setLoading(false);
  };
  return (
    <Modal open onClose={onClose} title="Close shift — count the drawer">
      <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 mb-3 flex justify-between text-sm">
        <span className="text-indigo-500 font-medium">Expected cash</span>
        <span className="font-bold text-indigo-600 dark:text-indigo-400">{money(expected)}</span>
      </div>
      <div className="space-y-3">
        <Input label="Counted cash in drawer" type="number" min={0} step="0.01" value={counted} onChange={(e) => setCounted(e.target.value)} autoFocus />
        {diff !== null && (
          <div className={`p-2.5 rounded-lg text-sm font-medium ${Math.abs(diff) < 0.01 ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-600'}`}>
            {Math.abs(diff) < 0.01 ? '✓ Drawer balances perfectly' : diff > 0 ? `Over by ${money(diff)}` : `Short by ${money(Math.abs(diff))}`}
          </div>
        )}
        <Textarea label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={submit} loading={loading} disabled={counted === ''}>Close shift</Button>
        </div>
      </div>
    </Modal>
  );
}

function ZReportModal({ report, onClose }: any) {
  const s = report.shift;
  return (
    <Modal open onClose={onClose} title={`Z-Report — Shift #${s.id}`}>
      <div id="print-area" className="text-sm space-y-1.5 bg-white dark:bg-transparent">
        <p className="text-center font-bold text-base mb-2">END OF SHIFT REPORT</p>
        <Row l="Cashier" v={report.shift.user_name || ''} />
        <Row l="Opened" v={fmtDateTime(s.opened_at)} />
        <Row l="Closed" v={s.closed_at ? fmtDateTime(s.closed_at) : '—'} />
        <hr className="border-dashed border-slate-300 dark:border-slate-700" />
        <Row l="Opening float" v={money(s.opening_float)} />
        <Row l={`Sales (${report.sales_count})`} v={money(report.sales_total)} />
        <Row l="Cash received" v={money(report.cash_sales)} />
        <Row l="Cash refunds" v={`−${money(report.cash_refunds)}`} />
        <Row l="Cash in/out" v={money(report.cash_movements_net)} />
        {report.by_method?.map((m: any) => <Row key={m.method} l={`  ${m.method.replace('_', ' ')}`} v={money(m.amount)} muted />)}
        <hr className="border-dashed border-slate-300 dark:border-slate-700" />
        <Row l="EXPECTED CASH" v={money(report.expected)} bold />
        <Row l="COUNTED CASH" v={money(s.closing_cash ?? report.expected)} bold />
        {s.over_short != null && (
          <p className={`flex justify-between font-bold ${Number(s.over_short) === 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
            <span>OVER / SHORT</span><span>{money(s.over_short)}</span>
          </p>
        )}
        {s.notes && <p className="text-xs text-slate-400 pt-1">Notes: {s.notes}</p>}
      </div>
      <div className="flex justify-end gap-2 mt-4 no-print">
        <Button variant="secondary" onClick={() => window.print()}><Printer size={15} /> Print</Button>
        <Button onClick={onClose}>Done</Button>
      </div>
    </Modal>
  );
}

const Row = ({ l, v, bold, muted }: any) => (
  <p className={`flex justify-between ${bold ? 'font-bold' : ''} ${muted ? 'text-slate-400 text-xs' : ''}`}><span>{l}</span><span>{v}</span></p>
);

function ShiftHistory({ onView }: { onView: (r: any) => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<Meta>({ page: 1, limit: 20, total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get('/shifts', { params: { page, limit: 20 } })
      .then(({ data }) => { setRows(data.data); setMeta(data.meta); })
      .finally(() => setLoading(false));
  }, [page]);

  const view = async (id: number, userName: string) => {
    try {
      const { data } = await api.get(`/shifts/${id}/report`);
      onView({ ...data.data, shift: { ...data.data.shift, user_name: userName } });
    } catch (e) { toast.error(errMsg(e)); }
  };

  if (loading) return <Spinner />;

  return (
    <Card>
      <p className="px-4 py-3 text-sm font-semibold border-b border-slate-100 dark:border-slate-800">Shift history</p>
      {rows.length === 0 ? <EmptyState title="No shifts yet" icon={<Clock size={36} />} /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
                <th className="px-4 py-3">Cashier</th><th className="px-4 py-3">Opened</th>
                <th className="px-4 py-3 hidden sm:table-cell">Closed</th>
                <th className="px-4 py-3 text-right">Sales</th><th className="px-4 py-3 text-right hidden md:table-cell">Expected</th>
                <th className="px-4 py-3 text-right">Over/short</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/70">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-medium">{r.user_name}</td>
                  <td className="px-4 py-3 text-slate-500">{fmtDateTime(r.opened_at)}</td>
                  <td className="px-4 py-3 hidden sm:table-cell text-slate-500">{r.closed_at ? fmtDateTime(r.closed_at) : '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold">{money(r.sales_total)} <span className="text-xs text-slate-400">({r.sales_count})</span></td>
                  <td className="px-4 py-3 text-right hidden md:table-cell text-slate-500">{r.expected_cash != null ? money(r.expected_cash) : '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {r.over_short != null ? (
                      <span className={Number(r.over_short) === 0 ? 'text-emerald-600' : 'text-rose-500 font-semibold'}>{money(r.over_short)}</span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3"><Badge color={r.status === 'open' ? 'green' : 'slate'}>{r.status}</Badge></td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => view(r.id, r.user_name)} title="View Z-report" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"><FileText size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={meta.page} limit={meta.limit} total={meta.total} onPage={setPage} />
    </Card>
  );
}
