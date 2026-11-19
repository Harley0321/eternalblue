package com.example.viewmodel

import android.app.Application
import android.content.Context
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.BuildConfig
import com.example.data.PosRepository
import com.example.domain.AssistantEngine
import com.example.domain.GitHubUpdateChecker
import com.example.domain.OpsMath
import com.example.domain.PosMath
import com.example.hardware.AndroidDeviceBridge
import com.example.model.ActiveShiftState
import com.example.model.CartLine
import com.example.model.CartTotals
import com.example.model.CashDrawerEvent
import com.example.model.CashierAccount
import com.example.model.DigitalServiceEntry
import com.example.model.HeldOrder
import com.example.model.OperationsSubTab
import com.example.model.PosBackupPayload
import com.example.model.PriceType
import com.example.model.Product
import com.example.model.RepackLogEntry
import com.example.model.RepackRule
import com.example.model.SaleItem
import com.example.model.SaleRecord
import com.example.model.SecurityLogEntry
import com.example.model.SplitDetails
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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import java.time.Instant
import kotlin.math.max
import kotlin.math.roundToLong

data class PosUiState(
    val activeTab: TabName = TabName.POS,
    val opsSubTab: OperationsSubTab = OperationsSubTab.UTANG,
    val products: List<Product> = emptyList(),
    val sales: List<SaleRecord> = emptyList(),
    val heldOrders: List<HeldOrder> = emptyList(),
    val settings: StoreSettings = StoreSettings(),
    val sukiCustomers: List<SukiCustomer> = emptyList(),
    val utangTransactions: List<UtangTransaction> = emptyList(),
    val repackRules: List<RepackRule> = emptyList(),
    val repackLog: List<RepackLogEntry> = emptyList(),
    val drawerEvents: List<CashDrawerEvent> = emptyList(),
    val digitalServices: List<DigitalServiceEntry> = emptyList(),
    val cashiers: List<CashierAccount> = emptyList(),
    val activeShift: ActiveShiftState? = null,
    val stockLog: List<StockLogEntry> = emptyList(),
    val securityLog: List<SecurityLogEntry> = emptyList(),
    val cart: List<CartLine> = emptyList(),
    val priceMode: PriceType = PriceType.retail,
    val isSeniorPwd: Boolean = false,
    val seniorId: String = "",
    val posSearch: String = "",
    val posCategory: String = "All",
    val stockSearch: String = "",
    val stockFilter: StockFilter = StockFilter.ALL,
    val stockSort: StockSort = StockSort.DEFAULT,
    val settingsUnlocked: Boolean = false,
    val terminalLocked: Boolean = false,
    val checkoutOpen: Boolean = false,
    val receiptModalSale: SaleRecord? = null,
    val assistantOpen: Boolean = false,
    val assistantLang: AssistantEngine.Lang = AssistantEngine.Lang.EN,
    val assistantMessages: List<AssistantEngine.ChatMessage> = emptyList(),
    val scannerOpen: Boolean = false,
    val scannerTarget: String = "pos", // pos | inventory | productForm
    val editingProduct: Product? = null,
    val productModalOpen: Boolean = false,
    val productModalScannedBarcode: String = "",
    val stockAdjustProduct: Product? = null,
    val batchModalOpen: Boolean = false,
    val stockLogModalOpen: Boolean = false,
    val heldOrdersModalOpen: Boolean = false,
    val holdCartModalOpen: Boolean = false,
    val voidSaleTarget: SaleRecord? = null,
    val pinModalMode: String? = null, // null | unlockSettings | setPin | unlockTerminal
    val pinBusy: Boolean = false,
    val pinError: String? = null,
    val pinFailCount: Int = 0,
    val pinLockoutUntilMs: Long = 0L,
    val scannedProductPromptCode: String? = null,
    val updateChecking: Boolean = false,
    val updateInfo: GitHubUpdateChecker.ReleaseInfo? = null,
    val updateCheckedAt: String? = null,
    val apkDownloading: Boolean = false,
    val apkDownloadProgress: Int = 0,
    val toasts: List<ToastItem> = emptyList()
) {
    val productMap: Map<String, Product> get() = products.associateBy { it.id }
    val cartTotals: CartTotals get() = PosMath.computeCartTotals(cart, productMap, isSeniorPwd, settings)
    val cartCount: Int get() = cart.size
    val pinConfigured: Boolean get() = !settings.adminPinHash.isNullOrBlank()
    val storePulse: AssistantEngine.StorePulse
        get() = AssistantEngine.computePulse(products, sales, heldOrders, settings)
}

class PosViewModel(application: Application) : AndroidViewModel(application) {
    private val repo = PosRepository(application)
    private val _state = MutableStateFlow(PosUiState())
    val state: StateFlow<PosUiState> = _state.asStateFlow()

    init {
        val products = repo.loadProducts()
        val sales = repo.loadSales()
        val held = repo.loadHeldOrders()
        val settings = repo.loadSettings()
        val suki = repo.loadSukiCustomers()
        val utang = repo.loadUtangTx()
        val rRules = repo.loadRepackRules()
        val rLog = repo.loadRepackLog()
        val dEvents = repo.loadDrawerEvents()
        val dServ = repo.loadDigitalServices()
        val cashiers = repo.loadCashiers()
        val activeShift = repo.loadActiveShift() ?: cashiers.firstOrNull()?.let { c ->
            ActiveShiftState("SHIFT-INIT", c.id, c.name, c.role, Instant.now().toString(), 1500.0)
        }
        val stockLog = repo.loadStockLog()
        val secLog = repo.loadSecurityLog()
        val pinConf = !settings.adminPinHash.isNullOrBlank()
        val welcome = AssistantEngine.welcome(AssistantEngine.Lang.EN)

        _state.value = PosUiState(
            products = products,
            sales = sales,
            heldOrders = held,
            settings = settings,
            sukiCustomers = suki,
            utangTransactions = utang,
            repackRules = rRules,
            repackLog = rLog,
            drawerEvents = dEvents,
            digitalServices = dServ,
            cashiers = cashiers,
            activeShift = activeShift,
            stockLog = stockLog,
            securityLog = secLog,
            settingsUnlocked = !pinConf,
            terminalLocked = pinConf && settings.lockWholePos,
            assistantMessages = listOf(
                AssistantEngine.ChatMessage(1L, false, welcome.text, emptyList(), welcome.chips)
            )
        )
        checkForGitHubUpdates(silent = true)
    }

    fun toast(msg: String, type: ToastType = ToastType.INFO) {
        val id = System.currentTimeMillis() + (1..999).random()
        _state.update { it.copy(toasts = (it.toasts + ToastItem(id, msg, type)).takeLast(3)) }
        viewModelScope.launch {
            delay(2800)
            _state.update { s -> s.copy(toasts = s.toasts.filterNot { it.id == id }) }
        }
    }

    fun setActiveTab(tab: TabName) {
        _state.update { it.copy(activeTab = tab) }
    }

    fun setOpsSubTab(sub: OperationsSubTab) {
        _state.update { it.copy(opsSubTab = sub) }
    }

    fun setPosSearch(q: String) = _state.update { it.copy(posSearch = q) }
    fun setPosCategory(cat: String) = _state.update { it.copy(posCategory = cat) }
    fun setStockSearch(q: String) = _state.update { it.copy(stockSearch = q) }
    fun setStockFilter(f: StockFilter) = _state.update { it.copy(stockFilter = f) }
    fun setStockSort(s: StockSort) = _state.update { it.copy(stockSort = s) }

    fun togglePriceMode(mode: PriceType) {
        _state.update { st ->
            val updated = st.cart.map { it.copy(priceType = mode) }
            st.copy(priceMode = mode, cart = updated)
        }
    }

    fun toggleSeniorPwd(enabled: Boolean) {
        _state.update { it.copy(isSeniorPwd = enabled) }
    }

    fun setSeniorId(id: String) {
        _state.update { it.copy(seniorId = id) }
    }

    fun addToCart(product: Product, qtyDelta: Double = 1.0) {
        if (product.stock <= 0.0001) {
            toast("${product.name} is out of stock.", ToastType.WARNING)
            return
        }
        if (_state.value.settings.beep) AndroidDeviceBridge.playBeep()
        _state.update { st ->
            val existing = st.cart.firstOrNull { it.productId == product.id }
            val nextCart = if (existing != null) {
                val nextQty = PosMath.round3(existing.qty + qtyDelta).coerceAtMost(product.stock)
                st.cart.map { if (it.productId == product.id) it.copy(qty = nextQty) else it }
            } else {
                st.cart + CartLine(
                    productId = product.id,
                    name = product.name,
                    unit = product.unit,
                    retailPrice = product.retailPrice,
                    wholesalePrice = product.wholesalePrice,
                    wholesaleMinQty = product.wholesaleMinQty,
                    priceType = st.priceMode,
                    qty = qtyDelta.coerceAtMost(product.stock)
                )
            }
            st.copy(cart = nextCart)
        }
    }

    fun updateCartQty(productId: String, nextQty: Double) {
        _state.update { st ->
            val p = st.productMap[productId]
            val maxStock = p?.stock ?: 99999.0
            val clean = PosMath.round3(nextQty)
            val nextCart = if (clean <= 0.0) {
                st.cart.filterNot { it.productId == productId }
            } else {
                st.cart.map {
                    if (it.productId == productId) it.copy(qty = clean.coerceAtMost(maxStock)) else it
                }
            }
            st.copy(cart = nextCart)
        }
    }

    fun toggleLinePriceType(productId: String) {
        _state.update { st ->
            val nextCart = st.cart.map {
                if (it.productId == productId) {
                    val nextType = if (it.priceType == PriceType.retail) PriceType.wholesale else PriceType.retail
                    it.copy(priceType = nextType)
                } else it
            }
            st.copy(cart = nextCart)
        }
    }

    fun clearCart() = _state.update { it.copy(cart = emptyList(), isSeniorPwd = false, seniorId = "") }

    fun setHoldCartOpen(open: Boolean) = _state.update { it.copy(holdCartModalOpen = open) }
    fun setHeldOrdersOpen(open: Boolean) = _state.update { it.copy(heldOrdersModalOpen = open) }

    fun holdCurrentCart(label: String) {
        val st = _state.value
        if (st.cart.isEmpty()) return
        val order = HeldOrder(
            id = "HOLD-${System.currentTimeMillis()}",
            label = label.trim().ifEmpty { "Customer #${st.heldOrders.size + 1}" },
            time = PosMath.formatDateTime(Instant.now().toString()),
            items = st.cart,
            total = st.cartTotals.grandTotal,
            isSeniorPwd = st.isSeniorPwd,
            priceMode = st.priceMode
        )
        val nextHeld = listOf(order) + st.heldOrders
        repo.saveHeldOrders(nextHeld)
        _state.update {
            it.copy(
                heldOrders = nextHeld,
                cart = emptyList(),
                isSeniorPwd = false,
                seniorId = "",
                holdCartModalOpen = false
            )
        }
        toast("Order parked (${order.label})")
    }

    fun recallHeldOrder(order: HeldOrder) {
        val st = _state.value
        val nextHeld = st.heldOrders.filterNot { it.id == order.id }
        repo.saveHeldOrders(nextHeld)
        _state.update {
            it.copy(
                heldOrders = nextHeld,
                cart = order.items,
                isSeniorPwd = order.isSeniorPwd ?: false,
                priceMode = order.priceMode ?: PriceType.retail,
                heldOrdersModalOpen = false,
                activeTab = TabName.POS
            )
        }
        toast("Recalled ${order.label ?: order.id}")
    }

    fun deleteHeldOrder(id: String) {
        val next = _state.value.heldOrders.filterNot { it.id == id }
        repo.saveHeldOrders(next)
        _state.update { it.copy(heldOrders = next) }
    }

    fun openCheckout() {
        if (_state.value.cart.isEmpty()) {
            toast("Cart is empty", ToastType.WARNING)
            return
        }
        _state.update { it.copy(checkoutOpen = true) }
    }

    fun closeCheckout() = _state.update { it.copy(checkoutOpen = false) }
    fun closeReceipt() = _state.update { it.copy(receiptModalSale = null) }
    fun openReceipt(sale: SaleRecord) = _state.update { it.copy(receiptModalSale = sale) }

    fun completeCheckout(
        paymentMethod: String,
        tendered: Double,
        refNo: String?,
        splitCash: Double = 0.0,
        splitDigital: Double = 0.0,
        splitMethod: String = "GCash",
        customerId: String? = null,
        utangDueDate: String? = null,
        redeemPoints: Int = 0
    ) {
        val st = _state.value
        if (st.cart.isEmpty()) return
        val totals = st.cartTotals
        val map = st.productMap

        val suki = customerId?.let { cid -> st.sukiCustomers.firstOrNull { it.id == cid } }
        val pointVal = st.settings.loyaltyPointValue.takeIf { it > 0.0 } ?: 1.0
        val usedPoints = if (suki != null && redeemPoints > 0) {
            minOf(redeemPoints, suki.points, (totals.grandTotal / pointVal).toInt())
        } else 0
        val pointsDiscount = PosMath.round2(usedPoints * pointVal)
        val payable = max(0.0, PosMath.round2(totals.grandTotal - pointsDiscount))

        if (paymentMethod == "Cash" && tendered + 0.001 < payable) {
            toast("Insufficient cash tendered", ToastType.ERROR)
            return
        }
        if (paymentMethod == "Utang" && suki == null) {
            toast("Select a Suki customer for Utang checkout", ToastType.ERROR)
            return
        }

        val receiptNo = PosMath.nextReceiptNo(st.sales)
        val nowIso = Instant.now().toString()
        val saleItems = st.cart.map { line ->
            val p = map[line.productId]
            val unitPrice = PosMath.getLinePrice(line, map)
            SaleItem(
                productId = line.productId,
                category = p?.category,
                name = line.name,
                qty = line.qty,
                unit = line.unit,
                unitPrice = unitPrice,
                priceType = if (PosMath.isWholesaleLine(line, map)) PriceType.wholesale else PriceType.retail,
                capital = p?.capital,
                lineTotal = PosMath.lineTotalPeso(unitPrice, line.qty)
            )
        }

        var nextCustomers = st.sukiCustomers
        var nextUtang = st.utangTransactions
        val earnedPoints = if (suki != null && paymentMethod != "Utang") {
            OpsMath.computeLoyaltyPointsEarned(payable, st.settings.loyaltyPesoPerPoint)
        } else 0

        if (suki != null) {
            var updatedSuki = suki.copy(
                points = max(0, suki.points - usedPoints + earnedPoints),
                totalSpent = if (paymentMethod != "Utang") PosMath.round2(suki.totalSpent + payable) else suki.totalSpent,
                updatedAt = nowIso
            )
            if (paymentMethod == "Utang") {
                when (val r = OpsMath.applyUtangCharge(
                    updatedSuki, payable, receiptNo, utangDueDate,
                    cashierName = st.activeShift?.cashierName
                )) {
                    is OpsMath.UtangResult.Err -> {
                        toast(r.error, ToastType.ERROR)
                        return
                    }
                    is OpsMath.UtangResult.Ok -> {
                        updatedSuki = r.customer
                        nextUtang = listOf(r.tx) + nextUtang
                    }
                }
            }
            nextCustomers = nextCustomers.map { if (it.id == updatedSuki.id) updatedSuki else it }
        }

        val change = when (paymentMethod) {
            "Cash" -> max(0.0, PosMath.round2(tendered - payable))
            else -> 0.0
        }

        val sale = SaleRecord(
            receiptNo = receiptNo,
            dateIso = nowIso,
            dateFormatted = PosMath.formatDateTime(nowIso),
            items = saleItems,
            retailSubtotal = totals.retailSubtotal,
            wholesaleSavings = totals.wholesaleSavings,
            seniorDiscount = totals.seniorDiscount,
            grandTotal = payable,
            paymentMethod = paymentMethod,
            tendered = if (paymentMethod == "Cash") tendered else payable,
            change = change,
            refNo = refNo?.trim()?.takeIf { it.isNotEmpty() },
            splitDetails = if (paymentMethod == "Split") SplitDetails(splitCash, splitDigital, splitMethod) else null,
            seniorId = if (totals.isSeniorPwd) st.seniorId.trim().takeIf { it.isNotEmpty() } else null,
            seniorBase = if (totals.isSeniorPwd) totals.seniorBase else null,
            seniorCapped = if (totals.isSeniorPwd) totals.seniorCapped else null,
            customerId = suki?.id,
            customerName = suki?.name,
            pointsEarned = earnedPoints.takeIf { it > 0 },
            pointsRedeemed = usedPoints.takeIf { it > 0 },
            pointsDiscount = pointsDiscount.takeIf { it > 0.0 },
            utangDueDate = utangDueDate?.takeIf { paymentMethod == "Utang" && it.isNotBlank() },
            cashierName = st.activeShift?.cashierName,
            shiftId = st.activeShift?.shiftId
        )

        val qtyByPid = st.cart.associate { it.productId to it.qty }
        val nextProducts = st.products.map { p ->
            val sold = qtyByPid[p.id] ?: 0.0
            if (sold > 0.0) p.copy(stock = max(0.0, PosMath.round3(p.stock - sold)), updatedAt = nowIso) else p
        }
        val nextSales = listOf(sale) + st.sales

        repo.saveProducts(nextProducts)
        repo.saveSales(nextSales)
        repo.saveSukiCustomers(nextCustomers)
        repo.saveUtangTx(nextUtang)

        _state.update {
            it.copy(
                products = nextProducts,
                sales = nextSales,
                sukiCustomers = nextCustomers,
                utangTransactions = nextUtang,
                cart = emptyList(),
                isSeniorPwd = false,
                seniorId = "",
                checkoutOpen = false,
                receiptModalSale = sale
            )
        }
        toast("Sale completed: $receiptNo")
    }

    // Inventory CRUD & Stock Audit
    fun openProductModal(product: Product? = null, prefillBarcode: String = "") {
        _state.update {
            it.copy(editingProduct = product, productModalOpen = true, productModalScannedBarcode = prefillBarcode)
        }
    }

    fun closeProductModal() = _state.update { it.copy(productModalOpen = false, editingProduct = null, productModalScannedBarcode = "") }

    fun saveProduct(p: Product) {
        val st = _state.value
        val now = Instant.now().toString()
        val withTime = p.copy(updatedAt = now)
        val exists = st.products.any { it.id == withTime.id }
        val next = if (exists) st.products.map { if (it.id == withTime.id) withTime else it } else listOf(withTime) + st.products
        repo.saveProducts(next)
        _state.update { it.copy(products = next, productModalOpen = false, editingProduct = null) }
        toast(if (exists) "Updated ${p.name}" else "Added ${p.name}")
    }

    fun deleteProduct(id: String) {
        val next = _state.value.products.filterNot { it.id == id }
        repo.saveProducts(next)
        _state.update { it.copy(products = next, productModalOpen = false, editingProduct = null) }
        toast("Product deleted")
    }

    fun openStockAdjust(p: Product?) = _state.update { it.copy(stockAdjustProduct = p) }

    fun applyStockAdjustment(productId: String, nextStock: Double, reason: String, note: String) {
        val st = _state.value
        val target = st.productMap[productId] ?: return
        val cleanNext = max(0.0, PosMath.round3(nextStock))
        val delta = PosMath.round3(cleanNext - target.stock)
        val now = Instant.now().toString()
        val nextProducts = st.products.map { if (it.id == productId) it.copy(stock = cleanNext, updatedAt = now) else it }
        val log = StockLogEntry(
            id = "LOG-${System.currentTimeMillis()}",
            dateIso = now,
            productId = target.id,
            productName = target.name,
            delta = delta,
            prevStock = target.stock,
            newStock = cleanNext,
            reason = reason,
            note = note.trim().takeIf { it.isNotEmpty() }
        )
        val nextLogs = (listOf(log) + st.stockLog).take(300)
        repo.saveProducts(nextProducts)
        repo.saveStockLog(nextLogs)
        _state.update { it.copy(products = nextProducts, stockLog = nextLogs, stockAdjustProduct = null) }
        toast("Stock updated for ${target.name}")
    }

    fun setBatchModalOpen(open: Boolean) = _state.update { it.copy(batchModalOpen = open) }
    fun setStockLogModalOpen(open: Boolean) = _state.update { it.copy(stockLogModalOpen = open) }

    fun applyBatchStock(deltas: Map<String, Double>, isCycleCount: Boolean, note: String) {
        val st = _state.value
        val now = Instant.now().toString()
        val logs = mutableListOf<StockLogEntry>()
        val nextProducts = st.products.map { p ->
            val v = deltas[p.id] ?: return@map p
            val newStock = if (isCycleCount) max(0.0, PosMath.round3(v)) else max(0.0, PosMath.round3(p.stock + v))
            val delta = PosMath.round3(newStock - p.stock)
            if (delta != 0.0) {
                logs.add(
                    StockLogEntry(
                        id = "LOG-${System.currentTimeMillis()}-${p.id}",
                        dateIso = now,
                        productId = p.id,
                        productName = p.name,
                        delta = delta,
                        prevStock = p.stock,
                        newStock = newStock,
                        reason = if (isCycleCount) "Cycle Count" else "Batch Receive",
                        note = note.trim().takeIf { it.isNotEmpty() }
                    )
                )
            }
            p.copy(stock = newStock, updatedAt = now)
        }
        val nextLogs = (logs + st.stockLog).take(300)
        repo.saveProducts(nextProducts)
        repo.saveStockLog(nextLogs)
        _state.update { it.copy(products = nextProducts, stockLog = nextLogs, batchModalOpen = false) }
        toast("Batch updated ${logs.size} SKUs")
    }

    // Barcode Scanner
    fun openScanner(target: String = "pos") = _state.update { it.copy(scannerOpen = true, scannerTarget = target) }
    fun closeScanner() = _state.update { it.copy(scannerOpen = false) }
    fun dismissScannedPrompt() = _state.update { it.copy(scannedProductPromptCode = null) }

    fun handleBarcodeDetected(rawCode: String) {
        val clean = rawCode.trim()
        if (clean.isEmpty()) return
        val st = _state.value
        if (st.scannerTarget == "productForm") {
            _state.update { it.copy(scannerOpen = false, productModalScannedBarcode = clean) }
            toast("Barcode captured: $clean")
            return
        }
        val match = st.products.firstOrNull { it.barcode.equals(clean, ignoreCase = true) }
        if (match != null) {
            if (st.scannerTarget == "inventory") {
                _state.update { it.copy(scannerOpen = false, stockSearch = clean, activeTab = TabName.INVENTORY) }
                toast("Found ${match.name}")
            } else {
                addToCart(match, 1.0)
                toast("Added ${match.name}")
            }
        } else {
            _state.update { it.copy(scannerOpen = false, scannedProductPromptCode = clean) }
        }
    }

    // Operations: Suki / Utang / Repack / Shift / Services
    fun addSukiCustomer(name: String, phone: String, address: String, limit: Double) {
        val clean = name.trim()
        if (clean.isEmpty()) return
        val now = Instant.now().toString()
        val c = SukiCustomer(
            id = "suki-${System.currentTimeMillis()}",
            name = clean,
            phone = phone.trim().takeIf { it.isNotEmpty() },
            address = address.trim().takeIf { it.isNotEmpty() },
            creditLimit = limit.coerceAtLeast(0.0),
            createdAt = now,
            updatedAt = now
        )
        val next = listOf(c) + _state.value.sukiCustomers
        repo.saveSukiCustomers(next)
        _state.update { it.copy(sukiCustomers = next) }
        toast("Added Suki: $clean")
    }

    fun recordUtangPayment(customerId: String, amount: Double, method: String, note: String) {
        val st = _state.value
        val c = st.sukiCustomers.firstOrNull { it.id == customerId } ?: return
        when (val res = OpsMath.applyUtangPayment(c, amount, method, note.trim().takeIf { it.isNotEmpty() }, st.activeShift?.cashierName)) {
            is OpsMath.UtangResult.Err -> toast(res.error, ToastType.ERROR)
            is OpsMath.UtangResult.Ok -> {
                val nextCust = st.sukiCustomers.map { if (it.id == c.id) res.customer else it }
                val nextTx = listOf(res.tx) + st.utangTransactions
                repo.saveSukiCustomers(nextCust)
                repo.saveUtangTx(nextTx)
                _state.update { it.copy(sukiCustomers = nextCust, utangTransactions = nextTx) }
                toast("Recorded ${PosMath.formatPeso(res.tx.amount)} payment for ${c.name}")
            }
        }
    }

    fun addRepackRule(name: String, masterId: String, targetId: String, yieldQty: Double) {
        if (masterId == targetId || yieldQty <= 0.0) {
            toast("Select distinct SKUs and yield > 0", ToastType.WARNING)
            return
        }
        val rule = RepackRule(
            id = "rpk-${System.currentTimeMillis()}",
            name = name.trim().ifEmpty { "Bulk → Tingi Repack" },
            masterProductId = masterId,
            targetProductId = targetId,
            yieldQty = yieldQty,
            autoComputeCost = true,
            updatedAt = Instant.now().toString()
        )
        val next = listOf(rule) + _state.value.repackRules
        repo.saveRepackRules(next)
        _state.update { it.copy(repackRules = next) }
        toast("Repack rule saved")
    }

    fun runRepackRule(rule: RepackRule, masterQty: Double) {
        val st = _state.value
        when (val res = OpsMath.executeRepackConversion(st.products, rule, masterQty, st.activeShift?.cashierName)) {
            is OpsMath.RepackResult.Err -> toast(res.error, ToastType.ERROR)
            is OpsMath.RepackResult.Ok -> {
                val nextLogs = (res.stockLogs + st.stockLog).take(300)
                val nextRepackLogs = (listOf(res.repackLog) + st.repackLog).take(150)
                repo.saveProducts(res.nextProducts)
                repo.saveStockLog(nextLogs)
                repo.saveRepackLog(nextRepackLogs)
                _state.update {
                    it.copy(products = res.nextProducts, stockLog = nextLogs, repackLog = nextRepackLogs)
                }
                toast("Unpacked ${PosMath.formatQty(masterQty)} → +${PosMath.formatQty(res.repackLog.targetQtyAdded)}")
            }
        }
    }

    fun recordDrawerEvent(type: String, category: String, amount: Double, note: String) {
        if (amount <= 0.0) return
        val st = _state.value
        val ev = CashDrawerEvent(
            id = "DRW-${System.currentTimeMillis()}",
            dateIso = Instant.now().toString(),
            type = type,
            category = category.ifBlank { type.uppercase() },
            amount = PosMath.round2(amount),
            note = note.trim().takeIf { it.isNotEmpty() },
            cashierName = st.activeShift?.cashierName,
            shiftId = st.activeShift?.shiftId
        )
        val next = (listOf(ev) + st.drawerEvents).take(250)
        repo.saveDrawerEvents(next)
        _state.update { it.copy(drawerEvents = next) }
        toast("Recorded ${PosMath.formatPeso(ev.amount)} ($type)")
    }

    fun startShift(cashier: CashierAccount, openingFloat: Double) {
        val shift = ActiveShiftState(
            shiftId = "SHIFT-${System.currentTimeMillis()}",
            cashierId = cashier.id,
            cashierName = cashier.name,
            cashierRole = cashier.role,
            openedAt = Instant.now().toString(),
            openingFloat = openingFloat.coerceAtLeast(0.0)
        )
        repo.saveActiveShift(shift)
        _state.update { it.copy(activeShift = shift) }
        if (openingFloat > 0.0) {
            recordDrawerEvent("float", "Opening Float", openingFloat, "Shift opened by ${cashier.name}")
        } else {
            toast("Shift active: ${cashier.name}")
        }
    }

    fun recordDigitalService(kind: String, amount: Double, fee: Double, phone: String, ref: String) {
        if (amount <= 0.0) {
            toast("Amount must be > ₱0.00", ToastType.WARNING)
            return
        }
        val entry = DigitalServiceEntry(
            id = "DIG-${System.currentTimeMillis()}",
            dateIso = Instant.now().toString(),
            kind = kind,
            amount = PosMath.round2(amount),
            fee = PosMath.round2(fee),
            reference = ref.trim().takeIf { it.isNotEmpty() },
            customerPhone = phone.trim().takeIf { it.isNotEmpty() },
            cashierName = _state.value.activeShift?.cashierName
        )
        val next = (listOf(entry) + _state.value.digitalServices).take(250)
        repo.saveDigitalServices(next)
        _state.update { it.copy(digitalServices = next) }
        toast("Logged $kind ${PosMath.formatPeso(entry.amount)} (+${PosMath.formatPeso(entry.fee)} fee)")
    }

    // Sales Void + Z-Read
    fun requestVoidSale(sale: SaleRecord) = _state.update { it.copy(voidSaleTarget = sale) }
    fun closeVoidSale() = _state.update { it.copy(voidSaleTarget = null) }

    fun confirmVoidSale(reason: String) {
        val st = _state.value
        val target = st.voidSaleTarget ?: return
        if (target.voided == true) return
        val now = Instant.now().toString()
        val restoreQty = mutableMapOf<String, Double>()
        for (it in target.items) {
            it.productId?.let { pid -> restoreQty[pid] = (restoreQty[pid] ?: 0.0) + it.qty }
        }
        val nextProducts = st.products.map { p ->
            val add = restoreQty[p.id] ?: 0.0
            if (add > 0.0) p.copy(stock = PosMath.round3(p.stock + add), updatedAt = now) else p
        }
        val nextSales = st.sales.map {
            if (it.receiptNo == target.receiptNo) {
                it.copy(voided = true, voidedAt = now, voidReason = reason.trim().ifEmpty { "Voided by manager" })
            } else it
        }
        val secLog = SecurityManager.appendSecurityEvent(st.securityLog, "SALE_VOIDED", "warning", "Voided ${target.receiptNo}: $reason")
        repo.saveProducts(nextProducts)
        repo.saveSales(nextSales)
        repo.saveSecurityLog(secLog)
        _state.update {
            it.copy(products = nextProducts, sales = nextSales, securityLog = secLog, voidSaleTarget = null, receiptModalSale = null)
        }
        toast("Voided ${target.receiptNo} & restored stock")
    }

    // Settings & Security PIN
    fun updateSettings(mutator: (StoreSettings) -> StoreSettings) {
        val next = mutator(_state.value.settings)
        repo.saveSettings(next)
        _state.update { it.copy(settings = next) }
        toast("Settings saved")
    }

    fun openPinModal(mode: String) = _state.update { it.copy(pinModalMode = mode, pinError = null) }
    fun closePinModal() = _state.update { it.copy(pinModalMode = null, pinError = null, pinBusy = false) }
    fun clearPinError() = _state.update { it.copy(pinError = null) }

    fun setAdminPin(pin: String) {
        if (pin.length < 4) {
            _state.update { it.copy(pinError = "PIN must be 4–8 digits") }
            return
        }
        val st = _state.value
        if (st.pinBusy) return
        _state.update { it.copy(pinBusy = true, pinError = null) }
        viewModelScope.launch {
            val (hash, salt) = withContext(Dispatchers.Default) { SecurityManager.hashPin(pin) }
            val nextSettings = st.settings.copy(
                adminPinHash = hash,
                adminPinSalt = salt,
                adminPinIter = SecurityManager.DEFAULT_PBKDF2_ITER
            )
            val secLog = SecurityManager.appendSecurityEvent(st.securityLog, "PIN_SET", "info", "Manager PIN configured")
            withContext(Dispatchers.IO) {
                repo.saveSettings(nextSettings)
                repo.saveSecurityLog(secLog)
            }
            _state.update {
                it.copy(
                    settings = nextSettings,
                    securityLog = secLog,
                    settingsUnlocked = true,
                    pinModalMode = null,
                    pinBusy = false,
                    pinError = null,
                    pinFailCount = 0,
                    pinLockoutUntilMs = 0L
                )
            }
            toast("Manager PIN saved")
        }
    }

    fun verifyAndUnlock(pin: String, mode: String) {
        val st = _state.value
        if (st.pinBusy) return
        val now = System.currentTimeMillis()
        if (now < st.pinLockoutUntilMs) {
            val secs = ((st.pinLockoutUntilMs - now) / 1000L).coerceAtLeast(1L)
            _state.update { it.copy(pinError = "Too many attempts. Wait ${secs}s.") }
            return
        }
        if (pin.length < 4) {
            _state.update { it.copy(pinError = "Enter at least 4 digits") }
            return
        }

        _state.update { it.copy(pinBusy = true, pinError = null) }
        viewModelScope.launch {
            val ok = withContext(Dispatchers.Default) {
                SecurityManager.verifyPin(pin, st.settings.adminPinHash, st.settings.adminPinSalt, st.settings.adminPinIter)
            }
            if (ok) {
                val ev = if (mode == "unlockTerminal") "POS_UNLOCK" else "SETTINGS_UNLOCK"
                var nextSettings = st.settings
                if (st.settings.adminPinIter != SecurityManager.DEFAULT_PBKDF2_ITER) {
                    val (fastHash, fastSalt) = withContext(Dispatchers.Default) { SecurityManager.hashPin(pin) }
                    nextSettings = st.settings.copy(
                        adminPinHash = fastHash,
                        adminPinSalt = fastSalt,
                        adminPinIter = SecurityManager.DEFAULT_PBKDF2_ITER
                    )
                }
                val secLog = SecurityManager.appendSecurityEvent(st.securityLog, ev, "info", "Unlocked with PIN")
                withContext(Dispatchers.IO) {
                    if (nextSettings != st.settings) repo.saveSettings(nextSettings)
                    repo.saveSecurityLog(secLog)
                }
                _state.update {
                    it.copy(
                        settings = nextSettings,
                        securityLog = secLog,
                        settingsUnlocked = if (mode == "unlockSettings") true else it.settingsUnlocked,
                        terminalLocked = if (mode == "unlockTerminal") false else it.terminalLocked,
                        pinModalMode = null,
                        pinBusy = false,
                        pinError = null,
                        pinFailCount = 0,
                        pinLockoutUntilMs = 0L
                    )
                }
            } else {
                val nextFails = st.pinFailCount + 1
                val lockedOut = nextFails >= 5
                val lockoutMs = if (lockedOut) {
                    System.currentTimeMillis() + (15_000L shl (nextFails - 5).coerceAtMost(3))
                } else 0L
                val evType = if (lockedOut) "PIN_LOCKOUT" else "PIN_FAIL"
                val summary = if (lockedOut) "PIN temporarily locked after $nextFails failed attempts" else "Failed PIN attempt ($nextFails)"
                val secLog = SecurityManager.appendSecurityEvent(st.securityLog, evType, "warning", summary)
                withContext(Dispatchers.IO) { repo.saveSecurityLog(secLog) }
                _state.update {
                    it.copy(
                        securityLog = secLog,
                        pinBusy = false,
                        pinFailCount = nextFails,
                        pinLockoutUntilMs = lockoutMs,
                        pinError = if (lockedOut) "Too many failed attempts. Locked for ${(lockoutMs - System.currentTimeMillis()) / 1000L}s." else "Incorrect PIN (attempt $nextFails)"
                    )
                }
            }
        }
    }

    fun lockTerminalNow() {
        if (!_state.value.pinConfigured) {
            toast("Set a Manager PIN in Settings first", ToastType.WARNING)
            return
        }
        _state.update { it.copy(terminalLocked = true, settingsUnlocked = false, pinError = null) }
    }

    fun lockSettingsNow() {
        _state.update { it.copy(settingsUnlocked = false) }
    }

    fun exportBackupJson(): String {
        val st = _state.value
        val payload = PosBackupPayload(
            exportedAt = Instant.now().toString(),
            settings = st.settings,
            products = st.products,
            sales = st.sales,
            heldOrders = st.heldOrders,
            sukiCustomers = st.sukiCustomers,
            utangTransactions = st.utangTransactions,
            repackRules = st.repackRules,
            drawerEvents = st.drawerEvents,
            digitalServices = st.digitalServices,
            stockLog = st.stockLog
        )
        return repo.json.encodeToString(payload)
    }

    fun factoryResetAll() {
        repo.resetAll()
        val products = repo.loadProducts()
        val sales = repo.loadSales()
        val settings = repo.loadSettings()
        val suki = repo.loadSukiCustomers()
        val rules = repo.loadRepackRules()
        _state.update {
            PosUiState(
                products = products,
                sales = sales,
                settings = settings,
                sukiCustomers = suki,
                repackRules = rules,
                settingsUnlocked = true,
                assistantMessages = it.assistantMessages
            )
        }
        toast("Factory reset complete")
    }

    // Store AI Assistant
    fun setAssistantOpen(open: Boolean) = _state.update { it.copy(assistantOpen = open) }
    fun setAssistantLang(lang: AssistantEngine.Lang) {
        val w = AssistantEngine.welcome(lang)
        _state.update {
            it.copy(
                assistantLang = lang,
                assistantMessages = listOf(AssistantEngine.ChatMessage(System.currentTimeMillis(), false, w.text, emptyList(), w.chips))
            )
        }
    }

    fun askAssistant(query: String) {
        val clean = query.trim()
        if (clean.isEmpty()) return
        val st = _state.value
        val reply = AssistantEngine.ask(clean, st.products, st.sales, st.heldOrders, st.cart, st.settings, st.assistantLang)
        val userMsg = AssistantEngine.ChatMessage(System.currentTimeMillis(), true, clean)
        val botMsg = AssistantEngine.ChatMessage(System.currentTimeMillis() + 1, false, reply.text, reply.metrics, reply.chips)
        _state.update {
            it.copy(assistantLang = reply.lang, assistantMessages = it.assistantMessages + userMsg + botMsg)
        }
    }

    // GitHub App Update Sync
    fun checkForGitHubUpdates(silent: Boolean = false, repoOverride: String? = null) {
        if (_state.value.updateChecking) return
        val rawRepo = (repoOverride ?: _state.value.settings.githubRepo).trim()
            .ifEmpty { BuildConfig.GITHUB_REPO.ifBlank { "Harley0321/eternalblue" } }
        val normalized = GitHubUpdateChecker.normalizeRepoSlug(rawRepo)
        if (normalized != _state.value.settings.githubRepo && normalized.contains('/')) {
            val nextSettings = _state.value.settings.copy(githubRepo = normalized)
            repo.saveSettings(nextSettings)
            _state.update { it.copy(settings = nextSettings) }
        }
        _state.update { it.copy(updateChecking = true) }
        viewModelScope.launch {
            val result = GitHubUpdateChecker.checkLatest(normalized, BuildConfig.VERSION_NAME)
            val checkedAt = PosMath.formatDateTime(Instant.now().toString())
            _state.update {
                it.copy(
                    updateChecking = false,
                    updateInfo = result,
                    updateCheckedAt = checkedAt
                )
            }
            if (result.isNewer) {
                toast("GitHub update available: ${result.tagName}", ToastType.INFO)
            } else if (!silent) {
                val toastType = when (result.status) {
                    GitHubUpdateChecker.SyncStatus.ERROR -> ToastType.ERROR
                    GitHubUpdateChecker.SyncStatus.NO_RELEASE_APK_YET -> ToastType.WARNING
                    else -> ToastType.INFO
                }
                toast(result.message, toastType)
            }
        }
    }

    fun downloadAndInstallGitHubUpdate(context: Context) {
        val st = _state.value
        if (st.apkDownloading) return
        val info = st.updateInfo ?: return
        val apkUrl = info.apkDownloadUrl
        if (apkUrl.isNullOrBlank()) {
            AndroidDeviceBridge.openUrl(context, info.htmlUrl)
            toast("Opening update on GitHub")
            return
        }
        _state.update { it.copy(apkDownloading = true, apkDownloadProgress = 0) }
        viewModelScope.launch {
            val outcome = AndroidDeviceBridge.downloadAndInstallApk(
                context = context,
                apkUrl = apkUrl,
                expectedFileName = info.apkFileName
            ) { pct ->
                _state.update { it.copy(apkDownloadProgress = pct) }
            }
            _state.update { it.copy(apkDownloading = false) }
            when (outcome) {
                is AndroidDeviceBridge.ApkInstallOutcome.InstallerLaunched -> {
                    toast("Update ready — confirm to apply")
                }
                is AndroidDeviceBridge.ApkInstallOutcome.NeedsInstallPermission -> {
                    toast("Allow app updates from this source, then tap Update again", ToastType.WARNING)
                }
                is AndroidDeviceBridge.ApkInstallOutcome.Failed -> {
                    toast("Update failed: ${outcome.reason}", ToastType.ERROR)
                }
            }
        }
    }
}
