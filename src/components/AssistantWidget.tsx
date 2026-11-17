import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, RotateCcw, Send, WifiOff, X } from 'lucide-react';
import type { HeldOrder, Product, SaleRecord, StoreSettings } from '../types';
import { OfflineAssistant } from '../utils/assistantEngine';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

interface AssistantWidgetProps {
  open: boolean;
  products: Product[];
  sales: SaleRecord[];
  heldOrders: HeldOrder[];
  settings: StoreSettings;
  onClose: () => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'bot';
  text: string;
  chips?: string[];
}

function renderFormattedLines(text: string) {
  return text.split('\n').map((line, i) => {
    const segments = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <div key={i} className={line === '' ? 'h-2' : 'leading-relaxed'}>
        {segments.map((seg, j) => {
          if (seg.startsWith('**') && seg.endsWith('**')) {
            return (
              <strong key={j} className="font-bold text-slate-900">
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
  onClose,
}) => {
  const isOnline = useOnlineStatus();
  const assistant = useMemo(() => new OfflineAssistant(), []);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const init = assistant.reset('en');
    return [{ id: 'init', role: 'bot', text: init.text, chips: init.chips }];
  });

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  const askQuestion = (raw: string) => {
    const q = raw.trim();
    if (!q) return;
    const reply = assistant.ask(q, { products, sales, heldOrders, settings });
    setMessages((prev) => [
      ...prev,
      { id: 'u-' + Date.now(), role: 'user', text: q },
      { id: 'b-' + (Date.now() + 1), role: 'bot', text: reply.text, chips: reply.chips },
    ]);
    setInput('');
  };

  const handleReset = () => {
    const init = assistant.reset('en');
    setMessages([{ id: 'init-' + Date.now(), role: 'bot', text: init.text, chips: init.chips }]);
  };

  if (!open) return null;

  return (
    <div
      className="no-print fixed inset-0 z-50 bg-slate-900/30 flex items-end sm:items-end justify-end p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:w-[400px] h-[80vh] sm:h-[540px] bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-emerald-400" />
            <div>
              <div className="text-xs font-extrabold leading-tight">OmniMart Offline Analyst</div>
              <div className="text-[10.5px] text-slate-300 flex items-center gap-1.5">
                <span>Read-only · English &amp; Tagalog</span>
                {!isOnline && (
                  <span className="inline-flex items-center gap-1 text-amber-300 font-semibold">
                    · <WifiOff className="w-3 h-3" /> Offline Mode
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleReset}
              title="Reset chat"
              className="w-8 h-8 rounded-lg hover:bg-slate-800 flex items-center justify-center text-slate-300 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Store Assistant"
              className="w-8 h-8 rounded-lg hover:bg-slate-800 flex items-center justify-center text-slate-300 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-slate-50 text-xs">
              {messages.map((m, idx) => (
                <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 ${
                      m.role === 'user'
                        ? 'bg-slate-900 text-white rounded-br-xs font-medium'
                        : 'bg-white border border-slate-200 text-slate-800 rounded-bl-xs shadow-2xs'
                    }`}
                  >
                    {m.role === 'user' ? m.text : renderFormattedLines(m.text)}
                  </div>

                  {/* Quick-ask chips on latest bot message */}
                  {m.role === 'bot' && idx === messages.length - 1 && m.chips && m.chips.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {m.chips.map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => askQuestion(chip)}
                          className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50 text-[11px] font-semibold text-slate-700 cursor-pointer"
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
              className="p-2.5 border-t border-slate-200 bg-white flex items-center gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask: benta ngayon, restock, magkano..."
                className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-xs focus:border-emerald-600 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!input.trim()}
                aria-label="Send question"
                className="w-9 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center cursor-pointer disabled:opacity-40"
              >
                <Send className="w-4 h-4" />
              </button>
          </form>
        </div>
      </div>
  );
};
