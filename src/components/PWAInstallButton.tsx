import React, { useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'card';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'compact' }) => {
  const { isInstalled, isIOS, canPromptNatively, promptInstall } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    if (variant === 'card') {
      return (
        <div className="rounded-xl bg-[#ECFDF5] border border-[#059669]/25 px-3 py-2 text-xs font-semibold text-[#047857] flex items-center gap-2">
          <Smartphone size={15} className="shrink-0" />
          <span>Installed on this device as a standalone local-only terminal.</span>
        </div>
      );
    }
    return null;
  }

  if (!canPromptNatively && !isIOS) {
    if (variant === 'card') {
      return (
        <div className="rounded-xl bg-slate-50 border border-[#E2E8F0] px-3 py-2 text-[11px] text-[#475569]">
          Open this page in Chrome/Edge (Android phone or tablet) or Safari (iPhone/iPad) and use{' '}
          <span className="font-bold text-[#0F172A]">Install app / Add to Home Screen</span> to install an independent terminal on that device.
        </div>
      );
    }
    return null;
  }

  const handleClick = async () => {
    if (canPromptNatively) {
      await promptInstall();
    } else if (isIOS) {
      setShowIOSGuide(true);
    }
  };

  return (
    <>
      {variant === 'compact' ? (
        <button
          type="button"
          onClick={() => void handleClick()}
          className="inline-flex items-center gap-1.5 bg-[#059669] hover:bg-[#047857] text-white text-[11px] font-bold px-2.5 py-1.5 rounded-[10px] whitespace-nowrap cursor-pointer transition-colors"
        >
          <Download size={13} />
          <span>Install</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void handleClick()}
          className="w-full min-h-[42px] py-2.5 px-4 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer"
        >
          <Download size={15} />
          <span>{isIOS ? 'Add to Home Screen (iPhone / iPad)' : 'Install App on This Device'}</span>
        </button>
      )}

      {showIOSGuide && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-base text-[#0F172A]">Install on iPhone / iPad</h3>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                aria-label="Close guide"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[#64748B] hover:bg-slate-100 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-[#475569] leading-relaxed">
              Install EternalBlue POS directly onto this device. Its database remains 100% local to this device and will never sync with or alter data on other phones or tablets.
            </p>
            <ol className="text-xs text-[#0F172A] space-y-2 list-decimal list-inside bg-slate-50 rounded-xl p-3 border border-[#E2E8F0]">
              <li className="flex items-center gap-1.5">
                <span>1. Tap the</span>
                <Share size={14} className="text-[#059669] inline shrink-0" />
                <span className="font-bold">Share</span>
                <span>button in Safari</span>
              </li>
              <li>2. Scroll and tap <span className="font-bold">Add to Home Screen</span></li>
              <li>3. Tap <span className="font-bold">Add</span> to launch standalone offline</li>
            </ol>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2.5 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs font-bold cursor-pointer"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
};
