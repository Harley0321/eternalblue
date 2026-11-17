import React, { useEffect, useState } from 'react';
import { Copy, Printer, X } from 'lucide-react';
import type { SaleRecord, StoreSettings } from '../types';
import { formatPeso, formatQty } from '../utils/posMath';

export interface ReadingReport {
  title: string;
  subtitle: string;
  lines: { label: string; value: string; bold?: boolean; dividerAfter?: boolean }[];
}

interface ReceiptModalProps {
  open: boolean;
  sale: SaleRecord | null;
  reading: ReadingReport | null;
  settings: StoreSettings;
  onClose: () => void;
  onToast: (msg: string, type?: 'success' | 'warning' | 'error') => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  open,
  sale,
  reading,
  settings,
  onClose,
  onToast,
}) => {
  const [width, setWidth] = useState<'80mm' | '58mm'>(() =>
    settings.receiptWidth === '58mm' ? '58mm' : '80mm',
  );

  useEffect(() => {
    if (open) {
      setWidth(settings.receiptWidth === '58mm' ? '58mm' : '80mm');
    }
  }, [open, settings.receiptWidth]);

  if (!open || (!sale && !reading)) return null;

  const buildPlainText = () => {
    const out: string[] = [
      settings.storeName.toUpperCase(),
      settings.storeAddress,
      settings.storeTin,
      settings.storePhone ? `Tel: ${settings.storePhone}` : '',
      '--------------------------------',
    ].filter(Boolean);

    if (sale) {
      out.push(`Receipt: ${sale.receiptNo}`);
      out.push(`Date: ${sale.dateFormatted}`);
      if (sale.voided) out.push(`*** VOIDED (${sale.voidReason || 'Cancelled'}) ***`);
      out.push('--------------------------------');
      sale.items.forEach((it) => {
        out.push(it.name);
        out.push(
          `  ${formatQty(it.qty, it.unit)} x ${formatPeso(it.unitPrice)}${it.priceType === 'wholesale' ? ' [W]' : ''} = ${formatPeso(it.lineTotal)}`,
        );
      });
      out.push('--------------------------------');
      out.push(`Retail Subtotal: ${formatPeso(sale.retailSubtotal)}`);
      if (sale.wholesaleSavings > 0) out.push(`Wholesale Savings: -${formatPeso(sale.wholesaleSavings)}`);
      if (sale.seniorDiscount > 0) {
        out.push(`SC/PWD 5% Disc${sale.seniorId ? ` (${sale.seniorId})` : ''}: -${formatPeso(sale.seniorDiscount)}`);
      }
      out.push(`TOTAL: ${formatPeso(sale.grandTotal)}`);
      if (sale.paymentMethod === 'Split' && sale.splitDetails) {
        out.push(`Paid Split: Cash ${formatPeso(sale.splitDetails.cash)} + ${sale.splitDetails.digitalMethod} ${formatPeso(sale.splitDetails.digital)}`);
      } else {
        out.push(`Payment (${sale.paymentMethod}): ${formatPeso(sale.tendered)}`);
        if (sale.change > 0) out.push(`Change: ${formatPeso(sale.change)}`);
      }
      if (sale.refNo) out.push(`Ref #: ${sale.refNo}`);
      out.push('--------------------------------');
      out.push(settings.receiptFooter || 'Thank you for shopping!');
    } else if (reading) {
      out.push(reading.title);
      out.push(reading.subtitle);
      out.push('--------------------------------');
      reading.lines.forEach((l) => {
        out.push(`${l.label}: ${l.value}`);
      });
    }
    return out.join('\n');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildPlainText());
      onToast('Receipt text copied to clipboard', 'success');
    } catch {
      onToast('Copy failed on this browser', 'error');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/55 flex items-center justify-center p-3"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Top bar (hidden when printing) */}
        <div className="no-print px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-extrabold text-slate-800 mr-1">
              {sale ? 'Receipt' : reading?.title}
            </span>
            {(['80mm', '58mm'] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWidth(w)}
                className={`px-2 py-1 rounded text-[11px] font-bold cursor-pointer ${
                  width === w ? 'bg-blue-600 text-white' : 'bg-white border border-slate-300 text-slate-600'
                }`}
              >
                {w}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close receipt"
            className="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center text-slate-600 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Printable Paper Area */}
        <div className="p-4 overflow-y-auto bg-slate-100 flex justify-center">
          <div
            id="receiptPrintArea"
            className={`bg-white text-slate-900 font-mono text-[11.5px] leading-snug p-4 shadow-sm border border-slate-200 ${
              width === '58mm' ? 'w-[58mm] receipt-58mm text-[10.5px]' : 'w-[80mm]'
            }`}
          >
            <div className="text-center space-y-0.5 pb-2 border-b border-dashed border-slate-400">
              <div className="font-bold text-sm uppercase">{settings.storeName}</div>
              <div>{settings.storeAddress}</div>
              <div>{settings.storeTin}</div>
              {settings.storePhone && <div>Tel: {settings.storePhone}</div>}
            </div>

            {sale && (
              <>
                <div className="py-2 border-b border-dashed border-slate-400 space-y-0.5">
                  <div className="flex justify-between">
                    <span>Receipt:</span>
                    <span className="font-bold">{sale.receiptNo}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Date:</span>
                    <span>{sale.dateFormatted}</span>
                  </div>
                  {sale.voided && (
                    <div className="text-center font-bold text-red-700 py-1 border border-red-400 mt-1">
                      *** VOIDED ***
                      {sale.voidReason ? ` (${sale.voidReason})` : ''}
                    </div>
                  )}
                </div>

                <div className="py-2 border-b border-dashed border-slate-400 space-y-1.5">
                  {sale.items.map((it, i) => (
                    <div key={i}>
                      <div className="font-semibold">{it.name}</div>
                      <div className="flex justify-between text-slate-700">
                        <span>
                          {formatQty(it.qty, it.unit)} × {formatPeso(it.unitPrice)}
                          {it.priceType === 'wholesale' ? ' [W]' : ''}
                        </span>
                        <span className="font-bold text-slate-900">{formatPeso(it.lineTotal)}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="py-2 border-b border-dashed border-slate-400 space-y-0.5">
                  <div className="flex justify-between">
                    <span>Retail Subtotal</span>
                    <span>{formatPeso(sale.retailSubtotal)}</span>
                  </div>
                  {sale.wholesaleSavings > 0 && (
                    <div className="flex justify-between">
                      <span>Wholesale Savings</span>
                      <span>−{formatPeso(sale.wholesaleSavings)}</span>
                    </div>
                  )}
                  {sale.seniorDiscount > 0 && (
                    <div className="flex justify-between">
                      <span>SC/PWD 5% Disc{sale.seniorId ? ` (${sale.seniorId})` : ''}</span>
                      <span>−{formatPeso(sale.seniorDiscount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-sm pt-1">
                    <span>TOTAL</span>
                    <span>{formatPeso(sale.grandTotal)}</span>
                  </div>
                </div>

                <div className="py-2 border-b border-dashed border-slate-400 space-y-0.5">
                  {sale.paymentMethod === 'Split' && sale.splitDetails ? (
                    <>
                      <div className="flex justify-between">
                        <span>Cash Portion</span>
                        <span>{formatPeso(sale.splitDetails.cash)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>{sale.splitDetails.digitalMethod} Portion</span>
                        <span>{formatPeso(sale.splitDetails.digital)}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between">
                        <span>Payment ({sale.paymentMethod})</span>
                        <span>{formatPeso(sale.tendered)}</span>
                      </div>
                      {sale.change > 0 && (
                        <div className="flex justify-between font-bold">
                          <span>Change</span>
                          <span>{formatPeso(sale.change)}</span>
                        </div>
                      )}
                    </>
                  )}
                  {sale.refNo && (
                    <div className="flex justify-between">
                      <span>Ref #</span>
                      <span>{sale.refNo}</span>
                    </div>
                  )}
                </div>

                <div className="pt-2.5 text-center space-y-1">
                  <div className="font-semibold">{settings.receiptFooter || 'Thank you for shopping with us!'}</div>
                  <div className="text-[10px] text-slate-500">POS Receipt — Non-BIR Official Invoice</div>
                </div>
              </>
            )}

            {reading && (
              <>
                <div className="py-2 border-b border-dashed border-slate-400 text-center">
                  <div className="font-bold text-xs uppercase">{reading.title}</div>
                  <div className="text-[10.5px] text-slate-600">{reading.subtitle}</div>
                </div>
                <div className="py-2 space-y-1">
                  {reading.lines.map((l, i) => (
                    <React.Fragment key={i}>
                      <div className={`flex justify-between gap-2 ${l.bold ? 'font-bold text-xs pt-0.5' : ''}`}>
                        <span>{l.label}</span>
                        <span>{l.value}</span>
                      </div>
                      {l.dividerAfter && <div className="border-b border-dashed border-slate-400 my-1" />}
                    </React.Fragment>
                  ))}
                </div>
                <div className="pt-2 border-t border-dashed border-slate-400 text-center text-[10px] text-slate-500">
                  Generated {new Date().toLocaleString('en-PH')}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="no-print px-4 py-3 border-t border-slate-200 bg-white flex gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
          >
            <Copy className="w-4 h-4" />
            Copy Text
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            Print ({width})
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
