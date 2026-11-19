package com.example

import android.os.Bundle
import androidx.activity.compose.BackHandler
import androidx.activity.enableEdgeToEdge
import androidx.activity.compose.setContent
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.windowsizeclass.ExperimentalMaterial3WindowSizeClassApi
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import androidx.compose.material3.windowsizeclass.calculateWindowSizeClass
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.hardware.AndroidDeviceBridge
import com.example.model.ScannerMode
import com.example.model.TabName
import com.example.ui.components.PosBottomBar
import com.example.ui.components.PosNavigationRail
import com.example.ui.components.PosTopBar
import com.example.ui.components.ToastOverlay
import com.example.ui.modals.AssistantSheet
import com.example.ui.modals.BarcodeScannerScreen
import com.example.ui.modals.BatchStockDialog
import com.example.ui.modals.CategorySheetDialog
import com.example.ui.modals.CheckoutDialog
import com.example.ui.modals.ConfirmDialog
import com.example.ui.modals.CsvImportDialog
import com.example.ui.modals.CustomerDisplayScreen
import com.example.ui.modals.HeldOrdersDialog
import com.example.ui.modals.HoldCartDialog
import com.example.ui.modals.PinDialog
import com.example.ui.modals.ProductDialog
import com.example.ui.modals.ReceiptDialog
import com.example.ui.modals.ReorderDialog
import com.example.ui.modals.ScReviewDialog
import com.example.ui.modals.StockAdjustDialog
import com.example.ui.modals.StockLogDialog
import com.example.ui.modals.TerminalLockOverlay
import com.example.ui.modals.VoidSaleDialog
import com.example.ui.modals.WeightDialog
import com.example.ui.screens.InventoryScreen
import com.example.ui.screens.OperationsScreen
import com.example.ui.screens.PosScreen
import com.example.ui.screens.SalesScreen
import com.example.ui.screens.SettingsScreen
import com.example.ui.theme.EternalBluePosTheme
import com.example.ui.theme.PosColors
import com.example.viewmodel.PosViewModel

class MainActivity : FragmentActivity() {
    @OptIn(ExperimentalMaterial3WindowSizeClassApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val widthSizeClass = calculateWindowSizeClass(this).widthSizeClass
            EternalBluePosTheme {
                EternalBluePosApp(widthSizeClass = widthSizeClass)
            }
        }
    }
}

@Composable
private fun EternalBluePosApp(
    widthSizeClass: WindowWidthSizeClass,
    vm: PosViewModel = viewModel()
) {
    val activeTab by vm.activeTab.collectAsStateWithLifecycle()
    val settings by vm.settings.collectAsStateWithLifecycle()
    val activeShift by vm.activeShift.collectAsStateWithLifecycle()
    val lowStockCount by vm.lowStockCount.collectAsStateWithLifecycle()
    val outOfStockCount by vm.outOfStockCount.collectAsStateWithLifecycle()
    val overdueUtangCount by vm.overdueUtangCount.collectAsStateWithLifecycle()
    val toasts by vm.toasts.collectAsStateWithLifecycle()
    val updateState by vm.updateState.collectAsStateWithLifecycle()
    val context = LocalContext.current

    val isWideLayout = widthSizeClass != WindowWidthSizeClass.Compact
    val hasPin = vm.security.pinIsSet(settings)

    // Navigate back to POS from secondary tabs
    BackHandler(enabled = activeTab != TabName.pos) {
        vm.selectTab(TabName.pos)
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Scaffold(
            containerColor = PosColors.Slate100,
            topBar = {
                PosTopBar(
                    storeName = settings.storeName,
                    storeIcon = settings.storeIcon,
                    activeCashierName = activeShift?.cashierName,
                    hasPin = hasPin,
                    isWideLayout = isWideLayout,
                    onOpenAssistant = { vm.openAssistant() },
                    onOpenSettings = { vm.openSettingsTab() },
                    onLockTerminal = { vm.lockTerminal() }
                )
            },
            bottomBar = {
                if (!isWideLayout) {
                    PosBottomBar(
                        activeTab = activeTab,
                        lowStockCount = lowStockCount,
                        outOfStockCount = outOfStockCount,
                        overdueUtangCount = overdueUtangCount,
                        onSelectTab = { vm.selectTab(it) }
                    )
                }
            }
        ) { innerPadding ->
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
            ) {
                if (isWideLayout) {
                    PosNavigationRail(
                        activeTab = activeTab,
                        lowStockCount = lowStockCount,
                        outOfStockCount = outOfStockCount,
                        overdueUtangCount = overdueUtangCount,
                        onQuickScan = {
                            vm.selectTab(TabName.pos)
                            vm.openScanner(ScannerMode.pos, continuous = true)
                        },
                        onSelectTab = { vm.selectTab(it) }
                    )
                }

                Box(modifier = Modifier.weight(1f).fillMaxSize()) {
                    Crossfade(
                        targetState = activeTab,
                        animationSpec = tween(durationMillis = 160),
                        label = "main_tab_crossfade"
                    ) { tab ->
                        when (tab) {
                            TabName.pos -> PosScreen(vm = vm, isWideLayout = isWideLayout)
                            TabName.inventory -> InventoryScreen(vm = vm)
                            TabName.operations -> OperationsScreen(vm = vm)
                            TabName.sales -> SalesScreen(vm = vm)
                            TabName.settings -> SettingsScreen(vm = vm)
                        }
                    }
                }
            }
        }

        // Modals & Overlays
        CheckoutDialog(vm)
        ReceiptDialog(vm)
        CustomerDisplayScreen(vm)
        BarcodeScannerScreen(vm)
        AssistantSheet(vm)
        ProductDialog(vm)
        StockAdjustDialog(vm)
        BatchStockDialog(vm)
        CsvImportDialog(vm)
        StockLogDialog(vm)
        ScReviewDialog(vm)
        ReorderDialog(vm)
        WeightDialog(vm)
        HoldCartDialog(vm)
        HeldOrdersDialog(vm)
        CategorySheetDialog(vm)
        VoidSaleDialog(vm)
        ConfirmDialog(vm)
        PinDialog(vm)
        TerminalLockOverlay(vm)

        val rel = updateState.availableRelease
        if (rel != null && !updateState.bannerDismissed) {
            AlertDialog(
                onDismissRequest = { vm.dismissUpdateBanner() },
                title = { Text("App Update Available") },
                text = {
                    Text("A newer GitHub build (${rel.title}) is ready. Download and tap the APK to update while keeping all your store data.")
                },
                confirmButton = {
                    Button(
                        onClick = {
                            vm.dismissUpdateBanner()
                            AndroidDeviceBridge.openUrl(context, rel.apkDownloadUrl)
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = PosColors.Emerald600),
                        modifier = Modifier.testTag("update_dialog_download_btn")
                    ) {
                        Text("Download APK")
                    }
                },
                dismissButton = {
                    TextButton(
                        onClick = { vm.dismissUpdateBanner() },
                        modifier = Modifier.testTag("update_dialog_later_btn")
                    ) {
                        Text("Later")
                    }
                }
            )
        }

        ToastOverlay(
            toasts = toasts,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .navigationBarsPadding()
                .padding(bottom = if (isWideLayout) 20.dp else 88.dp)
        )
    }
}
