import { useCallback, useEffect, useState } from 'react';
import { DeviceBridge } from '../hardware/deviceBridge';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (DeviceBridge.isAndroidHost()) {
      setIsInstalled(true);
      return;
    }

    const checkStandalone = () => {
      const nav = window.navigator as Navigator & { standalone?: boolean };
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
      setIsInstalled(standalone);
    };
    checkStandalone();

    setIsIOS(DeviceBridge.isAppleMobileBrowser());

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);
    const mq = window.matchMedia('(display-mode: standalone)');
    mq.addEventListener?.('change', checkStandalone);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
      mq.removeEventListener?.('change', checkStandalone);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferredPrompt) return 'unavailable';
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setIsInstalled(true);
    }
    return outcome;
  }, [deferredPrompt]);

  const canPromptNatively = Boolean(deferredPrompt);

  return {
    isInstalled,
    isIOS,
    canPromptNatively,
    canInstall: !isInstalled && (canPromptNatively || isIOS),
    promptInstall,
  };
}
