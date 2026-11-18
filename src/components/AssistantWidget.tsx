import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Bot,
  Check,
  Copy,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  WifiOff,
  X,
} from 'lucide-react';
import type {
  CartLine,
  HeldOrder,
  Product,
  SaleRecord,
  SecurityLogEntry,
  StockLogEntry,
  StoreSettings,
} from '../types';
import {
  computeStorePulse,
  OfflineAssistant,
  type AssistantAction,
  type AssistantBar,
  type AssistantLang,
  type AssistantMetric,
  type AssistantTone,
} from '../utils/assistantEngine';
import { formatPeso } from '../utils/posMath';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

interface AssistantWidgetProps {
  open: boolean;
  products: Product[];
  sales: SaleRecord[];
  heldOrders: HeldOrder[];
  settings: StoreSettings;
  cart?: CartLine[];
  stockLog?: StockLogEntry[];
  securityLog?: SecurityLogEntry[];
  onExecuteAction?: (action: AssistantAction) => void;
  onClose: () => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'bot';
  text: string;
  chips?: string[];
  metrics?: AssistantMetric[];
  bars?: AssistantBar[];
  actions?: AssistantAction[];
}

function toneMetricClass(tone?: AssistantTone): string {
  switch (tone) {
    case 'emerald':
      return 'border-emerald-200 bg-emerald-50/70 text-emerald-900';
    case 'amber':
      return 'border-amber-200 bg-amber-50/70 text-amber-900';
    case 'rose':
      return 'border-rose-200 bg-rose-50/70 text-rose-900';
    case 'indigo':
      return 'border-indigo-200 bg-indigo-50/70 text-indigo-900';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-900';
  }
}

function toneBarClass(tone?: AssistantTone): string {
  switch (tone) {
    case 'emerald':
      return 'bg-emerald-500';
    case 'amber':
      return 'bg-amber-500';
    case 'rose':
      return 'bg-rose-500';
    case 'indigo':
      return 'bg-indigo-500';
    default:
      return 'bg-slate-600';
  }
}

function renderFormattedLines(text: string) {
  return text.split('\n').map((line, i) => {
    const segments = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <div key={i} className={line === '' ? 'h-1.5' : 'leading-relaxed break-words'}>
        {segments.map((seg, j) => {
          if (seg.startsWith('**') && seg.endsWith('**')) {
            return (
              <strong key={j} className="font-bold text-slate-950">
                {seg.slice(2, -2)}
              </strong>
            );
          }
          return <span key={j}>{seg}</span>;
        })}
      </div>
    );
  });
}

export const AssistantWidget: React.FC<AssistantWidgetProps> = ({
  open,
  products,
  sales,
  heldOrders,
  settings,
  cart,
  stockLog,
  securityLog,
  onExecuteAction,
  onClose,
}) => {
  const isOnline = useOnlineStatus();
  const assistant = useMemo(() => new OfflineAssistant(), []);
  const [langPref, setLangPref] = useState<'auto' | AssistantLang>('auto');
  const [input, setInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const init = assistant.reset('en');
    return [{ id: 'init', role: 'bot', text: init.text, chips: init.chips }];
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pulse = useMemo(
    () =>
      computeStorePulse({
        products,
        sales,
        heldOrders,
        settings,
        cart,
        stockLog,
        securityLog,
      }),
    [products, sales, heldOrders, settings, cart, stockLog, securityLog],
  );

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  useEffect(() => {
    if (!open) return;
    const tid = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 60);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(tid);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  const askQuestion = (raw: string, overrideLang?: 'auto' | AssistantLang) => {
    const q = raw.trim();
    if (!q) return;
    const reply = assistant.ask(q, {
      products,
      sales,
      heldOrders,
      settings,
      cart,
      stockLog,
      securityLog,
      preferredLang: overrideLang ?? langPref,
    });
    const ts = Date.now();
    setMessages((prev) => [
      ...prev,
      { id: 'u-' + ts, role: 'user', text: q },
      {
        id: 'b-' + (ts + 1),
        role: 'bot',
        text: reply.text,
        chips: reply.chips,
        metrics: reply.metrics,
        bars: reply.bars,
        actions: reply.actions,
      },
    ]);
    setInput('');
  };

  const handleReset = () => {
    const resetLang: AssistantLang = langPref === 'tl' ? 'tl' : 'en';
    const init = assistant.reset(resetLang);
    setMessages([{ id: 'init-' + Date.now(), role: 'bot', text: init.text, chips: init.chips }]);
  };

  const handleCycleLang = () => {
    const next: 'auto' | AssistantLang =
      langPref === 'auto' ? 'en' : langPref === 'en' ? 'tl' : 'auto';
    setLangPref(next);
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      const clean = text.replace(/\*\*/g, '');
      await navigator.clipboard.writeText(clean);
      setCopiedId(id);
      window.setTimeout(() => {
        setCopiedId((prev) => (prev === id ? null : prev));
      }, 1500);
    } catch {
      // Clipboard unavailable in restricted context
    }
  };

  const isTl = langPref === 'tl';
  const topicButtons = useMemo(() => {
    const items = isTl
      ? [
          { label: 'Briefing', query: 'Kamusta ang tindahan?' },
          { label: 'Closing / EOD', query: 'Closing ngayon' },
          { label: 'Forecast', query: 'Kelan mauubos ang stock?' },
          { label: 'Margin Audit', query: 'Suriin ang tubo at presyo' },
          { label: 'Combos', query: 'Madalas magkasamang bilhin' },
          { label: 'Categories', query: 'Benta bawat kategorya' },
          { label: 'Dayparts', query: 'Benta umaga vs gabi' },
          { label: 'Security', query: 'Kalagayan ng seguridad' },
        ]
      : [
          { label: 'Briefing', query: 'Store briefing' },
          { label: 'Closing / EOD', query: 'Closing report' },
          { label: 'Forecast', query: 'Stockout forecast' },
          { label: 'Margin Audit', query: 'Margin audit' },
          { label: 'Combos', query: 'Frequently bought together' },
          { label: 'Categories', query: 'Category sales' },
          { label: 'Dayparts', query: 'Daypart breakdown' },
          { label: 'Security', query: 'Security health' },
        ];
    if ((cart?.length || 0) > 0) {
      items.splice(1, 0, {
        label: isTl ? `Cart (${cart!.length})` : `Check Cart (${cart!.length})`,
        query: isTl ? 'Suriin ang cart' : 'Check cart',
      });
    }
    return items;
  }, [isTl, cart]);

  if (!open) return null;

  return (
    <div
      className="no-print fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-end sm:items-end justify-end p-0 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="OmniMart Store AI"
      data-testid="assistant-dialog"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:w-[440px] h-[88dvh] sm:h-[620px] max-h-[92dvh] bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-3.5 py-2.5 bg-slate-900 text-white flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-extrabold leading-tight flex items-center gap-1.5 truncate">
                <span>OmniMart Store AI</span>
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[9.5px] font-bold">
                  <ShieldCheck className="w-2.5 h-2.5" /> Read-Only
                </span>
              </div>
              <div className="text-[10.5px] text-slate-300 flex items-center gap-1.5 truncate">
                <span>Offline · Safe on saved data</span>
                {!isOnline && (
                  <span className="inline-flex items-center gap-0.5 text-amber-300 font-semibold">
                    · <WifiOff className="w-3 h-3" /> Offline
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleCycleLang}
              aria-label="Switch assistant language mode"
              data-testid="assistant-lang-btn"
              title="Toggle language: Auto / EN / TL"
              className="px-2 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10.5px] font-bold text-slate-200 cursor-pointer"
            >
              {langPref === 'auto' ? 'Auto' : langPref.toUpperCase()}
            </button>
            <button
              type="button"
              onClick={handleReset}
              aria-label="Reset assistant chat"
              title="Reset chat"
              className="w-7 h-7 rounded-lg hover:bg-slate-800 flex items-center justify-center text-slate-300 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Store Assistant"
              className="w-7 h-7 rounded-lg hover:bg-slate-800 flex items-center justify-center text-slate-300 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Live Store Pulse Strip */}
        <div
          data-testid="assistant-pulse-strip"
          className="px-3 py-2 bg-slate-800 text-white grid grid-cols-3 gap-1.5 border-b border-slate-700 shrink-0"
        >
          <button
            type="button"
            onClick={() => askQuestion(isTl ? 'Kamusta ang tindahan?' : 'Store briefing')}
            className="text-left px-2 py-1 rounded-lg bg-slate-900/70 hover:bg-slate-700/80 border border-slate-700/80 cursor-pointer transition"
          >
            <div className="text-[9.5px] uppercase tracking-wide text-slate-400 font-bold">Health</div>
            <div className="text-xs font-extrabold font-mono-num flex items-center gap-1">
              <span
                className={
                  pulse.healthTone === 'emerald'
                    ? 'text-emerald-400'
                    : pulse.healthTone === 'indigo'
                      ? 'text-indigo-300'
                      : pulse.healthTone === 'amber'
                        ? 'text-amber-300'
                        : 'text-rose-400'
                }
              >
                {pulse.healthScore}/100
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => askQuestion(isTl ? 'Benta ngayon' : "Today's sales")}
            className="text-left px-2 py-1 rounded-lg bg-slate-900/70 hover:bg-slate-700/80 border border-slate-700/80 cursor-pointer transition"
          >
            <div className="text-[9.5px] uppercase tracking-wide text-slate-400 font-bold">Today Net</div>
            <div className="text-xs font-extrabold font-mono-num text-emerald-300 truncate">
              {formatPeso(pulse.todayNet)}
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              askQuestion(
                pulse.cartNearWholesaleCount > 0
                  ? isTl
                    ? 'Suriin ang cart'
                    : 'Check cart'
                  : isTl
                    ? 'Kelan mauubos ang stock?'
                    : 'Stockout forecast',
              )
            }
            className="text-left px-2 py-1 rounded-lg bg-slate-900/70 hover:bg-slate-700/80 border border-slate-700/80 cursor-pointer transition"
          >
            <div className="text-[9.5px] uppercase tracking-wide text-slate-400 font-bold">
              {pulse.cartNearWholesaleCount > 0 ? 'Cart Tip' : 'Alerts'}
            </div>
            <div
              className={`text-xs font-extrabold font-mono-num truncate ${
                pulse.cartNearWholesaleCount > 0
                  ? 'text-indigo-300'
                  : pulse.urgentStockCount + pulse.lossCount > 0
                    ? 'text-amber-300'
                    : 'text-emerald-300'
              }`}
            >
              {pulse.cartNearWholesaleCount > 0
                ? `${pulse.cartNearWholesaleCount} wholesale`
                : pulse.urgentStockCount + pulse.lossCount > 0
                  ? `${pulse.urgentStockCount + pulse.lossCount} urgent`
                  : 'All Clear'}
            </div>
          </button>
        </div>

        {/* Quick Topic Ribbon */}
        <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          {topicButtons.map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={() => askQuestion(t.query)}
              className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50 text-[11px] font-bold text-slate-700 whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer transition"
            >
              <Sparkles className="w-3 h-3 text-emerald-600 shrink-0" />
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-slate-50 text-xs">
          {messages.map((m, idx) => (
            <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div
                className={`max-w-[94%] rounded-2xl px-3.5 py-2.5 ${
                  m.role === 'user'
                    ? 'bg-slate-900 text-white rounded-br-xs font-medium'
                    : 'bg-white border border-slate-200 text-slate-800 rounded-bl-xs shadow-2xs w-full sm:w-auto'
                }`}
              >
                {m.role === 'user' ? (
                  m.text
                ) : (
                  <div className="space-y-2.5">
                    <div>{renderFormattedLines(m.text)}</div>

                    {/* Structured KPI Metrics */}
                    {m.metrics && m.metrics.length > 0 && (
                      <div className="grid grid-cols-2 gap-1.5 pt-1">
                        {m.metrics.map((met, mi) => (
                          <div
                            key={mi}
                            className={`rounded-xl border px-2.5 py-1.5 ${toneMetricClass(met.tone)} ${
                              m.metrics!.length % 2 === 1 && mi === m.metrics!.length - 1 ? 'col-span-2' : ''
                            }`}
                          >
                            <div className="text-[10px] font-bold uppercase opacity-75">
                              {met.label}
                            </div>
                            <div className="text-xs font-extrabold font-mono-num truncate">
                              {met.value}
                            </div>
                            {met.hint && (
                              <div className="text-[10px] opacity-80 truncate">{met.hint}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Micro Progress Bars */}
                    {m.bars && m.bars.length > 0 && (
                      <div className="space-y-1.5 pt-1 border-t border-slate-100">
                        {m.bars.map((b, bi) => (
                          <div key={bi} className="space-y-0.5">
                            <div className="flex items-center justify-between gap-2 text-[11px]">
                              <span className="font-semibold text-slate-700 truncate">{b.label}</span>
                              <span className="font-mono-num font-bold text-slate-900 shrink-0">
                                {b.valueText}
                              </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${toneBarClass(b.tone)}`}
                                style={{ width: `${Math.max(3, Math.min(100, b.pct))}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Safe System Navigation / Inspection Actions */}
                    {m.actions && m.actions.length > 0 && onExecuteAction && (
                      <div className="flex flex-wrap gap-1.5 pt-1.5 border-t border-slate-100">
                        {m.actions.map((act, ai) => (
                          <button
                            key={ai}
                            type="button"
                            onClick={() => onExecuteAction(act)}
                            className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-emerald-300 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition"
                          >
                            <span>{act.label}</span>
                            <ArrowUpRight className="w-3 h-3" />
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Footer Copy Utility */}
                    <div className="flex justify-end pt-0.5">
                      <button
                        type="button"
                        onClick={() => void handleCopy(m.id, m.text)}
                        aria-label="Copy insight summary"
                        className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-slate-400 hover:text-slate-700 cursor-pointer"
                      >
                        {copiedId === m.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span className="text-emerald-600">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Quick-ask chips on latest bot message */}
              {m.role === 'bot' && idx === messages.length - 1 && m.chips && m.chips.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {m.chips.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => askQuestion(chip)}
                      className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50 text-[11px] font-semibold text-slate-700 cursor-pointer transition"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            askQuestion(input);
          }}
          className="p-2.5 border-t border-slate-200 bg-white flex items-center gap-2 shrink-0"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              isTl
                ? 'Tanong: benta ngayon, kelan mauubos, resibo...'
                : 'Ask: briefing, forecast, combos, receipt, magkano...'
            }
            aria-label="Ask OmniMart Store AI"
            className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-slate-300 text-xs focus:border-emerald-600 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            aria-label="Send question"
            className="w-9 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center cursor-pointer disabled:opacity-40 shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
