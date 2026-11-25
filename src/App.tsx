import React from 'react';
import { ToastHostOverlay } from './components/CommonGraphics';
import { PosBottomBar, PosTopBar } from './components/TopBarAndNav';
import { AssistantSheet } from './modals/AssistantSheet';
import { CheckoutModal, ReceiptModal } from './modals/CheckoutAndReceiptModals';
import { BatchStockModal, StockLogModal } from './modals/InventoryBatchModals';
import { ProductModal, StockAdjustModal } from './modals/InventoryProductModals';
import { PwaUpdatePrompt } from './components/PwaUpdatePrompt';
import { DeviceBridge } from './hardware/deviceBridge';
import { SmallModalsHost } from './modals/SmallModals';
import { PosProvider, usePos } from './state/PosContext';

const PosScreen = React.lazy(() =>
  import('./screens/PosScreen').then((module) => ({ default: module.PosScreen }))
);
const InventoryScreen = React.lazy(() =>
  import('./screens/InventoryScreen').then((module) => ({ default: module.InventoryScreen }))
);
const OperationsScreen = React.lazy(() =>
  import('./screens/OperationsScreen').then((module) => ({ default: module.OperationsScreen }))
);
const SalesScreen = React.lazy(() =>
  import('./screens/SalesScreen').then((module) => ({ default: module.SalesScreen }))
);
const SettingsScreen = React.lazy(() =>
  import('./screens/SettingsScreen').then((module) => ({ default: module.SettingsScreen }))
);
const BarcodeScannerModal = React.lazy(() =>
  import('./modals/BarcodeScannerModal').then((module) => ({ default: module.BarcodeScannerModal }))
);

const PosShell: React.FC = () => {
  const { state } = usePos();

  return (
    <div className="h-[100dvh] w-full flex flex-col overflow-hidden bg-[#F4F6F8]">
      <PosTopBar />
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <main className="flex-1 min-w-0 min-h-0 overflow-hidden">
          <React.Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-xs font-semibold text-[#64748B]">
                Loading screen…
              </div>
            }
          >
            {state.activeTab === 'POS' && <PosScreen />}
            {state.activeTab === 'INVENTORY' && <InventoryScreen />}
            {state.activeTab === 'OPERATIONS' && <OperationsScreen />}
            {state.activeTab === 'SALES' && <SalesScreen />}
            {state.activeTab === 'SETTINGS' && <SettingsScreen />}
          </React.Suspense>
        </main>
      </div>
      <PosBottomBar />

      {/* Modals & Overlays */}
      <CheckoutModal />
      <ReceiptModal />
      <AssistantSheet />
      {state.scannerOpen && (
        <React.Suspense fallback={null}>
          <BarcodeScannerModal />
        </React.Suspense>
      )}
      <ProductModal />
      <StockAdjustModal />
      <BatchStockModal />
      <StockLogModal />
      <SmallModalsHost />
      {!DeviceBridge.isAndroidHost() && <PwaUpdatePrompt />}
      <ToastHostOverlay toasts={state.toasts} />
    </div>
  );
};

export const App: React.FC = () => (
  <PosProvider>
    <PosShell />
  </PosProvider>
);

export default App;
