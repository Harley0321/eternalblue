import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { DeviceBridge } from './hardware/deviceBridge';
import { PwaUpdateManager } from './pwaUpdateManager';
import './index.css';

if (typeof window !== 'undefined' && !DeviceBridge.isAndroidHost() && 'serviceWorker' in navigator) {
  let updateSW: (reloadPage?: boolean) => Promise<void> = async () => {};
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      PwaUpdateManager.notifyAvailable(() => updateSW(true));
    },
    onOfflineReady() {
      // App shell cached locally on this device
    },
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
