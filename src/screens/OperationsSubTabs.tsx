import React, { useMemo, useState } from 'react';
import { KpiCard } from '../components/CommonGraphics';
import { OpsMath } from '../domain/opsMath';
import { PosMath } from '../domain/posMath';
import { DeviceBridge } from '../hardware/deviceBridge';
import { usePos } from '../state/PosContext';
import type { SukiCustomer } from '../types/pos';

export const UtangSubTab: React.FC = () => {
  const { state, addSukiCustomer, recordUtangPayment, toast } = usePos();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [limit, setLimit] = useState('2000');
  const [payingCustomer, setPayingCustomer] = useState<SukiCustomer | null>(null);
  const [payAmount, setPayAmount] = useState('');

  const totalReceivable = useMemo(
    () => PosMath.fromCents(state.sukiCustomers.reduce((acc, c) => acc + PosMath.toCents(c.balance), 0)),
    [state.sukiCustomers]
  );
  const overdueCount = useMemo(
    () => state.sukiCustomers.filter((c) => OpsMath.isCustomerOverdue(c)).length,
    [state.sukiCustomers]
  );

  return (
    <div className="p-3 space-y-2.5 overflow-y-auto h-full bg-[#F4F6F8]">
      <div className="grid grid-cols-2 gap-2">
        <KpiCard
          title="Total Utang"
          value={PosMath.formatPeso(totalReceivable)}
          sub={`${state.sukiCustomers.filter((c) => c.balance > 0).length} active`}
          valueClass="text-[#E11D48]"
        />
        <KpiCard
          title="Overdue"
          value={String(overdueCount)}
          sub="Due date passed"
          valueClass="text-[#D97706]"
        />
      </div>

      <div className="bg-white rounded-[14px] border border-[#E2E8F0] p-3 space-y-2">
        <h3 className="font-bold text-sm text-[#0F172A]">Add New Suki Account</h3>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Customer Name"
          className="w-full px-3 py-2 text-xs rounded-xl border border-[#E2E8F0] focus:outline-none focus:border-[#059669]"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Mobile"
            className="w-full px-3 py-2 text-xs rounded-xl border border-[#E2E8F0] focus:outline-none focus:border-[#059669]"
          />
          <input
            type="number"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            placeholder="Credit Limit (₱)"
            className="w-full px-3 py-2 text-xs rounded-xl border border-[#E2E8F0] focus:outline-none focus:border-[#059669]"
          />
        </div>
        <button
          type="button"
          disabled={!name.trim()}
          onClick={() => {
            addSukiCustomer(name, phone, '', parseFloat(limit) || 2000);
            setName('');
            setPhone('');
          }}
          className="w-full py-2.5 rounded-xl bg-[#059669] hover:bg-[#047857] disabled:bg-slate-300 text-white text-xs font-bold cursor-pointer disabled:cursor-not-allowed"
        >
          Save Suki Account
        </button>
      </div>

      {state.sukiCustomers.map((c) => (
        <div key={c.id} className="bg-white rounded-[14px] border border-[#E2E8F0] p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-extrabold text-[15px] text-[#0F172A] truncate">{c.name}</div>
              <div className="text-[11px] text-[#64748B]">
                {c.phone || 'No phone'} · {c.points} Suki pts · Limit {PosMath.formatPeso(c.creditLimit)}
              </div>
            </div>
            <div
              className={`font-mono font-extrabold text-base shrink-0 ${
                c.balance > 0 ? 'text-[#E11D48]' : 'text-[#047857]'
              }`}
            >
              {PosMath.formatPeso(c.balance)}
            </div>
          </div>

          {c.balance > 0 && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setPayingCustomer(c);
                  setPayAmount(String(c.balance));
                }}
                className="py-2 rounded-xl bg-[#059669] text-white text-xs font-bold cursor-pointer"
              >
                Record Payment
              </button>
              <button
                type="button"
                onClick={async () => {
                  await DeviceBridge.copyText(OpsMath.buildUtangSmsStatement(c, state.settings.storeName));
                  toast(`Copied SMS reminder for ${c.name}`);
                }}
                className="py-2 rounded-xl border border-[#E2E8F0] text-xs font-semibold text-[#0F172A] hover:bg-slate-50 cursor-pointer"
              >
                Copy SMS Reminder
              </button>
            </div>
          )}

          {payingCustomer?.id === c.id && (
            <div className="flex items-center gap-2 pt-1">
              <input
                type="number"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder="Bayad Amount (₱)"
                className="flex-1 px-3 py-2 text-xs rounded-xl border border-[#E2E8F0]"
              />
              <button
                type="button"
                onClick={() => {
                  recordUtangPayment(c.id, parseFloat(payAmount) || 0, 'Cash', 'Bayad Utang');
                  setPayingCustomer(null);
                }}
                className="px-4 py-2 rounded-xl bg-[#059669] text-white text-xs font-bold cursor-pointer"
              >
                Save
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export const RepackSubTab: React.FC = () => {
  const { state, productMap, runRepackRule, addRepackRule } = usePos();
  const [unpackQty, setUnpackQty] = useState('1');
  const [ruleName, setRuleName] = useState('');
  const [yieldStr, setYieldStr] = useState('25');
  const [masterIdx, setMasterIdx] = useState(0);
  const [targetIdx, setTargetIdx] = useState(Math.min(1, Math.max(0, state.products.length - 1)));

  const safeMasterIdx = state.products.length > 0 ? masterIdx % state.products.length : 0;
  const safeTargetIdx = state.products.length > 0 ? targetIdx % state.products.length : 0;

  return (
    <div className="p-3 space-y-2.5 overflow-y-auto h-full bg-[#F4F6F8]">
      <h3 className="font-extrabold text-sm text-[#0F172A]">Active Bulk → Tingi Repack Rules</h3>

      {state.repackRules.map((r) => {
        const master = productMap.get(r.masterProductId);
        const target = productMap.get(r.targetProductId);
        return (
          <div key={r.id} className="bg-white rounded-[14px] border border-[#E2E8F0] p-3 space-y-1.5">
            <div className="font-bold text-sm text-[#0F172A]">{r.name}</div>
            <div className="text-xs text-[#64748B]">
              1 {master?.unit ?? 'bulk'} {master?.name ?? r.masterProductId} →{' '}
              {PosMath.formatQty(r.yieldQty, target?.unit ?? 'pcs')} {target?.name ?? r.targetProductId}
            </div>
            <div className="text-[11px] font-mono text-[#4F46E5]">
              Stock: {PosMath.formatQty(master?.stock ?? 0)} bulk | {PosMath.formatQty(target?.stock ?? 0)} retail
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input
                type="number"
                value={unpackQty}
                onChange={(e) => setUnpackQty(e.target.value)}
                placeholder="Qty to Unpack"
                className="flex-1 px-3 py-2 text-xs rounded-xl border border-[#E2E8F0]"
              />
              <button
                type="button"
                onClick={() => runRepackRule(r, parseFloat(unpackQty) || 1)}
                className="px-4 py-2 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs font-bold cursor-pointer"
              >
                Convert Now
              </button>
            </div>
          </div>
        );
      })}

      {state.products.length >= 2 && (
        <div className="bg-white rounded-[14px] border border-[#E2E8F0] p-3 space-y-2">
          <h4 className="font-bold text-sm text-[#0F172A]">Create New Repack Rule</h4>
          <input
            type="text"
            value={ruleName}
            onChange={(e) => setRuleName(e.target.value)}
            placeholder="Rule Label"
            className="w-full px-3 py-2 text-xs rounded-xl border border-[#E2E8F0]"
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMasterIdx((safeMasterIdx + 1) % state.products.length)}
              className="px-2.5 py-2 rounded-xl border border-[#E2E8F0] text-[11px] font-semibold truncate cursor-pointer hover:bg-slate-50"
            >
              Bulk: {state.products[safeMasterIdx].name}
            </button>
            <button
              type="button"
              onClick={() => setTargetIdx((safeTargetIdx + 1) % state.products.length)}
              className="px-2.5 py-2 rounded-xl border border-[#E2E8F0] text-[11px] font-semibold truncate cursor-pointer hover:bg-slate-50"
            >
              Tingi: {state.products[safeTargetIdx].name}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={yieldStr}
              onChange={(e) => setYieldStr(e.target.value)}
              placeholder="Yield Qty per Bulk"
              className="flex-1 px-3 py-2 text-xs rounded-xl border border-[#E2E8F0]"
            />
            <button
              type="button"
              onClick={() => {
                addRepackRule(
                  ruleName,
                  state.products[safeMasterIdx].id,
                  state.products[safeTargetIdx].id,
                  parseFloat(yieldStr) || 10
                );
                setRuleName('');
              }}
              className="px-4 py-2 rounded-xl bg-[#4F46E5] text-white text-xs font-bold cursor-pointer"
            >
              Add Rule
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const ShiftSubTab: React.FC = () => {
  const { state, startShift, recordDrawerEvent } = usePos();
  const [evType, setEvType] = useState('expense');
  const [evAmt, setEvAmt] = useState('');
  const [evNote, setEvNote] = useState('');

  const startToday = PosMath.startOfDayMs();
  const endToday = startToday + PosMath.DAY_MS;
  const ledger = useMemo(
    () =>
      OpsMath.summarizeShiftDrawer(
        state.sales,
        state.drawerEvents,
        state.utangTransactions,
        state.digitalServices,
        startToday,
        endToday
      ),
    [state.sales, state.drawerEvents, state.utangTransactions, state.digitalServices, startToday, endToday]
  );

  return (
    <div className="p-3 space-y-2.5 overflow-y-auto h-full bg-[#F4F6F8]">
      <div className="grid grid-cols-2 gap-2">
        <KpiCard title="Expected Drawer" value={PosMath.formatPeso(ledger.expectedDrawerCash)} valueClass="text-[#047857]" />
        <KpiCard title="Expenses / Gastos" value={PosMath.formatPeso(ledger.expenses)} valueClass="text-[#E11D48]" />
      </div>

      <div className="bg-white rounded-[14px] border border-[#E2E8F0] p-3 space-y-2.5">
        <h3 className="font-bold text-sm text-[#0F172A]">Switch Active Cashier Shift</h3>
        <div className="flex flex-wrap gap-2">
          {state.cashiers.map((c) => {
            const active = state.activeShift?.cashierId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => startShift(c, 1500)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border cursor-pointer ${
                  active
                    ? 'bg-[#ECFDF5] border-[#059669] text-[#047857]'
                    : 'bg-white border-[#E2E8F0] text-[#64748B]'
                }`}
              >
                {c.name}
              </button>
            );
          })}
        </div>

        <div className="border-t border-[#E2E8F0] pt-2" />
        <h4 className="font-bold text-[13px] text-[#0F172A]">Log Drawer Event (Float / Gastos / Drop)</h4>
        <div className="flex flex-wrap gap-1.5">
          {[
            ['expense', 'Gastos'],
            ['float', 'Float'],
            ['drop', 'Vault Drop'],
            ['topup', 'Top-up'],
          ].map(([id, lbl]) => (
            <button
              key={id}
              type="button"
              onClick={() => setEvType(id)}
              className={`px-3 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${
                evType === id
                  ? 'bg-[#ECFDF5] border-[#059669] text-[#047857]'
                  : 'bg-white border-[#E2E8F0] text-[#64748B]'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            value={evAmt}
            onChange={(e) => setEvAmt(e.target.value)}
            placeholder="Amount (₱)"
            className="w-full px-3 py-2 text-xs rounded-xl border border-[#E2E8F0]"
          />
          <input
            type="text"
            value={evNote}
            onChange={(e) => setEvNote(e.target.value)}
            placeholder="Note"
            className="w-full px-3 py-2 text-xs rounded-xl border border-[#E2E8F0]"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            recordDrawerEvent(evType, evType.toUpperCase(), parseFloat(evAmt) || 0, evNote);
            setEvAmt('');
            setEvNote('');
          }}
          className="w-full py-2.5 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs font-bold cursor-pointer"
        >
          Record Drawer Entry
        </button>
      </div>

      {state.drawerEvents.slice(0, 20).map((ev) => (
        <div
          key={ev.id}
          className="bg-white rounded-[10px] border border-[#E2E8F0] p-3 flex items-center justify-between gap-2"
        >
          <div>
            <div className="font-bold text-[13px] text-[#0F172A]">
              {ev.category}
              {ev.note ? ` — ${ev.note}` : ''}
            </div>
            <div className="text-[11px] text-[#64748B]">{PosMath.formatDateTime(ev.dateIso)}</div>
          </div>
          <div className="font-mono font-extrabold text-sm">{PosMath.formatPeso(ev.amount)}</div>
        </div>
      ))}
    </div>
  );
};

export const ServicesSubTab: React.FC = () => {
  const { state, recordDigitalService } = usePos();
  const [kind, setKind] = useState('GCASH_IN');
  const [amount, setAmount] = useState('');
  const [fee, setFee] = useState('');
  const [phone, setPhone] = useState('');
  const [ref, setRef] = useState('');

  const totalFees = useMemo(
    () => PosMath.fromCents(state.digitalServices.reduce((acc, s) => acc + PosMath.toCents(s.fee), 0)),
    [state.digitalServices]
  );

  return (
    <div className="p-3 space-y-2.5 overflow-y-auto h-full bg-[#F4F6F8]">
      <KpiCard
        title="E-Load & Cash-In/Out Fee Income"
        value={PosMath.formatPeso(totalFees)}
        sub={`${state.digitalServices.length} logged transactions`}
        valueClass="text-[#4F46E5]"
      />

      <div className="bg-white rounded-[14px] border border-[#E2E8F0] p-3 space-y-2.5">
        <h3 className="font-bold text-sm text-[#0F172A]">Log GCash / Maya / E-Load / Bills Pay</h3>
        <div className="flex flex-wrap gap-1.5">
          {[
            ['GCASH_IN', 'GCash In'],
            ['GCASH_OUT', 'GCash Out'],
            ['ELOAD', 'E-Load'],
            ['BILLS_PAY', 'Bills'],
          ].map(([id, lbl]) => (
            <button
              key={id}
              type="button"
              onClick={() => setKind(id)}
              className={`px-3 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${
                kind === id
                  ? 'bg-[#EEF2FF] border-[#4F46E5] text-[#4F46E5]'
                  : 'bg-white border-[#E2E8F0] text-[#64748B]'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            value={amount}
            onChange={(e) => {
              const v = e.target.value;
              setAmount(v);
              const num = parseFloat(v) || 0;
              if (num > 0) setFee(String(OpsMath.suggestServiceFee(kind, num)));
            }}
            placeholder="Principal (₱)"
            className="w-full px-3 py-2 text-xs rounded-xl border border-[#E2E8F0]"
          />
          <input
            type="number"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            placeholder="Tubó / Fee (₱)"
            className="w-full px-3 py-2 text-xs rounded-xl border border-[#E2E8F0]"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Mobile #"
            className="w-full px-3 py-2 text-xs rounded-xl border border-[#E2E8F0]"
          />
          <input
            type="text"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="Ref #"
            className="w-full px-3 py-2 text-xs rounded-xl border border-[#E2E8F0]"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            recordDigitalService(kind, parseFloat(amount) || 0, parseFloat(fee) || 0, phone, ref);
            setAmount('');
            setFee('');
            setPhone('');
            setRef('');
          }}
          className="w-full py-2.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-bold cursor-pointer"
        >
          Log Transaction
        </button>
      </div>

      {state.digitalServices.slice(0, 20).map((d) => (
        <div
          key={d.id}
          className="bg-white rounded-[10px] border border-[#E2E8F0] p-3 flex items-center justify-between gap-2"
        >
          <div>
            <div className="font-bold text-[13px] text-[#0F172A]">
              {d.kind} {d.customerPhone ?? ''}
            </div>
            <div className="text-[11px] text-[#64748B]">{PosMath.formatDateTime(d.dateIso)}</div>
          </div>
          <div className="text-right">
            <div className="font-mono font-bold text-sm">{PosMath.formatPeso(d.amount)}</div>
            <div className="text-[11px] font-bold text-[#047857]">+{PosMath.formatPeso(d.fee)} fee</div>
          </div>
        </div>
      ))}
    </div>
  );
};

function safeCsvCell(raw: string): string {
  const clean = raw.replace(/\r/g, ' ').replace(/\n/g, ' ');
  const trimmed = clean.trimStart();
  const neutralized =
    trimmed.startsWith('=') || trimmed.startsWith('+') || trimmed.startsWith('-') || trimmed.startsWith('@')
      ? `'${clean}`
      : clean;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

export const PrintingSubTab: React.FC = () => {
  const { state, updateSettings, toast } = usePos();

  const handleExportCsv = () => {
    const lines = ['Barcode,Name,Category,RetailPrice,WholesalePrice'];
    state.products.forEach((p) => {
      lines.push(
        `${safeCsvCell(p.barcode)},${safeCsvCell(p.name)},${safeCsvCell(p.category)},${p.retailPrice},${p.wholesalePrice}`
      );
    });
    void DeviceBridge.shareOrDownloadTextFile('eternalblue_shelf_labels.csv', lines.join('\n'), 'text/csv');
    toast('Shelf price labels CSV exported');
  };

  return (
    <div className="p-3 bg-[#F4F6F8] h-full">
      <div className="bg-white rounded-[14px] border border-[#E2E8F0] p-4 space-y-3">
        <h3 className="font-extrabold text-[15px] text-[#0F172A]">Receipt & Barcode Label Utilities</h3>
        <p className="text-xs text-[#64748B]">
          Paper Width: {state.settings.receiptWidth} · Thermal ESC/POS plain text & CSV shelf label export ready.
        </p>
        <div className="flex items-center gap-2">
          {(['80mm', '58mm'] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => updateSettings((s) => ({ ...s, receiptWidth: w }))}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                state.settings.receiptWidth === w
                  ? 'bg-[#ECFDF5] border-[#059669] text-[#047857]'
                  : 'bg-white border-[#E2E8F0] text-[#64748B]'
              }`}
            >
              {w} Thermal
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
          className="px-4 py-2.5 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs font-bold cursor-pointer"
        >
          Export Shelf Price Labels CSV
        </button>
      </div>
    </div>
  );
};
