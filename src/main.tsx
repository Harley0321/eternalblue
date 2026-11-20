import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { DeviceBridge } from './hardware/deviceBridge';
import './index.css';

if (typeof window !== 'undefined' && !DeviceBridge.isAndroidHost() && 'serviceWorker' in navigator) {
  registerSW({
    immediate: true,
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
