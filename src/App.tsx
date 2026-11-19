import React from 'react';
import { ToastHostOverlay } from './components/CommonGraphics';
import { PosBottomBar, PosNavRail, PosTopBar } from './components/TopBarAndNav';
import { AssistantSheet } from './modals/AssistantSheet';
import { BarcodeScannerModal } from './modals/BarcodeScannerModal';
import { CheckoutModal, ReceiptModal } from './modals/CheckoutAndReceiptModals';
import { BatchStockModal, StockLogModal } from './modals/InventoryBatchModals';
import { ProductModal, StockAdjustModal } from './modals/InventoryProductModals';
import { SmallModalsHost } from './modals/SmallModals';
import { InventoryScreen } from './screens/InventoryScreen';
import { OperationsScreen } from './screens/OperationsScreen';
import { PosScreen } from './screens/PosScreen';
import { SalesScreen } from './screens/SalesScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { PosProvider, usePos } from './state/PosContext';

const PosShell: React.FC = () => {
  const { state } = usePos();

  return (
    <div className="h-[100dvh] w-full flex flex-col overflow-hidden bg-[#F4F6F8]">
      <PosTopBar />
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <PosNavRail />
        <main className="flex-1 min-w-0 min-h-0 overflow-hidden">
          {state.activeTab === 'POS' && <PosScreen />}
          {state.activeTab === 'INVENTORY' && <InventoryScreen />}
          {state.activeTab === 'OPERATIONS' && <OperationsScreen />}
          {state.activeTab === 'SALES' && <SalesScreen />}
          {state.activeTab === 'SETTINGS' && <SettingsScreen />}
        </main>
      </div>
      <PosBottomBar />

      {/* Modals & Overlays */}
      <CheckoutModal />
      <ReceiptModal />
      <AssistantSheet />
      <BarcodeScannerModal />
      <ProductModal />
      <StockAdjustModal />
      <BatchStockModal />
      <StockLogModal />
      <SmallModalsHost />
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
