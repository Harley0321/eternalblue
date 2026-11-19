import React, { useEffect, useRef, useState } from 'react';
import { Send, X } from 'lucide-react';
import { usePos } from '../state/PosContext';

export const AssistantSheet: React.FC = () => {
  const { state, storePulse, setAssistantOpen, setAssistantLang, askAssistant } = usePos();
  const [input, setInput] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [state.assistantMessages, state.assistantOpen]);

  if (!state.assistantOpen) return null;

  const handleSend = () => {
    if (!input.trim()) return;
    askAssistant(input);
    setInput('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white w-full sm:max-w-lg h-[82vh] sm:h-[560px] rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden shadow-xl">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#E2E8F0] flex items-center justify-between gap-2">
          <div>
            <div className="font-extrabold text-base text-[#0F172A]">EternalBlue Store AI (Offline)</div>
            <div className="text-[11px] text-[#64748B]">Health Score {storePulse.healthScore}/100</div>
          </div>
          <div className="flex items-center gap-1.5">
            {(['EN', 'TL'] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setAssistantLang(lang)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${
                  state.assistantLang === lang
                    ? 'bg-[#EEF2FF] border-[#4F46E5] text-[#4F46E5]'
                    : 'bg-white border-[#E2E8F0] text-[#64748B]'
                }`}
              >
                {lang}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setAssistantOpen(false)}
              aria-label="Close AI"
              className="p-1.5 rounded-lg text-[#64748B] hover:bg-slate-100 cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={listRef} className="flex-1 overflow-y-auto bg-[#F4F6F8] p-3 space-y-2.5">
          {state.assistantMessages.map((msg) => (
            <div key={msg.id} className={`flex flex-col ${msg.isUser ? 'items-end' : 'items-start'}`}>
              <div
                className={`max-w-[90%] rounded-xl px-3 py-2.5 text-[13px] whitespace-pre-line ${
                  msg.isUser
                    ? 'bg-[#4F46E5] text-white'
                    : 'bg-white text-[#0F172A] border border-[#E2E8F0]'
                }`}
              >
                <div>{msg.text}</div>
                {msg.metrics.length > 0 && (
                  <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-0.5">
                    {msg.metrics.map((m) => (
                      <div key={m.label} className="bg-[#F1F5F9] rounded-lg px-2.5 py-1 shrink-0">
                        <div className="text-[10px] text-[#64748B]">{m.label}</div>
                        <div className="text-xs font-bold font-mono text-[#0F172A]">{m.value}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {!msg.isUser && msg.chips.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {msg.chips.map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => askAssistant(ch)}
                      className="px-2.5 py-1 rounded-lg bg-white border border-[#E2E8F0] hover:border-[#4F46E5] text-[11px] font-semibold text-[#0F172A] cursor-pointer"
                    >
                      {ch}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="p-3 border-t border-[#E2E8F0] flex items-center gap-2 bg-white">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSend();
            }}
            placeholder="Ask sales, stockout, or item price…"
            className="flex-1 px-3 py-2 text-[13px] rounded-xl border border-[#E2E8F0] focus:outline-none focus:border-[#4F46E5]"
          />
          <button
            type="button"
            onClick={handleSend}
            aria-label="Send"
            className="p-2.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white cursor-pointer"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
