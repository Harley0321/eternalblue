import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import {
  computeIdleGraceDelayMs,
  evaluatePwaAutoApply,
  isElementInteractiveInput,
} from '../domain/autoUpdatePolicy';
import { PwaUpdateManager } from '../pwaUpdateManager';
import { usePos } from '../state/PosContext';

export const PwaUpdatePrompt: React.FC = () => {
  const { state, isPosIdleForAutoUpdate, getLastInteractionAtMs } = usePos();
  const [available, setAvailable] = useState(false);
  const [deferred, setDeferred] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const autoAppliedRef = useRef(false);

  const isIdleRef = useRef(isPosIdleForAutoUpdate);
  isIdleRef.current = isPosIdleForAutoUpdate;

  useEffect(
    () =>
      PwaUpdateManager.subscribe((isAvailable) => {
        setAvailable(isAvailable);
        if (isAvailable) {
          setDeferred(false);
          setApplying(false);
          setError('');
          autoAppliedRef.current = false;
        }
      }),
    []
  );

  const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  const isTabVisible = typeof document === 'undefined' ? true : !document.hidden;
  const decision = evaluatePwaAutoApply({
    hasPendingSwUpdate: available,
    autoUpdateEnabled: state.settings.autoUpdateEnabled,
    isOnline,
    isBusyInPos: !isPosIdleForAutoUpdate || !isTabVisible,
  });

  useEffect(() => {
    if (decision !== 'AUTO_APPLY' || autoAppliedRef.current || applying) return;
    let cancelled = false;
    let timer: number | null = null;

    const scheduleQuietApply = () => {
      const delayMs = computeIdleGraceDelayMs(getLastInteractionAtMs(), Date.now(), 4000, 1200);
      timer = window.setTimeout(() => {
        if (cancelled || autoAppliedRef.current) return;
        const stillOnline = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
        const stillVisible = typeof document === 'undefined' ? true : !document.hidden;
        const inputFocused = isElementInteractiveInput(document.activeElement);
        if (!isIdleRef.current || !stillOnline || !stillVisible || inputFocused) {
          scheduleQuietApply();
          return;
        }
        const lastTap = getLastInteractionAtMs();
        if (lastTap > 0 && Date.now() - lastTap < 3500) {
          scheduleQuietApply();
          return;
        }
        autoAppliedRef.current = true;
        setApplying(true);
        setError('');
        void PwaUpdateManager.apply().catch(() => {
          if (!cancelled) {
            autoAppliedRef.current = false;
            setApplying(false);
            setError('The update could not be applied. Tap Update now to retry.');
          }
        });
      }, delayMs);
    };

    scheduleQuietApply();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [applying, decision, getLastInteractionAtMs]);

  if (!available) return null;

  const applyUpdate = async () => {
    setApplying(true);
    setError('');
    try {
      await PwaUpdateManager.apply();
    } catch {
      setApplying(false);
      setError('The update could not be applied. Try again later.');
    }
  };

  if (deferred && !applying) {
    return (
      <button
        type="button"
        onClick={() => setDeferred(false)}
        className="fixed bottom-16 right-3 z-[70] rounded-full bg-[#0F172A] px-3 py-2 text-xs font-bold text-white shadow-lg cursor-pointer"
      >
        Update ready
      </button>
    );
  }

  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-16 z-[70] mx-auto flex max-w-lg items-center justify-between gap-3 rounded-2xl border border-[#34D399]/40 bg-white p-3 shadow-xl"
    >
      <div className="min-w-0">
        <p className="text-xs font-extrabold text-[#0F172A]">
          {applying ? 'Updating EternalBlue POS…' : 'Update ready'}
        </p>
        <p className="mt-0.5 text-[11px] text-[#475569]">
          {applying
            ? 'Applying the latest version automatically.'
            : state.settings.autoUpdateEnabled
            ? 'Finish your current sale to auto-update, or refresh now.'
            : 'Finish your current sale before refreshing the app.'}
        </p>
        {error && <p className="mt-1 text-[11px] font-semibold text-rose-700">{error}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {!applying && (
          <button
            type="button"
            onClick={() => setDeferred(true)}
            aria-label="Remind me about the app update later"
            className="rounded-lg p-2 text-[#475569] hover:bg-slate-100 cursor-pointer"
          >
            <X size={15} />
          </button>
        )}
        <button
          type="button"
          onClick={() => void applyUpdate()}
          disabled={applying}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-[#059669] px-3 py-2 text-[11px] font-extrabold text-white hover:bg-[#047857] disabled:opacity-60 cursor-pointer"
        >
          <RefreshCw size={13} className={applying ? 'animate-spin' : ''} />
          <span>{applying ? 'Updating…' : 'Update now'}</span>
        </button>
      </div>
    </div>
  );
};
