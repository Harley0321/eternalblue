package com.example

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.model.TabName
import com.example.ui.components.PosBottomBar
import com.example.ui.components.PosNavRail
import com.example.ui.components.PosTopBar
import com.example.ui.components.ToastHostOverlay
import com.example.ui.modals.AssistantSheet
import com.example.ui.modals.BarcodeScannerModal
import com.example.ui.modals.BatchStockModal
import com.example.ui.modals.CheckoutModal
import com.example.ui.modals.ProductModal
import com.example.ui.modals.ReceiptModal
import com.example.ui.modals.SmallModalsHost
import com.example.ui.modals.StockAdjustModal
import com.example.ui.modals.StockLogModal
import com.example.ui.screens.InventoryScreen
import com.example.ui.screens.OperationsScreen
import com.example.ui.screens.PosScreen
import com.example.ui.screens.SalesScreen
import com.example.ui.screens.SettingsScreen
import com.example.ui.theme.EternalBlueTheme
import com.example.viewmodel.PosViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            EternalBlueTheme {
                val vm: PosViewModel = viewModel()
                val state by vm.state.collectAsState()

                val pinSensitive = state.terminalLocked || state.pinModalMode != null
                DisposableEffect(pinSensitive) {
                    if (pinSensitive) {
                        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
                    } else {
                        window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                    }
                    onDispose {
                        window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                    }
                }

                val lifecycleOwner = LocalLifecycleOwner.current
                val appContext = LocalContext.current.applicationContext
                DisposableEffect(lifecycleOwner) {
                    val observer = LifecycleEventObserver { _, event ->
                        if (event == Lifecycle.Event.ON_RESUME) {
                            vm.onAppForegrounded(appContext)
                        }
                    }
                    lifecycleOwner.lifecycle.addObserver(observer)
                    onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
                }

                BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
                    val isWide = maxWidth >= 780.dp

                    Scaffold(
                        topBar = {
                            PosTopBar(
                                state = state,
                                onAskAi = { vm.setAssistantOpen(true) },
                                onLockPos = vm::lockTerminalNow,
                                onOpenUpdateSettings = { vm.setActiveTab(TabName.SETTINGS) }
                            )
                        },
                        bottomBar = {
                            if (!isWide) {
                                PosBottomBar(activeTab = state.activeTab, onSelect = vm::setActiveTab)
                            }
                        }
                    ) { innerPadding ->
                        Row(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
                            if (isWide) {
                                PosNavRail(activeTab = state.activeTab, onSelect = vm::setActiveTab)
                            }
                            Box(modifier = Modifier.weight(1f).fillMaxHeight()) {
                                when (state.activeTab) {
                                    TabName.POS -> PosScreen(state = state, vm = vm, isWide = isWide)
                                    TabName.INVENTORY -> InventoryScreen(state = state, vm = vm)
                                    TabName.OPERATIONS -> OperationsScreen(state = state, vm = vm)
                                    TabName.SALES -> SalesScreen(state = state, vm = vm)
                                    TabName.SETTINGS -> SettingsScreen(state = state, vm = vm)
                                }
                            }
                        }
                    }

                    // Modals & Overlays
                    CheckoutModal(state = state, vm = vm)
                    ReceiptModal(state = state, vm = vm)
                    AssistantSheet(state = state, vm = vm)
                    BarcodeScannerModal(
                        open = state.scannerOpen,
                        onDetected = vm::handleBarcodeDetected,
                        onDismiss = vm::closeScanner
                    )
                    ProductModal(state = state, vm = vm)
                    StockAdjustModal(state = state, vm = vm)
                    BatchStockModal(state = state, vm = vm)
                    StockLogModal(state = state, vm = vm)
                    SmallModalsHost(state = state, vm = vm)

                    ToastHostOverlay(
                        toasts = state.toasts,
                        modifier = Modifier.align(Alignment.TopEnd).padding(top = 64.dp)
                    )
                }
            }
        }
    }
}
