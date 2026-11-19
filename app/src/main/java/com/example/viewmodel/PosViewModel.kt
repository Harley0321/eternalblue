package com.example.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.BuildConfig
import com.example.data.PosRepository
import com.example.domain.AssistantAction
import com.example.domain.AssistantContext
import com.example.domain.AssistantEngine
import com.example.domain.AssistantLang
import com.example.domain.AssistantReply
import com.example.domain.GitHubUpdateChecker
import com.example.domain.OpsMath
import com.example.domain.PosMath
import com.example.domain.StockAlerts
import com.example.hardware.AndroidDeviceBridge
import com.example.hardware.EscPosPrinter
import com.example.model.ActiveShiftState
import com.example.model.AppUpdateUiState
import com.example.model.BackupPayload
import com.example.model.CartLine
import com.example.model.CartTotals
import com.example.model.CashDrawerEvent
import com.example.model.CashierAccount
import com.example.model.CheckoutLiveDraft
import com.example.model.ConfigSnapshot
import com.example.model.DigitalServiceEntry
import com.example.model.DigitalServiceKind
import com.example.model.DrawerEventType
import com.example.model.EncryptedVaultEnvelope
import com.example.model.HeldOrder
import com.example.model.OperationsSubTab
import com.example.model.PaymentMethod
import com.example.model.PriceType
import com.example.model.Product
import com.example.model.ReadingLine
import com.example.model.ReadingReport
import com.example.model.RepackLogEntry
import com.example.model.RepackRule
import com.example.model.SaleItem
import com.example.model.SaleRecord
import com.example.model.ScannerMode
import com.example.model.SecurityEventType
import com.example.model.SecurityLogEntry
import com.example.model.SecuritySeverity
import com.example.model.StockFilter
import com.example.model.StockLogEntry
import com.example.model.StockSort
import com.example.model.StoreSettings
import com.example.model.SukiCustomer
import com.example.model.TabName
import com.example.model.ToastItem
import com.example.model.ToastType
import com.example.model.UtangTransaction
import com.example.security.SecurityManager
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.Instant

data class ScannerUiState(
    val open: Boolean = false,
    val mode: ScannerMode = ScannerMode.pos,
    val continuous: Boolean = true
)

data class ProductModalUiState(
    val open: Boolean = false,
    val editingProduct: Product? = null,
    val initialBarcode: String = ""
)

data class BatchStockUiState(
    val open: Boolean = false,
    val mode: String = "delta",
    val reason: String = "Restock",
    val prefill: Map<String, Pair<Double, String>> = emptyMap()
)

enum class PinModalMode { setup, unlock, change }

data class PinModalUiState(
    val open: Boolean = false,
    val mode: PinModalMode = PinModalMode.unlock
)

enum class ConfirmActionType { deleteProduct, clearCart, clearSales, replaceRestore, factoryReset }

data class ConfirmUiState(
    val type: ConfirmActionType,
    val title: String,
    val message: String,
    val confirmLabel: String,
    val danger: Boolean = true,
    val requirePin: Boolean = false,
    val productId: String? = null,
    val restorePayload: BackupPayload? = null
)

data class AssistantChatMessage(
    val id: Long,
    val isUser: Boolean,
    val reply: AssistantReply? = null,
    val userText: String? = null
)

class PosViewModel(application: Application) : AndroidViewModel(application) {
    private val appContext = application.applicationContext
    val repo = PosRepository(appContext)
    val security = SecurityManager(appContext)
    private val assistantEngine = AssistantEngine.OfflineAssistant()

    private val _products = MutableStateFlow(repo.loadOrSeedProducts())
    val products: StateFlow<List<Product>> = _products.asStateFlow()

    private val _sales = MutableStateFlow(repo.loadSales())
    val sales: StateFlow<List<SaleRecord>> = _sales.asStateFlow()

    private val _heldOrders = MutableStateFlow(repo.loadHeldOrders())
    val heldOrders: StateFlow<List<HeldOrder>> = _heldOrders.asStateFlow()

    private val _settings = MutableStateFlow(repo.loadSettings())
    val settings: StateFlow<StoreSettings> = _settings.asStateFlow()

    private val _stockLog = MutableStateFlow(repo.loadStockLog())
    val stockLog: StateFlow<List<StockLogEntry>> = _stockLog.asStateFlow()

    private val _configHistory = MutableStateFlow(repo.loadConfigHistory())
    val configHistory: StateFlow<List<ConfigSnapshot>> = _configHistory.asStateFlow()

    private val _securityLog = MutableStateFlow(repo.loadSecurityLog())
    val securityLog: StateFlow<List<SecurityLogEntry>> = _securityLog.asStateFlow()

    private val _customers = MutableStateFlow(repo.loadCustomers())
    val customers: StateFlow<List<SukiCustomer>> = _customers.asStateFlow()

    private val _utangTxs = MutableStateFlow(repo.loadUtangTx())
    val utangTxs: StateFlow<List<UtangTransaction>> = _utangTxs.asStateFlow()

    private val _repackRules = MutableStateFlow(repo.loadRepackRules())
    val repackRules: StateFlow<List<RepackRule>> = _repackRules.asStateFlow()

    private val _repackLogs = MutableStateFlow(repo.loadRepackLogs())
    val repackLogs: StateFlow<List<RepackLogEntry>> = _repackLogs.asStateFlow()

    private val _drawerEvents = MutableStateFlow(repo.loadDrawerEvents())
    val drawerEvents: StateFlow<List<CashDrawerEvent>> = _drawerEvents.asStateFlow()

    private val _serviceEntries = MutableStateFlow(repo.loadServiceLogs())
    val serviceEntries: StateFlow<List<DigitalServiceEntry>> = _serviceEntries.asStateFlow()

    private val _cashiers = MutableStateFlow(repo.loadCashiers())
    val cashiers: StateFlow<List<CashierAccount>> = _cashiers.asStateFlow()

    private val _activeShift = MutableStateFlow(repo.loadActiveShift())
    val activeShift: StateFlow<ActiveShiftState?> = _activeShift.asStateFlow()

    // UI State
    private val _activeTab = MutableStateFlow(TabName.pos)
    val activeTab: StateFlow<TabName> = _activeTab.asStateFlow()

    private val _opsSubTab = MutableStateFlow(OperationsSubTab.utang)
    val opsSubTab: StateFlow<OperationsSubTab> = _opsSubTab.asStateFlow()

    private val _cart = MutableStateFlow<List<CartLine>>(emptyList())
    val cart: StateFlow<List<CartLine>> = _cart.asStateFlow()

    private val _priceMode = MutableStateFlow(PriceType.retail)
    val priceMode: StateFlow<PriceType> = _priceMode.asStateFlow()

    private val _isSeniorPwd = MutableStateFlow(false)
    val isSeniorPwd: StateFlow<Boolean> = _isSeniorPwd.asStateFlow()

    private val _posCategory = MutableStateFlow("All")
    val posCategory: StateFlow<String> = _posCategory.asStateFlow()

    private val _posSearch = MutableStateFlow("")
    val posSearch: StateFlow<String> = _posSearch.asStateFlow()

    private val _invCategory = MutableStateFlow("All")
    val invCategory: StateFlow<String> = _invCategory.asStateFlow()

    private val _invStockFilter = MutableStateFlow(StockFilter.ALL)
    val invStockFilter: StateFlow<StockFilter> = _invStockFilter.asStateFlow()

    private val _invSort = MutableStateFlow(StockSort.DEFAULT)
    val invSort: StateFlow<StockSort> = _invSort.asStateFlow()

    private val _invSearch = MutableStateFlow("")
    val invSearch: StateFlow<String> = _invSearch.asStateFlow()

    // Security Unlock State
    private val _settingsUnlocked = MutableStateFlow(false)
    val settingsUnlocked: StateFlow<Boolean> = _settingsUnlocked.asStateFlow()

    private val _terminalLocked = MutableStateFlow(false)
    val terminalLocked: StateFlow<Boolean> = _terminalLocked.asStateFlow()

    // Modals & Overlays
    private val _mobileCartOpen = MutableStateFlow(false)
    val mobileCartOpen: StateFlow<Boolean> = _mobileCartOpen.asStateFlow()

    private val _checkoutOpen = MutableStateFlow(false)
    val checkoutOpen: StateFlow<Boolean> = _checkoutOpen.asStateFlow()

    private val _flipCustomerDisplay = MutableStateFlow(false)
    val flipCustomerDisplay: StateFlow<Boolean> = _flipCustomerDisplay.asStateFlow()

    private val _checkoutLiveDraft = MutableStateFlow<CheckoutLiveDraft?>(null)
    val checkoutLiveDraft: StateFlow<CheckoutLiveDraft?> = _checkoutLiveDraft.asStateFlow()

    private val _lastCompletedDisplaySale = MutableStateFlow<SaleRecord?>(null)
    val lastCompletedDisplaySale: StateFlow<SaleRecord?> = _lastCompletedDisplaySale.asStateFlow()

    private val _receiptSale = MutableStateFlow<SaleRecord?>(null)
    val receiptSale: StateFlow<SaleRecord?> = _receiptSale.asStateFlow()

    private val _receiptReading = MutableStateFlow<ReadingReport?>(null)
    val receiptReading: StateFlow<ReadingReport?> = _receiptReading.asStateFlow()

    private val _scannerState = MutableStateFlow(ScannerUiState())
    val scannerState: StateFlow<ScannerUiState> = _scannerState.asStateFlow()

    private val _categorySheetOpen = MutableStateFlow(false)
    val categorySheetOpen: StateFlow<Boolean> = _categorySheetOpen.asStateFlow()

    private val _holdModalOpen = MutableStateFlow(false)
    val holdModalOpen: StateFlow<Boolean> = _holdModalOpen.asStateFlow()

    private val _heldModalOpen = MutableStateFlow(false)
    val heldModalOpen: StateFlow<Boolean> = _heldModalOpen.asStateFlow()

    private val _weightProduct = MutableStateFlow<Product?>(null)
    val weightProduct: StateFlow<Product?> = _weightProduct.asStateFlow()

    private val _productModal = MutableStateFlow(ProductModalUiState())
    val productModal: StateFlow<ProductModalUiState> = _productModal.asStateFlow()

    private val _stockAdjustProduct = MutableStateFlow<Product?>(null)
    val stockAdjustProduct: StateFlow<Product?> = _stockAdjustProduct.asStateFlow()

    private val _batchStockState = MutableStateFlow(BatchStockUiState())
    val batchStockState: StateFlow<BatchStockUiState> = _batchStockState.asStateFlow()

    private val _csvImportOpen = MutableStateFlow(false)
    val csvImportOpen: StateFlow<Boolean> = _csvImportOpen.asStateFlow()

    private val _stockLogOpen = MutableStateFlow(false)
    val stockLogOpen: StateFlow<Boolean> = _stockLogOpen.asStateFlow()

    private val _scReviewOpen = MutableStateFlow(false)
    val scReviewOpen: StateFlow<Boolean> = _scReviewOpen.asStateFlow()

    private val _reorderOpen = MutableStateFlow(false)
    val reorderOpen: StateFlow<Boolean> = _reorderOpen.asStateFlow()

    private val _voidTargetSale = MutableStateFlow<SaleRecord?>(null)
    val voidTargetSale: StateFlow<SaleRecord?> = _voidTargetSale.asStateFlow()

    private val _pinModal = MutableStateFlow(PinModalUiState())
    val pinModal: StateFlow<PinModalUiState> = _pinModal.asStateFlow()

    private val _confirmState = MutableStateFlow<ConfirmUiState?>(null)
    val confirmState: StateFlow<ConfirmUiState?> = _confirmState.asStateFlow()

    private val _assistantOpen = MutableStateFlow(false)
    val assistantOpen: StateFlow<Boolean> = _assistantOpen.asStateFlow()

    private val _assistantMessages = MutableStateFlow<List<AssistantChatMessage>>(
        listOf(AssistantChatMessage(1L, isUser = false, reply = assistantEngine.reset(AssistantLang.en)))
    )
    val assistantMessages: StateFlow<List<AssistantChatMessage>> = _assistantMessages.asStateFlow()

    private val _toasts = MutableStateFlow<List<ToastItem>>(emptyList())
    val toasts: StateFlow<List<ToastItem>> = _toasts.asStateFlow()

    private val _salesCashDrawerSignal = MutableStateFlow(0)
    val salesCashDrawerSignal: StateFlow<Int> = _salesCashDrawerSignal.asStateFlow()

    private val _btPrinterConnected = MutableStateFlow(EscPosPrinter.getSession().connected)
    val btPrinterConnected: StateFlow<Boolean> = _btPrinterConnected.asStateFlow()

    private val _btPrinterName = MutableStateFlow(EscPosPrinter.getSession().deviceName)
    val btPrinterName: StateFlow<String> = _btPrinterName.asStateFlow()

    private var lastUpdateCheckMs: Long = 0L
    private var dismissedRemoteVersionCode: Int = 0

    private val _updateState = MutableStateFlow(
        AppUpdateUiState(
            currentVersionName = BuildConfig.VERSION_NAME,
            currentVersionCode = BuildConfig.VERSION_CODE,
            effectiveRepo = resolveEffectiveGithubRepo(_settings.value),
            hasGithubToken = AndroidDeviceBridge.getSavedGithubToken(appContext).isNotEmpty()
        )
    )
    val updateState: StateFlow<AppUpdateUiState> = _updateState.asStateFlow()

    // Derived StateFlows
    val productMap: StateFlow<Map<String, Product>> = _products
        .map { PosMath.buildProductMap(it) }
        .stateIn(viewModelScope, SharingStarted.Eagerly, PosMath.buildProductMap(_products.value))

    val barcodeIndex: StateFlow<Map<String, Product>> = _products
        .map { PosMath.buildBarcodeIndex(it) }
        .stateIn(viewModelScope, SharingStarted.Eagerly, PosMath.buildBarcodeIndex(_products.value))

    val cartTotals: StateFlow<CartTotals> = combine(_cart, productMap, _isSeniorPwd, _settings) { c, pm, sc, s ->
        PosMath.computeCartTotals(c, pm, sc, s)
    }.stateIn(
        viewModelScope,
        SharingStarted.Eagerly,
        PosMath.computeCartTotals(emptyList(), productMap.value, false, _settings.value)
    )

    val lowStockCount: StateFlow<Int> = combine(_products, _settings) { prods, s ->
        StockAlerts.computeLowStockAlerts(prods, StockAlerts.normalizeThreshold(s.lowStockThreshold)).totalAlertCount
    }.stateIn(viewModelScope, SharingStarted.Eagerly, 0)

    val outOfStockCount: StateFlow<Int> = _products.map { list -> list.count { it.stock <= 0.0 } }
        .stateIn(viewModelScope, SharingStarted.Eagerly, 0)

    val overdueUtangCount: StateFlow<Int> = _customers.map { list -> list.count { OpsMath.isCustomerOverdue(it) } }
        .stateIn(viewModelScope, SharingStarted.Eagerly, 0)

    val fastMoverIds: StateFlow<Set<String>> = combine(_products, _sales) { prods, s ->
        PosMath.getTopFastMoverIds(prods, s, 12)
    }.stateIn(viewModelScope, SharingStarted.Eagerly, emptySet())

    val lastVoidableSale: StateFlow<SaleRecord?> = _sales.map { PosMath.getLastVoidableSale(it) }
        .stateIn(viewModelScope, SharingStarted.Eagerly, PosMath.getLastVoidableSale(_sales.value))

    init {
        if (security.pinIsSet(_settings.value) && _settings.value.lockWholePos) {
            _terminalLocked.value = true
        }
        if (_configHistory.value.isEmpty()) {
            val baseline = ConfigSnapshot(
                id = "CFG-${System.currentTimeMillis().toString(36)}",
                version = PosMath.APP_VERSION,
                createdAt = Instant.now().toString(),
                label = "Initial store configuration baseline",
                source = "baseline",
                changedFields = emptyList(),
                config = PosMath.sanitizeConfigForSnapshot(_settings.value)
            )
            _configHistory.value = listOf(baseline)
            repo.saveConfigHistory(_configHistory.value)
        }
        val repoSlug = resolveEffectiveGithubRepo(_settings.value)
        if (_settings.value.autoCheckUpdates && repoSlug.isNotEmpty()) {
            checkForAppUpdate(silent = true)
        }
    }

    private fun resolveEffectiveGithubRepo(s: StoreSettings): String {
        val custom = GitHubUpdateChecker.normalizeRepo(s.githubRepo)
        if (custom.isNotEmpty()) return custom
        return GitHubUpdateChecker.normalizeRepo(BuildConfig.GITHUB_REPO)
    }

    fun saveGithubRepo(raw: String) {
        val norm = GitHubUpdateChecker.normalizeRepo(raw)
        if (raw.isNotBlank() && norm.isEmpty()) {
            toast("Enter repo as username/repository", ToastType.WARNING)
            return
        }
        val next = _settings.value.copy(githubRepo = norm.ifEmpty { null })
        updateSettings(next, "Updated GitHub update source")
        _updateState.value = _updateState.value.copy(
            effectiveRepo = resolveEffectiveGithubRepo(next),
            errorMessage = null,
            upToDateMessage = null
        )
        toast(if (norm.isNotEmpty()) "Saved GitHub repo: $norm" else "Cleared custom GitHub repo")
    }

    fun saveGithubToken(rawToken: String) {
        val cleaned = rawToken.trim()
        AndroidDeviceBridge.saveGithubToken(appContext, cleaned)
        _updateState.value = _updateState.value.copy(
            hasGithubToken = cleaned.isNotEmpty(),
            errorMessage = null
        )
        toast(if (cleaned.isNotEmpty()) "GitHub read token saved on device" else "GitHub token cleared")
    }

    fun toggleAutoCheckUpdates(enabled: Boolean) {
        val next = _settings.value.copy(autoCheckUpdates = enabled)
        updateSettings(next)
    }

    fun dismissUpdateBanner() {
        val ver = _updateState.value.availableRelease?.remoteVersionCode ?: 0
        if (ver > dismissedRemoteVersionCode) dismissedRemoteVersionCode = ver
        _updateState.value = _updateState.value.copy(bannerDismissed = true)
    }

    fun onAppResumedCheckUpdates() {
        val s = _settings.value
        if (!s.autoCheckUpdates) return
        val repoSlug = resolveEffectiveGithubRepo(s)
        if (repoSlug.isEmpty()) return
        checkForAppUpdate(silent = true, respectCooldown = true)
    }

    fun checkForAppUpdate(
        silent: Boolean = false,
        overrideRepoInput: String? = null,
        respectCooldown: Boolean = false
    ) {
        if (respectCooldown && System.currentTimeMillis() - lastUpdateCheckMs < 180_000L) {
            return
        }
        if (overrideRepoInput != null && overrideRepoInput.isNotBlank()) {
            val typedNorm = GitHubUpdateChecker.normalizeRepo(overrideRepoInput)
            if (typedNorm.isEmpty()) {
                if (!silent) toast("Enter repo as username/repository", ToastType.WARNING)
                _updateState.value = _updateState.value.copy(
                    checking = false,
                    errorMessage = if (silent) null else "Invalid GitHub repository format. Use owner/repo."
                )
                return
            }
            if (typedNorm != resolveEffectiveGithubRepo(_settings.value)) {
                val next = _settings.value.copy(githubRepo = typedNorm)
                updateSettings(next, "Updated GitHub update source")
            }
        }

        val repoSlug = resolveEffectiveGithubRepo(_settings.value)
        if (repoSlug.isEmpty()) {
            if (!silent) toast("Set your GitHub owner/repo in App Updates first", ToastType.WARNING)
            _updateState.value = _updateState.value.copy(
                effectiveRepo = "",
                checking = false,
                errorMessage = if (silent) null else "Enter your GitHub repo (owner/repo) to check for updates."
            )
            return
        }
        if (_updateState.value.checking) return
        lastUpdateCheckMs = System.currentTimeMillis()
        val token = AndroidDeviceBridge.getSavedGithubToken(appContext)
        _updateState.value = _updateState.value.copy(
            effectiveRepo = repoSlug,
            hasGithubToken = token.isNotEmpty(),
            checking = true,
            errorMessage = null,
            upToDateMessage = null
        )
        viewModelScope.launch {
            val checkedAt = PosMath.formatTimeOnly()
            when (val res = GitHubUpdateChecker.checkLatestRelease(repoSlug, BuildConfig.VERSION_CODE, token)) {
                is GitHubUpdateChecker.Outcome.UpdateAvailable -> {
                    val isAlreadyDismissed = res.release.remoteVersionCode <= dismissedRemoteVersionCode
                    _updateState.value = _updateState.value.copy(
                        checking = false,
                        availableRelease = res.release,
                        upToDateMessage = null,
                        errorMessage = null,
                        lastCheckedLabel = checkedAt,
                        bannerDismissed = if (silent) isAlreadyDismissed else false
                    )
                    if (!silent) toast("Update available: ${res.release.title}")
                }
                is GitHubUpdateChecker.Outcome.UpToDate -> {
                    _updateState.value = _updateState.value.copy(
                        checking = false,
                        availableRelease = null,
                        upToDateMessage = "Up to date (${res.title})",
                        errorMessage = null,
                        lastCheckedLabel = checkedAt
                    )
                    if (!silent) toast("You're on the latest build (${BuildConfig.VERSION_NAME})")
                }
                is GitHubUpdateChecker.Outcome.Error -> {
                    _updateState.value = _updateState.value.copy(
                        checking = false,
                        lastCheckedLabel = checkedAt,
                        errorMessage = if (silent) null else res.message
                    )
                    if (!silent) toast(res.message, ToastType.WARNING)
                }
            }
        }
    }

    fun toast(message: String, type: ToastType = ToastType.SUCCESS) {
        val id = System.nanoTime()
        _toasts.value = (_toasts.value + ToastItem(id, message, type)).takeLast(3)
        viewModelScope.launch {
            delay(2800L)
            _toasts.value = _toasts.value.filterNot { it.id == id }
        }
    }

    fun refreshBluetoothPrinterStatus() {
        val s = EscPosPrinter.getSession()
        _btPrinterConnected.value = s.connected
        _btPrinterName.value = s.deviceName
    }

    fun logSecurityEvent(
        event: SecurityEventType,
        summary: String,
        severity: SecuritySeverity = SecuritySeverity.info
    ) {
        val entry = security.createSecurityLogEntry(_securityLog.value, event, severity, summary)
        val next = (listOf(entry) + _securityLog.value).take(250)
        _securityLog.value = next
        repo.saveSecurityLog(next)
    }

    private fun updateProducts(updater: (List<Product>) -> List<Product>) {
        val prev = _products.value
        val next = updater(prev)
        _products.value = next
        repo.saveProducts(next)

        if (_settings.value.stockAlertNotifications) {
            val th = StockAlerts.normalizeThreshold(_settings.value.lowStockThreshold)
            val newlyLow = StockAlerts.detectNewlyLowStockProducts(prev, next, th, th)
            if (newlyLow.isNotEmpty()) {
                val payload = StockAlerts.buildStockAlertNotificationPayload(newlyLow, th, _settings.value.storeName)
                AndroidDeviceBridge.showStockAlertNotification(appContext, payload)
            }
        }
    }

    private fun appendStockLog(entry: StockLogEntry) {
        val next = (listOf(entry) + _stockLog.value).take(500)
        _stockLog.value = next
        repo.saveStockLog(next)
    }

    fun updateSettings(next: StoreSettings, snapshotLabel: String? = null, source: String = "auto") {
        val prev = _settings.value
        val prevCfg = PosMath.sanitizeConfigForSnapshot(prev)
        val nextCfg = PosMath.sanitizeConfigForSnapshot(next)
        val changed = PosMath.diffConfigFields(prevCfg, nextCfg)
        if (changed.isNotEmpty() || snapshotLabel != null) {
            val entry = ConfigSnapshot(
                id = "CFG-${System.currentTimeMillis().toString(36)}",
                version = PosMath.APP_VERSION,
                createdAt = Instant.now().toString(),
                label = snapshotLabel ?: if (changed.isNotEmpty()) "Updated ${changed.joinToString(", ")}" else "Configuration snapshot",
                source = source,
                changedFields = changed,
                config = nextCfg
            )
            val updatedHist = (listOf(entry) + _configHistory.value).take(30)
            _configHistory.value = updatedHist
            repo.saveConfigHistory(updatedHist)
        }
        _settings.value = next
        repo.saveSettings(next)
    }

    fun createConfigCheckpoint(label: String) {
        val cfg = PosMath.sanitizeConfigForSnapshot(_settings.value)
        val entry = ConfigSnapshot(
            id = "CFG-${System.currentTimeMillis().toString(36)}",
            version = PosMath.APP_VERSION,
            createdAt = Instant.now().toString(),
            label = label.trim().ifEmpty { "Manual checkpoint" },
            source = "manual",
            changedFields = emptyList(),
            config = cfg
        )
        val next = (listOf(entry) + _configHistory.value).take(30)
        _configHistory.value = next
        repo.saveConfigHistory(next)
        toast("Configuration checkpoint saved")
    }

    fun rollbackConfig(snapshotId: String) {
        val snap = _configHistory.value.find { it.id == snapshotId } ?: return
        val c = snap.config
        val merged = _settings.value.copy(
            storeName = c.storeName,
            storeAddress = c.storeAddress,
            storeTin = c.storeTin,
            storePhone = c.storePhone,
            receiptFooter = c.receiptFooter,
            storeIcon = c.storeIcon,
            storeTagline = c.storeTagline,
            lowStockThreshold = c.lowStockThreshold,
            expiryWarnDays = c.expiryWarnDays,
            reorderLeadDays = c.reorderLeadDays,
            reorderSafetyDays = c.reorderSafetyDays,
            beep = c.beep,
            vibrate = c.vibrate,
            stockAlertNotifications = c.stockAlertNotifications,
            scDiscountCap = c.scDiscountCap,
            receiptWidth = c.receiptWidth,
            qrPayLabel = c.qrPayLabel,
            qrMerchantName = c.qrMerchantName,
            qrAccountNumber = c.qrAccountNumber,
            qrEmvPayload = c.qrEmvPayload,
            customerDisplayGreeting = c.customerDisplayGreeting
        )
        updateSettings(merged, "Rolled back to \"${snap.label}\"", "rollback")
        toast("Configuration rolled back to \"${snap.label}\"")
    }

    // Navigation & Locks
    fun selectTab(tab: TabName) {
        if (tab == TabName.settings) {
            openSettingsTab()
        } else {
            _activeTab.value = tab
        }
    }

    fun openSettingsTab() {
        if (!security.pinIsSet(_settings.value)) {
            _pinModal.value = PinModalUiState(open = true, mode = PinModalMode.setup)
            return
        }
        if (_settingsUnlocked.value) {
            _activeTab.value = TabName.settings
            return
        }
        _pinModal.value = PinModalUiState(open = true, mode = PinModalMode.unlock)
    }

    fun closePinModal() {
        _pinModal.value = _pinModal.value.copy(open = false)
    }

    fun openChangePinModal() {
        _pinModal.value = PinModalUiState(open = true, mode = PinModalMode.change)
    }

    fun onPinVerifiedForSettings(upgradedSettings: StoreSettings?, viaBiometric: Boolean = false) {
        if (upgradedSettings != null) updateSettings(upgradedSettings)
        val mode = _pinModal.value.mode
        if (mode == PinModalMode.setup || mode == PinModalMode.change) {
            logSecurityEvent(SecurityEventType.PIN_SET, "Configured PBKDF2-SHA512 Manager PIN")
        } else {
            logSecurityEvent(
                if (viaBiometric) SecurityEventType.PASSKEY_UNLOCK else SecurityEventType.SETTINGS_UNLOCK,
                if (viaBiometric) "Settings unlocked via Biometric" else "Settings unlocked via Manager PIN"
            )
        }
        _pinModal.value = _pinModal.value.copy(open = false)
        _settingsUnlocked.value = true
        _activeTab.value = TabName.settings
    }

    fun lockSettings() {
        _settingsUnlocked.value = false
        _activeTab.value = TabName.pos
        logSecurityEvent(SecurityEventType.SETTINGS_LOCK, "Manager locked Store Settings")
        toast("Settings locked")
    }

    fun lockTerminal() {
        if (!security.pinIsSet(_settings.value)) {
            toast("Set a Manager PIN in Settings first", ToastType.WARNING)
            return
        }
        _settingsUnlocked.value = false
        if (_activeTab.value == TabName.settings) _activeTab.value = TabName.pos
        closeAllTransientModals()
        _terminalLocked.value = true
        logSecurityEvent(SecurityEventType.POS_LOCK, "Terminal locked manually")
        toast("Terminal locked")
    }

    fun unlockTerminal(upgradedSettings: StoreSettings?, viaBiometric: Boolean = false) {
        if (upgradedSettings != null) updateSettings(upgradedSettings)
        logSecurityEvent(
            if (viaBiometric) SecurityEventType.PASSKEY_UNLOCK else SecurityEventType.POS_UNLOCK,
            if (viaBiometric) "Terminal unlocked via Biometric" else "Terminal unlocked via Manager PIN"
        )
        _terminalLocked.value = false
    }

    private fun closeAllTransientModals() {
        _pinModal.value = _pinModal.value.copy(open = false)
        _checkoutOpen.value = false
        _receiptSale.value = null
        _receiptReading.value = null
        _scannerState.value = _scannerState.value.copy(open = false)
        _categorySheetOpen.value = false
        _holdModalOpen.value = false
        _heldModalOpen.value = false
        _weightProduct.value = null
        _productModal.value = ProductModalUiState()
        _stockAdjustProduct.value = null
        _batchStockState.value = BatchStockUiState()
        _csvImportOpen.value = false
        _stockLogOpen.value = false
        _scReviewOpen.value = false
        _reorderOpen.value = false
        _voidTargetSale.value = null
        _confirmState.value = null
        _assistantOpen.value = false
        _flipCustomerDisplay.value = false
    }

    // POS Search & Cart
    fun setPosCategory(c: String) { _posCategory.value = c }
    fun setPosSearch(q: String) { _posSearch.value = q }
    fun setInvCategory(c: String) { _invCategory.value = c }
    fun setInvStockFilter(f: StockFilter) { _invStockFilter.value = f }
    fun setInvSort(s: StockSort) { _invSort.value = s }
    fun setInvSearch(q: String) { _invSearch.value = q }
    fun setOpsSubTab(t: OperationsSubTab) { _opsSubTab.value = t }

    fun setPriceMode(mode: PriceType) {
        _priceMode.value = mode
        val pm = productMap.value
        _cart.value = _cart.value.map { line ->
            if (mode == PriceType.retail) line.copy(priceType = PriceType.retail)
            else if (PosMath.wholesaleBlock(line, pm) == null) line.copy(priceType = PriceType.wholesale)
            else line
        }
    }

    fun toggleSeniorPwd(enabled: Boolean) { _isSeniorPwd.value = enabled }

    fun addQtyToCart(product: Product, addQty: Double) {
        if (!addQty.isFinite() || addQty <= 0.0) return
        val exp = PosMath.expiryInfo(product, _settings.value.expiryWarnDays)
        if (exp.status == PosMath.ExpiryState.EXPIRED) {
            toast("${product.name} is expired and cannot be sold", ToastType.ERROR)
            return
        }
        if (product.stock <= 0.0) {
            toast("${product.name} is out of stock", ToastType.ERROR)
            return
        }
        val cleanAdd = if (product.unit == "kg") PosMath.round3(addQty) else addQty.toInt().coerceAtLeast(1).toDouble()
        val cur = _cart.value.toMutableList()
        val idx = cur.indexOfFirst { it.productId == product.id }
        val existingQty = if (idx >= 0) cur[idx].qty else 0.0
        val targetQty = PosMath.round3(existingQty + cleanAdd)
        if (targetQty > product.stock + 1e-6) {
            toast("Only ${PosMath.formatQty(product.stock, product.unit)} available in stock", ToastType.WARNING)
            return
        }
        val probe = CartLine(product.id, product.name, product.unit, product.retailPrice, product.wholesalePrice, product.wholesaleMinQty, PriceType.wholesale, targetQty)
        val pm = productMap.value
        val prefType = if (_priceMode.value == PriceType.wholesale && PosMath.wholesaleBlock(probe, pm) == null) {
            PriceType.wholesale
        } else if (idx >= 0) {
            cur[idx].priceType
        } else {
            PriceType.retail
        }

        if (idx >= 0) {
            cur[idx] = cur[idx].copy(qty = targetQty, priceType = prefType)
        } else {
            cur.add(CartLine(product.id, product.name, product.unit, product.retailPrice, product.wholesalePrice, product.wholesaleMinQty, prefType, targetQty))
        }
        _cart.value = cur
        if (_settings.value.beep) AndroidDeviceBridge.playBeep()
        if (_settings.value.vibrate) AndroidDeviceBridge.vibrateShort(appContext)
    }

    fun onProductClick(product: Product) {
        if (PosMath.expiryInfo(product, _settings.value.expiryWarnDays).status == PosMath.ExpiryState.EXPIRED) {
            toast("${product.name} is expired and cannot be sold", ToastType.ERROR)
            return
        }
        if (product.stock <= 0.0) {
            toast("${product.name} is out of stock", ToastType.ERROR)
            return
        }
        if (product.unit == "kg") _weightProduct.value = product else addQtyToCart(product, 1.0)
    }

    fun changeCartQty(productId: String, delta: Double) {
        val prod = productMap.value[productId]
        val cur = _cart.value.toMutableList()
        val idx = cur.indexOfFirst { it.productId == productId }
        if (idx < 0) return
        val line = cur[idx]
        val step = if (line.unit == "kg") delta * 0.25 else delta
        val nextQty = PosMath.round3(line.qty + step)
        if (nextQty <= 0.0) {
            cur.removeAt(idx)
            _cart.value = cur
            return
        }
        if (prod != null && nextQty > prod.stock + 1e-6) {
            toast("Only ${PosMath.formatQty(prod.stock, prod.unit)} available in stock", ToastType.WARNING)
            return
        }
        cur[idx] = line.copy(qty = nextQty)
        _cart.value = cur
    }

    fun setCartQty(productId: String, rawValue: String) {
        val parsed = rawValue.toDoubleOrNull()
        if (parsed == null || parsed <= 0.0) {
            removeCartLine(productId)
            return
        }
        val prod = productMap.value[productId]
        val nextQty = if (prod?.unit == "kg") PosMath.round3(parsed) else parsed.toInt().toDouble()
        if (nextQty <= 0.0) {
            removeCartLine(productId)
            return
        }
        if (prod != null && nextQty > prod.stock + 1e-6) {
            toast("Only ${PosMath.formatQty(prod.stock, prod.unit)} available in stock", ToastType.WARNING)
            _cart.value = _cart.value.map { if (it.productId == productId) it.copy(qty = prod.stock) else it }
            return
        }
        _cart.value = _cart.value.map { if (it.productId == productId) it.copy(qty = nextQty) else it }
    }

    fun removeCartLine(productId: String) {
        _cart.value = _cart.value.filterNot { it.productId == productId }
    }

    fun setLinePriceType(productId: String, type: PriceType) {
        val line = _cart.value.find { it.productId == productId } ?: return
        val pm = productMap.value
        if (type == PriceType.wholesale) {
            when (PosMath.wholesaleBlock(line, pm)) {
                PosMath.WholesaleBlockReason.NONE -> { toast("No wholesale discount configured", ToastType.WARNING); return }
                PosMath.WholesaleBlockReason.COST -> { toast("Wholesale price is below capital cost", ToastType.WARNING); return }
                PosMath.WholesaleBlockReason.QTY -> { toast("Need at least ${PosMath.linePricing(line, pm).minQty} ${line.unit}", ToastType.WARNING); return }
                null -> {}
            }
        }
        _cart.value = _cart.value.map { if (it.productId == productId) it.copy(priceType = type) else it }
    }

    fun unlockWholesaleLine(productId: String, minQty: Int) {
        val prod = productMap.value[productId] ?: return
        if (prod.stock + 1e-6 < minQty) {
            toast("Only ${PosMath.formatQty(prod.stock, prod.unit)} available (need $minQty)", ToastType.WARNING)
            return
        }
        _cart.value = _cart.value.map { if (it.productId == productId) it.copy(qty = minQty.toDouble(), priceType = PriceType.wholesale) else it }
        toast("Wholesale applied for ${prod.name}")
    }

    fun onPosSearchSubmit(raw: String) {
        val payload = PosMath.extractScanPayload(raw)
        if (payload.rawQuery.isEmpty()) return
        val byBc = PosMath.findProductByBarcodeIndexed(payload.code, barcodeIndex.value)
        if (byBc != null) {
            if (payload.qty != 1.0 || byBc.unit != "kg") addQtyToCart(byBc, payload.qty) else onProductClick(byBc)
            _posSearch.value = ""
            return
        }
        val lower = payload.rawQuery.lowercase()
        val matches = _products.value.filter {
            it.name.lowercase().contains(lower) || PosMath.normBarcode(it.barcode) == PosMath.normBarcode(payload.rawQuery)
        }
        if (matches.size == 1) {
            if (payload.qty != 1.0 || matches.first().unit != "kg") addQtyToCart(matches.first(), payload.qty) else onProductClick(matches.first())
            _posSearch.value = ""
        }
    }

    // Modals Controls
    fun openMobileCart() { _mobileCartOpen.value = true }
    fun closeMobileCart() { _mobileCartOpen.value = false }
    fun openCheckout() { if (_cart.value.isNotEmpty()) _checkoutOpen.value = true }
    fun closeCheckout() { _checkoutOpen.value = false; _checkoutLiveDraft.value = null }
    fun openFlipCustomerDisplay() { _flipCustomerDisplay.value = true }
    fun closeFlipCustomerDisplay() { _flipCustomerDisplay.value = false }
    fun updateCheckoutDraft(draft: CheckoutLiveDraft?) { _checkoutLiveDraft.value = draft }
    fun dismissReceipt() { _receiptSale.value = null; _receiptReading.value = null }
    fun openReceipt(sale: SaleRecord) { _receiptReading.value = null; _receiptSale.value = sale }
    fun openScanner(mode: ScannerMode, continuous: Boolean = true) { _scannerState.value = ScannerUiState(true, mode, continuous) }
    fun closeScanner() { _scannerState.value = _scannerState.value.copy(open = false) }
    fun openCategorySheet() { _categorySheetOpen.value = true }
    fun closeCategorySheet() { _categorySheetOpen.value = false }
    fun openHoldModal() { _holdModalOpen.value = true }
    fun closeHoldModal() { _holdModalOpen.value = false }
    fun openHeldModal() { _heldModalOpen.value = true }
    fun closeHeldModal() { _heldModalOpen.value = false }
    fun closeWeightModal() { _weightProduct.value = null }
    fun openProductModal(editingId: String? = null, initialBarcode: String = "") {
        _productModal.value = ProductModalUiState(true, editingId?.let { productMap.value[it] }, initialBarcode)
    }
    fun closeProductModal() { _productModal.value = ProductModalUiState() }
    fun openStockAdjust(productId: String) { _stockAdjustProduct.value = productMap.value[productId] }
    fun closeStockAdjust() { _stockAdjustProduct.value = null }
    fun openBatchStock(mode: String = "delta", reason: String = "Restock", prefill: Map<String, Pair<Double, String>> = emptyMap()) {
        _batchStockState.value = BatchStockUiState(true, mode, reason, prefill)
    }
    fun closeBatchStock() { _batchStockState.value = BatchStockUiState() }
    fun openCsvImport() { _csvImportOpen.value = true }
    fun closeCsvImport() { _csvImportOpen.value = false }
    fun openStockLog() { _stockLogOpen.value = true }
    fun closeStockLog() { _stockLogOpen.value = false }
    fun openScReview() { _scReviewOpen.value = true }
    fun closeScReview() { _scReviewOpen.value = false }
    fun openReorder() { _reorderOpen.value = true }
    fun closeReorder() { _reorderOpen.value = false }
    fun openVoidSale(sale: SaleRecord) { _voidTargetSale.value = sale }
    fun closeVoidSale() { _voidTargetSale.value = null }
    fun openAssistant() { _assistantOpen.value = true }
    fun closeAssistant() { _assistantOpen.value = false }
    fun closeConfirm() { _confirmState.value = null }

    fun askClearCart() {
        if (_cart.value.isEmpty()) return
        _confirmState.value = ConfirmUiState(
            type = ConfirmActionType.clearCart,
            title = "Clear Basket?",
            message = "Remove all ${_cart.value.size} item(s) from the current order?",
            confirmLabel = "Clear Basket"
        )
    }

    fun askDeleteProduct(productId: String) {
        val p = productMap.value[productId] ?: return
        _confirmState.value = ConfirmUiState(
            type = ConfirmActionType.deleteProduct,
            title = "Delete Product?",
            message = "Remove \"${p.name}\" from inventory? Past sales receipts remain intact.",
            confirmLabel = "Delete Product",
            productId = productId
        )
    }

    fun askClearSales() {
        _confirmState.value = ConfirmUiState(
            type = ConfirmActionType.clearSales,
            title = "Clear All Sales History?",
            message = "This will permanently delete ${_sales.value.size} receipt(s) from this device.",
            confirmLabel = "Clear Sales History",
            requirePin = true
        )
    }

    fun askFactoryReset() {
        _confirmState.value = ConfirmUiState(
            type = ConfirmActionType.factoryReset,
            title = "Factory Reset EternalBlue POS?",
            message = "This erases all custom products, sales, held orders, and settings, restoring the default starter catalog.",
            confirmLabel = "Reset Everything",
            requirePin = true
        )
    }

    // Complete Checkout
    fun completeSale(
        paymentMethod: PaymentMethod,
        tendered: Double,
        refNo: String?,
        seniorId: String?,
        customerId: String?,
        pointsRedeemedRequested: Int,
        utangDueDate: String?,
        allowOverLimit: Boolean,
        splitCash: Double,
        splitDigitalMethod: String
    ): Boolean {
        val cartList = _cart.value
        if (cartList.isEmpty()) {
            toast("Basket is empty", ToastType.WARNING)
            return false
        }
        val pm = productMap.value
        val reqById = HashMap<String, Double>()
        for (line in cartList) {
            if (line.qty <= 0.0) return false
            reqById[line.productId] = PosMath.round3((reqById[line.productId] ?: 0.0) + line.qty)
        }
        for ((pid, reqQty) in reqById) {
            val live = pm[pid] ?: run { toast("Item removed from inventory", ToastType.ERROR); return false }
            if (PosMath.expiryInfo(live, _settings.value.expiryWarnDays).status == PosMath.ExpiryState.EXPIRED) {
                toast("${live.name} is expired", ToastType.ERROR)
                return false
            }
            if (reqQty > live.stock + 1e-6) {
                toast("Insufficient stock for ${live.name}", ToastType.ERROR)
                return false
            }
        }

        var customer = customerId?.let { cid -> _customers.value.find { it.id == cid } }
        if (paymentMethod == PaymentMethod.Utang && customer == null) {
            toast("Select a Suki customer account for Utang checkout", ToastType.WARNING)
            return false
        }

        val totals = cartTotals.value
        val ptVal = _settings.value.loyaltyPointValue.let { if (it > 0.0) it else 1.0 }
        val redeemed = if (customer != null) {
            OpsMath.computePointsRedemption(pointsRedeemedRequested, customer.points, ptVal, totals.grandTotal)
        } else {
            OpsMath.PointsRedemption(0, 0.0)
        }
        val finalGrandTotal = PosMath.round2((totals.grandTotal - redeemed.discountPeso).coerceAtLeast(0.0))

        var safeTendered = finalGrandTotal
        var safeChange = 0.0
        var safeSplit: com.example.model.SplitDetails? = null

        when (paymentMethod) {
            PaymentMethod.Cash -> {
                if (!tendered.isFinite() || tendered + 1e-6 < finalGrandTotal) {
                    toast("Cash tendered cannot be less than Amount Due", ToastType.ERROR)
                    return false
                }
                safeTendered = PosMath.round2(tendered)
                safeChange = PosMath.round2((safeTendered - finalGrandTotal).coerceAtLeast(0.0))
            }
            PaymentMethod.Split -> {
                if (!splitCash.isFinite() || splitCash <= 0.0 || splitCash >= finalGrandTotal) {
                    toast("Split cash must be between ₱0 and Amount Due", ToastType.ERROR)
                    return false
                }
                val c = PosMath.round2(splitCash)
                val d = PosMath.round2((finalGrandTotal - c).coerceAtLeast(0.0))
                safeSplit = com.example.model.SplitDetails(c, d, if (splitDigitalMethod == "Card") "Card" else "GCash")
            }
            else -> {}
        }

        val nowMs = System.currentTimeMillis()
        val nowIso = Instant.ofEpochMilli(nowMs).toString()
        val receiptNo = PosMath.nextReceiptNo(_sales.value, nowMs)
        val pesoPerPt = _settings.value.loyaltyPesoPerPoint.let { if (it > 0.0) it else 50.0 }
        val pointsEarned = if (customer != null) OpsMath.computeLoyaltyPointsEarned(finalGrandTotal, pesoPerPt) else 0

        if (customer != null) {
            if (paymentMethod == PaymentMethod.Utang) {
                when (val res = OpsMath.applyUtangCharge(customer, finalGrandTotal, receiptNo, utangDueDate, null, _activeShift.value?.cashierName, allowOverLimit, nowIso)) {
                    is OpsMath.UtangChargeResult.Error -> {
                        toast(res.error, ToastType.WARNING)
                        return false
                    }
                    is OpsMath.UtangChargeResult.Success -> {
                        val updatedCust = res.nextCustomer.copy(
                            points = (res.nextCustomer.points - redeemed.pointsUsed + pointsEarned).coerceAtLeast(0)
                        )
                        _customers.value = _customers.value.map { if (it.id == updatedCust.id) updatedCust else it }.also { repo.saveCustomers(it) }
                        _utangTxs.value = (listOf(res.transaction) + _utangTxs.value).take(600).also { repo.saveUtangTx(it) }
                        customer = updatedCust
                    }
                }
            } else {
                val updatedCust = customer.copy(
                    points = (customer.points - redeemed.pointsUsed + pointsEarned).coerceAtLeast(0),
                    totalSpent = PosMath.round2(customer.totalSpent + finalGrandTotal),
                    updatedAt = nowIso
                )
                _customers.value = _customers.value.map { if (it.id == updatedCust.id) updatedCust else it }.also { repo.saveCustomers(it) }
                customer = updatedCust
            }
        }

        val saleItems = cartList.map { line ->
            val prod = pm[line.productId]
            val uPrice = PosMath.getLinePrice(line, pm)
            val pType = if (uPrice < line.retailPrice) PriceType.wholesale else PriceType.retail
            SaleItem(
                productId = line.productId,
                category = prod?.category,
                name = line.name,
                qty = line.qty,
                unit = line.unit,
                unitPrice = uPrice,
                priceType = pType,
                capital = prod?.capital?.takeIf { it > 0.0 },
                lineTotal = PosMath.lineTotalPeso(uPrice, line.qty)
            )
        }

        val record = SaleRecord(
            receiptNo = receiptNo,
            dateIso = nowIso,
            dateFormatted = PosMath.formatDateTime(nowMs),
            items = saleItems,
            retailSubtotal = totals.retailSubtotal,
            wholesaleSavings = totals.wholesaleSavings,
            seniorDiscount = totals.seniorDiscount,
            grandTotal = finalGrandTotal,
            paymentMethod = paymentMethod.label,
            tendered = safeTendered,
            change = safeChange,
            refNo = refNo?.trim()?.ifEmpty { null },
            splitDetails = safeSplit,
            seniorId = seniorId?.trim()?.ifEmpty { null },
            seniorBase = if (totals.seniorDiscount > 0.0) totals.seniorBase else null,
            seniorCapped = if (totals.seniorDiscount > 0.0) totals.seniorCapped else null,
            customerId = customer?.id,
            customerName = customer?.name,
            pointsEarned = pointsEarned.takeIf { it > 0 },
            pointsRedeemed = redeemed.pointsUsed.takeIf { it > 0 },
            pointsDiscount = redeemed.discountPeso.takeIf { it > 0.0 },
            utangDueDate = if (paymentMethod == PaymentMethod.Utang) utangDueDate?.ifEmpty { null } else null,
            cashierId = _activeShift.value?.cashierId,
            cashierName = _activeShift.value?.cashierName,
            shiftId = _activeShift.value?.shiftId
        )

        updateProducts { list ->
            list.map { p ->
                val sold = reqById[p.id] ?: return@map p
                p.copy(stock = (p.stock - sold).coerceAtLeast(0.0).let { PosMath.round3(it) }, updatedAt = nowIso)
            }
        }
        val nextSales = _sales.value + record
        _sales.value = nextSales
        repo.saveSales(nextSales)

        _cart.value = emptyList()
        _isSeniorPwd.value = false
        _priceMode.value = PriceType.retail
        _checkoutOpen.value = false
        _mobileCartOpen.value = false
        _checkoutLiveDraft.value = null
        _receiptReading.value = null
        _receiptSale.value = record
        _lastCompletedDisplaySale.value = record
        toast("Sale $receiptNo completed (${PosMath.formatPeso(record.grandTotal)})")
        return true
    }

    // Hold / Recall
    fun confirmHoldOrder(label: String) {
        if (_cart.value.isEmpty()) return
        val id = "HOLD-" + System.currentTimeMillis().toString().takeLast(4)
        val entry = HeldOrder(
            id = id,
            label = label.trim().ifEmpty { null },
            time = PosMath.formatTimeOnly(),
            items = _cart.value,
            total = cartTotals.value.grandTotal,
            isSeniorPwd = _isSeniorPwd.value,
            priceMode = _priceMode.value
        )
        val nextHeld = listOf(entry) + _heldOrders.value
        _heldOrders.value = nextHeld
        repo.saveHeldOrders(nextHeld)
        _cart.value = emptyList()
        _isSeniorPwd.value = false
        _priceMode.value = PriceType.retail
        _holdModalOpen.value = false
        _mobileCartOpen.value = false
        toast("Order parked${entry.label?.let { " ($it)" } ?: ""}")
    }

    fun recallHeldOrder(id: String) {
        val order = _heldOrders.value.find { it.id == id } ?: return
        val pm = productMap.value
        val warn = _settings.value.expiryWarnDays
        var adj = 0
        val validated = mutableListOf<CartLine>()
        for (line in order.items) {
            val live = pm[line.productId]
            if (live == null || live.stock <= 0.0 || PosMath.expiryInfo(live, warn).status == PosMath.ExpiryState.EXPIRED) {
                adj++
                continue
            }
            if (line.qty > live.stock + 1e-6) {
                adj++
                validated.add(line.copy(qty = live.stock))
            } else {
                validated.add(line)
            }
        }
        val autoPark = if (_cart.value.isNotEmpty()) {
            HeldOrder("HOLD-" + System.currentTimeMillis().toString().takeLast(4), "Auto-parked before recall", PosMath.formatTimeOnly(), _cart.value, cartTotals.value.grandTotal, _isSeniorPwd.value, _priceMode.value)
        } else null

        val remaining = _heldOrders.value.filterNot { it.id == id }
        val nextHeld = if (autoPark != null) listOf(autoPark) + remaining else remaining
        _heldOrders.value = nextHeld
        repo.saveHeldOrders(nextHeld)

        _cart.value = validated
        _isSeniorPwd.value = order.isSeniorPwd == true
        _priceMode.value = order.priceMode ?: PriceType.retail
        _heldModalOpen.value = false
        _activeTab.value = TabName.pos
        toast("Recalled ${order.label ?: order.id}${if (adj > 0) " ($adj adjusted to stock)" else ""}")
    }

    fun deleteHeldOrder(id: String) {
        val next = _heldOrders.value.filterNot { it.id == id }
        _heldOrders.value = next
        repo.saveHeldOrders(next)
        toast("Parked order deleted", ToastType.WARNING)
    }

    // X-Read / Z-Read
    fun openReadingReport(isZ: Boolean) {
        val today = PosMath.startOfDayMs()
        val tomorrow = today + PosMath.DAY_MS
        val todaySales = _sales.value.filter { PosMath.inRange(it.dateIso, today, tomorrow) }
        val live = todaySales.filter { it.voided != true }
        val voided = todaySales.filter { it.voided == true }
        val st = PosMath.computeSalesStats(live, _products.value)
        val shiftSum = OpsMath.computeShiftLedgerSummary(
            _sales.value, _products.value, _drawerEvents.value, _utangTxs.value, _serviceEntries.value,
            _activeShift.value?.openingFloat ?: 0.0, today, tomorrow
        )
        var nextZ = _settings.value.zCount
        if (isZ) {
            nextZ += 1
            updateSettings(_settings.value.copy(zCount = nextZ))
        }
        val lines = mutableListOf(
            ReadingLine("Date", java.time.LocalDate.now().toString()),
        )
        _activeShift.value?.let { lines.add(ReadingLine("Cashier", it.cashierName)) }
        if (isZ) lines.add(ReadingLine("Z-Counter", "#$nextZ"))
        lines.addAll(
            listOf(
                ReadingLine("Valid Transactions", st.count.toString()),
                ReadingLine("Voided Transactions", voided.size.toString(), dividerAfter = true),
                ReadingLine("Gross Sales", PosMath.formatPeso(st.gross)),
                ReadingLine("Wholesale Savings", "-${PosMath.formatPeso(st.wholesaleDisc)}"),
                ReadingLine("SC/PWD Discounts", "-${PosMath.formatPeso(st.seniorDisc)}"),
                ReadingLine("NET SALES", PosMath.formatPeso(st.net), bold = true),
                ReadingLine("GCash/Maya/Load Fees", "+${PosMath.formatPeso(shiftSum.serviceFeesTotal)}"),
                ReadingLine("Store Gastos / Expenses", "-${PosMath.formatPeso(shiftSum.expensesTotal)}"),
                ReadingLine("TRUE NET PROFIT", PosMath.formatPeso(shiftSum.trueNetProfit), bold = true, dividerAfter = true),
                ReadingLine("Opening Float", PosMath.formatPeso(_activeShift.value?.openingFloat ?: 0.0)),
                ReadingLine("Utang Cash Collected", PosMath.formatPeso(shiftSum.utangCashCollected)),
                ReadingLine("Cash Drops / Top-Ups", "-${PosMath.formatPeso(shiftSum.cashDrops)} / +${PosMath.formatPeso(shiftSum.cashTopUps)}"),
                ReadingLine("EXPECTED DRAWER CASH", PosMath.formatPeso(shiftSum.expectedDrawerCash), bold = true, dividerAfter = true)
            )
        )
        st.tender.forEach { (m, t) -> lines.add(ReadingLine("$m (${t.count})", PosMath.formatPeso(t.amt))) }

        _receiptSale.value = null
        _receiptReading.value = ReadingReport(
            title = if (isZ) "Z-READ END OF DAY" else "X-READ SHIFT SUMMARY",
            subtitle = PosMath.formatTimeOnly(),
            lines = lines
        )
    }

    fun previewTestReceipt() {
        val paper = if (_settings.value.receiptWidth == "58mm") "58mm" else "80mm"
        _receiptSale.value = null
        _receiptReading.value = ReadingReport(
            title = "TEST RECEIPT LAYOUT",
            subtitle = "$paper Thermal Width Preview",
            lines = listOf(
                ReadingLine("Store", _settings.value.storeName.ifBlank { PosMath.DEFAULT_STORE_NAME }, bold = true),
                ReadingLine("Paper Width", paper),
                ReadingLine("Phone", _settings.value.storePhone.ifBlank { "—" }, dividerAfter = true),
                ReadingLine("Sample Item A x2", PosMath.formatPeso(50.0)),
                ReadingLine("Sample Item B x1", PosMath.formatPeso(125.0), dividerAfter = true),
                ReadingLine("TOTAL SAMPLE", PosMath.formatPeso(175.0), bold = true),
                ReadingLine("Footer", _settings.value.receiptFooter.ifBlank { "Thank you!" })
            )
        )
    }

    // Inventory Mutations
    fun saveProduct(draft: Product, editId: String?) {
        val nowIso = Instant.now().toString()
        if (editId != null) {
            val existing = productMap.value[editId]
            updateProducts { list -> list.map { if (it.id == editId) draft.copy(id = editId, updatedAt = nowIso) else it } }
            if (existing != null) {
                val delta = PosMath.round3(draft.stock - existing.stock)
                if (delta != 0.0) {
                    appendStockLog(StockLogEntry("LOG-${System.currentTimeMillis().toString(36)}", nowIso, editId, draft.name, delta, existing.stock, draft.stock, "Count Correction", "Edited in product form"))
                }
            }
            toast("Updated ${draft.name}")
        } else {
            val id = "SKU-${System.currentTimeMillis().toString(36).uppercase()}"
            updateProducts { listOf(draft.copy(id = id, updatedAt = nowIso)) + it }
            if (draft.stock > 0.0) {
                appendStockLog(StockLogEntry("LOG-${System.currentTimeMillis().toString(36)}", nowIso, id, draft.name, draft.stock, 0.0, draft.stock, "Restock", "Initial product stock"))
            }
            toast("Added ${draft.name}")
        }
        closeProductModal()
    }

    fun applyStockAdjust(productId: String, delta: Double, reason: String, note: String, newExpiry: String?, newCapital: Double?) {
        val prod = productMap.value[productId] ?: return
        val nextStock = (prod.stock + delta).coerceAtLeast(0.0).let { PosMath.round3(it) }
        val nowIso = Instant.now().toString()
        updateProducts { list ->
            list.map {
                if (it.id == productId) it.copy(
                    stock = nextStock,
                    expiry = if (newExpiry != null) newExpiry.ifEmpty { null } else it.expiry,
                    capital = newCapital ?: it.capital,
                    updatedAt = nowIso
                ) else it
            }
        }
        appendStockLog(StockLogEntry("LOG-${System.currentTimeMillis().toString(36)}", nowIso, prod.id, prod.name, delta, prod.stock, nextStock, reason, note.ifBlank { null }))
        _stockAdjustProduct.value = null
        toast("Stock updated: ${prod.name} (${PosMath.formatQty(nextStock, prod.unit)})")
    }

    fun applyBatchStock(adjustments: List<PosMath.BatchStockAdjustmentInput>) {
        val res = PosMath.applyBatchStockUpdates(_products.value, adjustments)
        if (res.changedCount == 0) {
            closeBatchStock()
            return
        }
        updateProducts { res.nextProducts }
        if (res.logEntries.isNotEmpty()) {
            val nextLog = (res.logEntries + _stockLog.value).take(500)
            _stockLog.value = nextLog
            repo.saveStockLog(nextLog)
        }
        closeBatchStock()
        toast("Batch saved: ${res.changedCount} SKU(s) updated")
    }

    fun pullExpiredBatch() {
        val warn = _settings.value.expiryWarnDays
        val exp = _products.value.filter { it.stock > 0.0 && PosMath.expiryInfo(it, warn).status == PosMath.ExpiryState.EXPIRED }
        if (exp.isEmpty()) {
            _invStockFilter.value = StockFilter.EXPIRED
            toast("All expired items already show 0 stock", ToastType.WARNING)
            return
        }
        val prefill = exp.associate { it.id to (0.0 to "Pull expired stock from shelf") }
        openBatchStock("set", "Spoilage / Expired", prefill)
    }

    fun applyCsvImport(rows: List<PosMath.CsvImportRowPreview>, mode: String) {
        val res = com.example.domain.InventoryFilter.applyCsvImportToCatalog(_products.value, rows, mode)
        updateProducts { res.nextProducts }
        if (res.newLogs.isNotEmpty()) {
            val nextLog = (res.newLogs + _stockLog.value).take(500)
            _stockLog.value = nextLog
            repo.saveStockLog(nextLog)
        }
        closeCsvImport()
        toast("CSV import: +${res.created} new, ${res.updated} updated")
    }

    fun saveScReview(map: Map<String, Boolean>) {
        updateProducts { list -> list.map { p -> map[p.id]?.let { flag -> p.copy(scEligible = flag) } ?: p } }
        closeScReview()
        toast("SC/PWD eligibility flags saved")
    }

    fun confirmVoidSale(receiptNo: String, reason: String, upgradedSettings: StoreSettings?) {
        if (upgradedSettings != null) updateSettings(upgradedSettings)
        val target = _sales.value.find { it.receiptNo == receiptNo }
        if (target == null || target.voided == true) {
            _voidTargetSale.value = null
            return
        }
        val nowIso = Instant.now().toString()
        val logs = mutableListOf<StockLogEntry>()
        updateProducts { list ->
            list.map { p ->
                val restoreQty = target.items.filter { it.productId == p.id || (it.productId == null && it.name == p.name) }.sumOf { it.qty }
                if (restoreQty <= 0.0) return@map p
                val nextStk = PosMath.round3(p.stock + restoreQty)
                logs.add(StockLogEntry("LOG-${System.currentTimeMillis().toString(36)}-${p.id}", nowIso, p.id, p.name, restoreQty, p.stock, nextStk, "Count Correction", "Void $receiptNo: $reason"))
                p.copy(stock = nextStk, updatedAt = nowIso)
            }
        }
        if (logs.isNotEmpty()) {
            val nextLog = (logs + _stockLog.value).take(500)
            _stockLog.value = nextLog
            repo.saveStockLog(nextLog)
        }
        val nextSales = _sales.value.map {
            if (it.receiptNo == receiptNo) it.copy(voided = true, voidedAt = nowIso, voidReason = reason) else it
        }
        _sales.value = nextSales
        repo.saveSales(nextSales)

        if (target.customerId != null) {
            val cust = _customers.value.find { it.id == target.customerId }
            if (cust != null) {
                val balAdj = if (target.paymentMethod == "Utang") PosMath.round2((cust.balance - target.grandTotal).coerceAtLeast(0.0)) else cust.balance
                val ptsAdj = (cust.points - (target.pointsEarned ?: 0) + (target.pointsRedeemed ?: 0)).coerceAtLeast(0)
                _customers.value = _customers.value.map {
                    if (it.id == cust.id) it.copy(balance = balAdj, points = ptsAdj, totalSpent = PosMath.round2((it.totalSpent - target.grandTotal).coerceAtLeast(0.0)), updatedAt = nowIso)
                    else it
                }.also { repo.saveCustomers(it) }
                if (target.paymentMethod == "Utang") {
                    val rev = UtangTransaction("UREV-${System.currentTimeMillis().toString(36).uppercase()}", cust.id, cust.name, "adjustment", target.grandTotal, balAdj, target.receiptNo, note = "Void reversal ($reason)", dateIso = nowIso, cashierName = _activeShift.value?.cashierName)
                    _utangTxs.value = (listOf(rev) + _utangTxs.value).take(600).also { repo.saveUtangTx(it) }
                }
            }
        }

        logSecurityEvent(SecurityEventType.SALE_VOIDED, "Voided $receiptNo (${PosMath.formatPeso(target.grandTotal)}) — $reason", SecuritySeverity.warning)
        _voidTargetSale.value = null
        toast("Receipt $receiptNo voided & stock restored", ToastType.WARNING)
    }

    // Store Ops Actions
    fun addCustomer(name: String, phone: String?, address: String?, creditLimit: Double, notes: String?): SukiCustomer {
        val nowIso = Instant.now().toString()
        val created = SukiCustomer(
            id = "SUKI-${System.currentTimeMillis().toString(36).uppercase()}",
            name = name.trim(),
            phone = phone?.trim()?.ifEmpty { null },
            address = address?.trim()?.ifEmpty { null },
            creditLimit = PosMath.round2(creditLimit.coerceAtLeast(0.0)),
            balance = 0.0,
            points = 0,
            totalSpent = 0.0,
            notes = notes?.trim()?.ifEmpty { null },
            createdAt = nowIso,
            updatedAt = nowIso
        )
        _customers.value = (listOf(created) + _customers.value).also { repo.saveCustomers(it) }
        toast("Added Suki account: ${created.name}")
        return created
    }

    fun postUtangPayment(customerId: String, amount: Double, method: String, note: String?) {
        val cust = _customers.value.find { it.id == customerId } ?: return
        when (val res = OpsMath.applyUtangPayment(cust, amount, method, note, _activeShift.value?.cashierName)) {
            is OpsMath.UtangPaymentResult.Error -> toast(res.error, ToastType.WARNING)
            is OpsMath.UtangPaymentResult.Success -> {
                _customers.value = _customers.value.map { if (it.id == customerId) res.nextCustomer else it }.also { repo.saveCustomers(it) }
                _utangTxs.value = (listOf(res.transaction) + _utangTxs.value).take(600).also { repo.saveUtangTx(it) }
                toast("Posted bayad ${PosMath.formatPeso(res.appliedAmount)} from ${cust.name}")
            }
        }
    }

    fun postUtangManualCharge(customerId: String, amount: Double, dueDate: String?, note: String?, allowOverLimit: Boolean) {
        val cust = _customers.value.find { it.id == customerId } ?: return
        when (val res = OpsMath.applyUtangCharge(cust, amount, null, dueDate, note, _activeShift.value?.cashierName, allowOverLimit)) {
            is OpsMath.UtangChargeResult.Error -> toast(res.error, ToastType.WARNING)
            is OpsMath.UtangChargeResult.Success -> {
                _customers.value = _customers.value.map { if (it.id == customerId) res.nextCustomer else it }.also { repo.saveCustomers(it) }
                _utangTxs.value = (listOf(res.transaction) + _utangTxs.value).take(600).also { repo.saveUtangTx(it) }
                toast("Added ${PosMath.formatPeso(amount)} charge to ${cust.name}")
            }
        }
    }

    fun createRepackRule(name: String, masterId: String, targetId: String, yieldQty: Double, autoCost: Boolean) {
        val rule = RepackRule(
            id = "RULE-${System.currentTimeMillis().toString(36).uppercase()}",
            name = name.trim(),
            masterProductId = masterId,
            targetProductId = targetId,
            yieldQty = yieldQty,
            autoComputeCost = autoCost,
            updatedAt = Instant.now().toString()
        )
        _repackRules.value = (listOf(rule) + _repackRules.value).also { repo.saveRepackRules(it) }
        toast("Saved repack rule: ${rule.name}")
    }

    fun deleteRepackRule(ruleId: String) {
        _repackRules.value = _repackRules.value.filterNot { it.id == ruleId }.also { repo.saveRepackRules(it) }
        toast("Repack rule removed", ToastType.WARNING)
    }

    fun runRepackConversion(ruleId: String, qty: Double) {
        val rule = _repackRules.value.find { it.id == ruleId } ?: return
        when (val res = OpsMath.executeRepackConversion(_products.value, rule, qty, _activeShift.value?.cashierName)) {
            is OpsMath.RepackResult.Error -> toast(res.error, ToastType.WARNING)
            is OpsMath.RepackResult.Success -> {
                updateProducts { res.nextProducts }
                _stockLog.value = (res.stockLogs + _stockLog.value).take(500).also { repo.saveStockLog(it) }
                _repackLogs.value = (listOf(res.repackLog) + _repackLogs.value).take(300).also { repo.saveRepackLogs(it) }
                toast("Unpacked ${PosMath.formatQty(qty)} → +${PosMath.formatQty(res.addedQty)} ${res.repackLog.targetName}")
            }
        }
    }

    fun openShift(cashierId: String, openingFloat: Double, pinInput: String): Boolean {
        val cashier = _cashiers.value.find { it.id == cashierId && it.active }
        if (cashier == null) {
            toast("Select an active cashier profile", ToastType.WARNING)
            return false
        }
        val check = security.verifyCashierPin(pinInput, cashier)
        if (!check.ok) {
            toast(check.error ?: "Incorrect cashier PIN", ToastType.ERROR)
            logSecurityEvent(
                if (check.lockedOutNow) SecurityEventType.PIN_LOCKOUT else SecurityEventType.PIN_FAIL,
                "Cashier PIN failed for ${cashier.name}",
                if (check.lockedOutNow) SecuritySeverity.critical else SecuritySeverity.warning
            )
            return false
        }
        if (check.upgradedCashier != null) {
            _cashiers.value = _cashiers.value.map { if (it.id == check.upgradedCashier.id) check.upgradedCashier else it }.also { repo.saveCashiers(it) }
        }
        val shift = ActiveShiftState(
            shiftId = "SHF-${System.currentTimeMillis().toString(36).uppercase()}",
            cashierId = cashier.id,
            cashierName = cashier.name,
            cashierRole = cashier.role,
            openedAt = Instant.now().toString(),
            openingFloat = PosMath.round2(openingFloat.coerceAtLeast(0.0))
        )
        _activeShift.value = shift
        repo.saveActiveShift(shift)
        toast("Shift started for ${cashier.name} (${PosMath.formatPeso(shift.openingFloat)} float)")
        return true
    }

    fun addCashier(name: String, role: String, pin: String?) {
        val base = CashierAccount("CSH-${System.currentTimeMillis().toString(36).uppercase()}", name.trim(), role, active = true, createdAt = Instant.now().toString())
        val created = if (!pin.isNullOrBlank()) security.setCashierPinFields(base, pin) else base
        _cashiers.value = (_cashiers.value + created).also { repo.saveCashiers(it) }
        toast("Added ${created.role}: ${created.name}")
    }

    fun toggleCashierActive(id: String) {
        _cashiers.value = _cashiers.value.map { if (it.id == id) it.copy(active = !it.active) else it }.also { repo.saveCashiers(it) }
    }

    fun addDrawerEvent(type: DrawerEventType, category: String, amount: Double, note: String?) {
        val entry = CashDrawerEvent(
            id = "DRW-${System.currentTimeMillis().toString(36).uppercase()}",
            dateIso = Instant.now().toString(),
            type = type,
            category = category.trim().ifEmpty { type.label },
            amount = PosMath.round2(amount),
            note = note?.trim()?.ifEmpty { null },
            cashierName = _activeShift.value?.cashierName,
            shiftId = _activeShift.value?.shiftId
        )
        _drawerEvents.value = (listOf(entry) + _drawerEvents.value).take(400).also { repo.saveDrawerEvents(it) }
        toast("Recorded ${type.label}: ${PosMath.formatPeso(entry.amount)}")
    }

    fun deleteDrawerEvent(id: String) {
        _drawerEvents.value = _drawerEvents.value.filterNot { it.id == id }.also { repo.saveDrawerEvents(it) }
        toast("Drawer entry removed", ToastType.WARNING)
    }

    fun addServiceEntry(kind: DigitalServiceKind, amount: Double, fee: Double, reference: String?, customerPhone: String?, note: String?) {
        val entry = DigitalServiceEntry(
            id = "SVC-${System.currentTimeMillis().toString(36).uppercase()}",
            dateIso = Instant.now().toString(),
            kind = kind.label,
            amount = PosMath.round2(amount),
            fee = PosMath.round2(fee),
            reference = reference?.trim()?.ifEmpty { null },
            customerPhone = customerPhone?.trim()?.ifEmpty { null },
            note = note?.trim()?.ifEmpty { null },
            cashierName = _activeShift.value?.cashierName
        )
        _serviceEntries.value = (listOf(entry) + _serviceEntries.value).take(400).also { repo.saveServiceLogs(it) }
        toast("Logged ${entry.kind}: ${PosMath.formatPeso(entry.amount)} (Fee ${PosMath.formatPeso(entry.fee)})")
    }

    fun deleteServiceEntry(id: String) {
        _serviceEntries.value = _serviceEntries.value.filterNot { it.id == id }.also { repo.saveServiceLogs(it) }
        toast("Service log removed", ToastType.WARNING)
    }

    // Confirm Actions & Backup/Restore
    fun prepareRestore(payload: BackupPayload, mode: String) {
        if (mode == "replace") {
            _confirmState.value = ConfirmUiState(
                type = ConfirmActionType.replaceRestore,
                title = "Replace All Device Data?",
                message = "Replace products, sales, and held orders with backup (${payload.products.size} SKUs, ${payload.sales.size} sales). Device Manager PIN is preserved.",
                confirmLabel = "Replace Device Data",
                requirePin = true,
                restorePayload = payload
            )
            return
        }
        val existIds = _products.value.mapTo(HashSet()) { it.id }
        val existBc = _products.value.map { PosMath.normBarcode(it.barcode) }.filter { it.isNotEmpty() }.toHashSet()
        val newProds = payload.products.filter { it.id !in existIds && PosMath.normBarcode(it.barcode) !in existBc }
        updateProducts { it + newProds }

        val existRcpt = _sales.value.mapTo(HashSet()) { it.receiptNo }
        val newSales = payload.sales.filter { it.receiptNo !in existRcpt }
        _sales.value = (_sales.value + newSales).also { repo.saveSales(it) }

        val existHeld = _heldOrders.value.mapTo(HashSet()) { it.id }
        val newHeld = payload.heldOrders.filter { it.id !in existHeld }
        _heldOrders.value = (_heldOrders.value + newHeld).also { repo.saveHeldOrders(it) }

        logSecurityEvent(SecurityEventType.BACKUP_RESTORED, "Merged backup (+${newProds.size} SKUs, +${newSales.size} sales)")
        toast("Merged +${newProds.size} products & +${newSales.size} receipts")
    }

    fun executeConfirmAction(upgradedSettings: StoreSettings? = null) {
        if (upgradedSettings != null) updateSettings(upgradedSettings)
        val state = _confirmState.value ?: return
        when (state.type) {
            ConfirmActionType.deleteProduct -> {
                val pid = state.productId
                if (pid != null) {
                    updateProducts { it.filterNot { p -> p.id == pid } }
                    _cart.value = _cart.value.filterNot { it.productId == pid }
                    toast("Product deleted", ToastType.WARNING)
                }
            }
            ConfirmActionType.clearCart -> {
                _cart.value = emptyList()
                _isSeniorPwd.value = false
                _mobileCartOpen.value = false
                toast("Basket cleared", ToastType.WARNING)
            }
            ConfirmActionType.clearSales -> {
                val n = _sales.value.size
                _sales.value = emptyList()
                repo.saveSales(emptyList())
                logSecurityEvent(SecurityEventType.DATA_CLEARED, "Cleared all sales history ($n receipts)", SecuritySeverity.critical)
                toast("Sales history cleared", ToastType.WARNING)
            }
            ConfirmActionType.replaceRestore -> {
                val payload = state.restorePayload
                if (payload != null) {
                    updateProducts { payload.products }
                    _sales.value = payload.sales.also { repo.saveSales(it) }
                    _heldOrders.value = payload.heldOrders.also { repo.saveHeldOrders(it) }
                    payload.settings?.let { inc ->
                        val cur = _settings.value
                        updateSettings(
                            inc.copy(
                                adminPin = cur.adminPin,
                                adminPinHash = cur.adminPinHash,
                                adminPinSalt = cur.adminPinSalt,
                                adminPinIter = cur.adminPinIter,
                                adminPinAlgo = cur.adminPinAlgo,
                                adminPinWeak = cur.adminPinWeak,
                                biometricEnabled = cur.biometricEnabled
                            )
                        )
                    }
                    logSecurityEvent(SecurityEventType.BACKUP_RESTORED, "Replaced device store from backup (${payload.products.size} SKUs)", SecuritySeverity.warning)
                    toast("Backup restored cleanly")
                }
            }
            ConfirmActionType.factoryReset -> {
                val fresh = PosMath.buildDefaultCatalog()
                _products.value = fresh; repo.saveProducts(fresh)
                _sales.value = emptyList(); repo.saveSales(emptyList())
                _heldOrders.value = emptyList(); repo.saveHeldOrders(emptyList())
                _cart.value = emptyList()
                _stockLog.value = emptyList(); repo.saveStockLog(emptyList())
                _customers.value = emptyList(); repo.saveCustomers(emptyList())
                _utangTxs.value = emptyList(); repo.saveUtangTx(emptyList())
                _repackRules.value = emptyList(); repo.saveRepackRules(emptyList())
                _repackLogs.value = emptyList(); repo.saveRepackLogs(emptyList())
                _drawerEvents.value = emptyList(); repo.saveDrawerEvents(emptyList())
                _serviceEntries.value = emptyList(); repo.saveServiceLogs(emptyList())
                val defCash = repo.buildDefaultCashiers()
                _cashiers.value = defCash; repo.saveCashiers(defCash)
                _activeShift.value = null; repo.saveActiveShift(null)
                updateSettings(StoreSettings())
                _settingsUnlocked.value = false
                _terminalLocked.value = false
                _activeTab.value = TabName.pos
                logSecurityEvent(SecurityEventType.FACTORY_RESET, "Factory reset executed", SecuritySeverity.critical)
                toast("App reset to factory defaults", ToastType.WARNING)
            }
        }
        _confirmState.value = null
    }

    // Export helpers
    fun exportPlainJsonBackup() {
        val payload = BackupPayload(
            app = "omnimart-ph-pos",
            version = 1,
            exportedAt = Instant.now().toString(),
            products = _products.value,
            sales = _sales.value,
            heldOrders = _heldOrders.value,
            settings = _settings.value.copy(adminPin = null, adminPinHash = null, adminPinSalt = null, adminPinIter = null, adminPinAlgo = null, adminPinWeak = null)
        )
        val txt = PosRepository.json.encodeToString(BackupPayload.serializer(), payload)
        val dateStr = java.time.LocalDate.now().toString()
        AndroidDeviceBridge.shareTextFile(appContext, "eternalblue-backup-$dateStr.json", txt, "application/json")
        updateSettings(_settings.value.copy(lastBackup = Instant.now().toString()))
        logSecurityEvent(SecurityEventType.BACKUP_EXPORTED, "Exported JSON backup (${_products.value.size} SKUs, ${_sales.value.size} sales)")
    }

    fun exportEncryptedVault(passphrase: String) {
        val env = security.encryptBackupPayload(_products.value, _sales.value, _heldOrders.value, _settings.value, passphrase)
        val txt = PosRepository.json.encodeToString(EncryptedVaultEnvelope.serializer(), env)
        val dateStr = java.time.LocalDate.now().toString()
        AndroidDeviceBridge.shareTextFile(appContext, "eternalblue-vault-$dateStr.ebvault", txt, "application/json")
        updateSettings(_settings.value.copy(lastBackup = Instant.now().toString()))
        logSecurityEvent(SecurityEventType.BACKUP_ENCRYPTED_EXPORTED, "Exported AES-256-GCM encrypted vault")
        toast("Encrypted vault ready to save/share")
    }

    // Assistant Interactions
    fun askAssistant(query: String, preferredLang: AssistantLang? = null) {
        val clean = query.trim()
        if (clean.isEmpty()) return
        val ctx = AssistantContext(
            products = _products.value,
            sales = _sales.value,
            heldOrders = _heldOrders.value,
            settings = _settings.value,
            cart = _cart.value,
            stockLog = _stockLog.value,
            securityLog = _securityLog.value,
            preferredLang = preferredLang
        )
        val userMsg = AssistantChatMessage(System.nanoTime(), isUser = true, userText = clean)
        val reply = assistantEngine.ask(clean, ctx)
        val botMsg = AssistantChatMessage(System.nanoTime() + 1, isUser = false, reply = reply)
        _assistantMessages.value = _assistantMessages.value + userMsg + botMsg
    }

    fun resetAssistant(lang: AssistantLang) {
        _assistantMessages.value = listOf(AssistantChatMessage(System.nanoTime(), isUser = false, reply = assistantEngine.reset(lang)))
    }

    fun executeAssistantAction(action: AssistantAction) {
        _assistantOpen.value = false
        when (action) {
            is AssistantAction.OpenReorder -> { _activeTab.value = TabName.inventory; openReorder() }
            is AssistantAction.OpenStockFilter -> { _invCategory.value = "All"; _invSearch.value = ""; _invStockFilter.value = action.filter; _activeTab.value = TabName.inventory }
            is AssistantAction.OpenScReview -> { _activeTab.value = TabName.inventory; openScReview() }
            is AssistantAction.OpenBatchRestock -> { _activeTab.value = TabName.inventory; openBatchStock("delta") }
            is AssistantAction.OpenCsvImport -> { _activeTab.value = TabName.inventory; openCsvImport() }
            is AssistantAction.OpenStockLog -> { _activeTab.value = TabName.inventory; openStockLog() }
            is AssistantAction.OpenReceipt -> {
                val target = _sales.value.find { it.receiptNo == action.receiptNo }
                if (target != null) openReceipt(target) else _activeTab.value = TabName.sales
            }
            is AssistantAction.OpenSales -> _activeTab.value = TabName.sales
            is AssistantAction.OpenXRead -> { _activeTab.value = TabName.sales; openReadingReport(false) }
            is AssistantAction.OpenZRead -> { _activeTab.value = TabName.sales; openReadingReport(true) }
            is AssistantAction.OpenCashDrawer -> { _salesCashDrawerSignal.value += 1; _activeTab.value = TabName.sales }
            is AssistantAction.AddToCart -> {
                productMap.value[action.productId]?.let { p ->
                    addQtyToCart(p, action.qty)
                    _activeTab.value = TabName.pos
                    toast("Added ${PosMath.formatQty(action.qty)}× ${p.name}")
                }
            }
            is AssistantAction.FindProductStock -> {
                _invCategory.value = "All"; _invStockFilter.value = StockFilter.ALL; _invSearch.value = action.query; _activeTab.value = TabName.inventory
            }
            is AssistantAction.OpenHeld -> { _activeTab.value = TabName.pos; openHeldModal() }
            is AssistantAction.OpenSettings -> openSettingsTab()
            is AssistantAction.OpenScanner -> { _activeTab.value = TabName.pos; openScanner(ScannerMode.pos) }
        }
    }
}
