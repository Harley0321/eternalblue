package com.example.data

import android.content.Context
import com.example.domain.PosMath
import com.example.model.ActiveShiftState
import com.example.model.CashDrawerEvent
import com.example.model.CashierAccount
import com.example.model.ConfigSnapshot
import com.example.model.DigitalServiceEntry
import com.example.model.HeldOrder
import com.example.model.Product
import com.example.model.RepackLogEntry
import com.example.model.RepackRule
import com.example.model.SaleRecord
import com.example.model.SecurityLogEntry
import com.example.model.StockLogEntry
import com.example.model.StorageBreakdownItem
import com.example.model.StoreSettings
import com.example.model.SukiCustomer
import com.example.model.UtangTransaction
import kotlinx.serialization.KSerializer
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import java.time.Instant
import kotlin.math.max
import kotlin.math.roundToInt

class PosRepository(context: Context) {
    companion object {
        const val KEY_PRODUCTS = "products"
        const val KEY_SALES = "sales"
        const val KEY_HELD = "held"
        const val KEY_SETTINGS = "settings"
        const val KEY_STOCK_LOG = "stock_log"
        const val KEY_CONFIG_HISTORY = "config_history"
        const val KEY_SECURITY_LOG = "security_log"
        const val KEY_CUSTOMERS = "customers"
        const val KEY_UTANG_TX = "utang_tx"
        const val KEY_REPACK_RULES = "repack_rules"
        const val KEY_REPACK_LOG = "repack_log"
        const val KEY_DRAWER_EVENTS = "drawer_events"
        const val KEY_SERVICE_LOGS = "service_logs"
        const val KEY_CASHIERS = "cashiers"
        const val KEY_ACTIVE_SHIFT = "active_shift"
        const val KEY_QUICK_ACTIONS_POS = "qa_dock_pos"

        val json = Json {
            ignoreUnknownKeys = true
            encodeDefaults = true
        }
    }

    private val db = PosDatabaseHelper(context.applicationContext)

    private inline fun <reified T> readList(key: String, serializer: KSerializer<T>): List<T> {
        val raw = db.readString(key) ?: return emptyList()
        return runCatching { json.decodeFromString(ListSerializer(serializer), raw) }.getOrDefault(emptyList())
    }

    private inline fun <reified T> writeList(key: String, list: List<T>, serializer: KSerializer<T>, cap: Int? = null) {
        val trimmed = if (cap != null) list.take(cap) else list
        db.writeString(key, json.encodeToString(ListSerializer(serializer), trimmed))
    }

    fun loadOrSeedProducts(): List<Product> {
        val existing = db.readString(KEY_PRODUCTS)
        if (existing != null) {
            val parsed = runCatching { json.decodeFromString(ListSerializer(Product.serializer()), existing) }.getOrNull()
            if (parsed != null) return parsed
        }
        val seed = PosMath.buildDefaultCatalog()
        saveProducts(seed)
        return seed
    }

    fun saveProducts(products: List<Product>) = writeList(KEY_PRODUCTS, products, Product.serializer())

    fun loadSales(): List<SaleRecord> = readList(KEY_SALES, SaleRecord.serializer())
    fun saveSales(sales: List<SaleRecord>) = writeList(KEY_SALES, sales, SaleRecord.serializer())

    fun loadHeldOrders(): List<HeldOrder> = readList(KEY_HELD, HeldOrder.serializer())
    fun saveHeldOrders(held: List<HeldOrder>) = writeList(KEY_HELD, held, HeldOrder.serializer())

    fun loadSettings(): StoreSettings {
        val raw = db.readString(KEY_SETTINGS) ?: return StoreSettings().also { saveSettings(it) }
        val loaded = runCatching { json.decodeFromString(StoreSettings.serializer(), raw) }.getOrDefault(StoreSettings())
        return loaded.copy(
            lowStockThreshold = loaded.lowStockThreshold.coerceAtLeast(0.0),
            expiryWarnDays = loaded.expiryWarnDays.coerceAtLeast(1),
            reorderLeadDays = loaded.reorderLeadDays.coerceAtLeast(0),
            reorderSafetyDays = loaded.reorderSafetyDays.coerceAtLeast(0),
            scDiscountCap = loaded.scDiscountCap.coerceAtLeast(0.0),
            zCount = loaded.zCount.coerceAtLeast(0)
        )
    }

    fun saveSettings(settings: StoreSettings) {
        db.writeString(KEY_SETTINGS, json.encodeToString(StoreSettings.serializer(), settings))
    }

    fun loadStockLog(): List<StockLogEntry> = readList(KEY_STOCK_LOG, StockLogEntry.serializer())
    fun saveStockLog(entries: List<StockLogEntry>) = writeList(KEY_STOCK_LOG, entries, StockLogEntry.serializer(), 500)

    fun loadConfigHistory(): List<ConfigSnapshot> = readList(KEY_CONFIG_HISTORY, ConfigSnapshot.serializer())
    fun saveConfigHistory(history: List<ConfigSnapshot>) = writeList(KEY_CONFIG_HISTORY, history, ConfigSnapshot.serializer(), 30)

    fun loadSecurityLog(): List<SecurityLogEntry> = readList(KEY_SECURITY_LOG, SecurityLogEntry.serializer())
    fun saveSecurityLog(entries: List<SecurityLogEntry>) = writeList(KEY_SECURITY_LOG, entries, SecurityLogEntry.serializer(), 250)

    fun loadCustomers(): List<SukiCustomer> = readList(KEY_CUSTOMERS, SukiCustomer.serializer())
    fun saveCustomers(customers: List<SukiCustomer>) = writeList(KEY_CUSTOMERS, customers, SukiCustomer.serializer())

    fun loadUtangTx(): List<UtangTransaction> = readList(KEY_UTANG_TX, UtangTransaction.serializer())
    fun saveUtangTx(txs: List<UtangTransaction>) = writeList(KEY_UTANG_TX, txs, UtangTransaction.serializer(), 600)

    fun loadRepackRules(): List<RepackRule> = readList(KEY_REPACK_RULES, RepackRule.serializer())
    fun saveRepackRules(rules: List<RepackRule>) = writeList(KEY_REPACK_RULES, rules, RepackRule.serializer())

    fun loadRepackLogs(): List<RepackLogEntry> = readList(KEY_REPACK_LOG, RepackLogEntry.serializer())
    fun saveRepackLogs(logs: List<RepackLogEntry>) = writeList(KEY_REPACK_LOG, logs, RepackLogEntry.serializer(), 300)

    fun loadDrawerEvents(): List<CashDrawerEvent> = readList(KEY_DRAWER_EVENTS, CashDrawerEvent.serializer())
    fun saveDrawerEvents(events: List<CashDrawerEvent>) = writeList(KEY_DRAWER_EVENTS, events, CashDrawerEvent.serializer(), 400)

    fun loadServiceLogs(): List<DigitalServiceEntry> = readList(KEY_SERVICE_LOGS, DigitalServiceEntry.serializer())
    fun saveServiceLogs(entries: List<DigitalServiceEntry>) = writeList(KEY_SERVICE_LOGS, entries, DigitalServiceEntry.serializer(), 400)

    fun buildDefaultCashiers(): List<CashierAccount> = listOf(
        CashierAccount(
            id = "CSH-OWNER",
            name = "Store Owner",
            role = "manager",
            active = true,
            createdAt = Instant.now().toString()
        )
    )

    fun loadCashiers(): List<CashierAccount> {
        val list = readList(KEY_CASHIERS, CashierAccount.serializer())
        return if (list.isEmpty()) buildDefaultCashiers().also { saveCashiers(it) } else list
    }

    fun saveCashiers(cashiers: List<CashierAccount>) = writeList(KEY_CASHIERS, cashiers, CashierAccount.serializer())

    fun loadActiveShift(): ActiveShiftState? {
        val raw = db.readString(KEY_ACTIVE_SHIFT) ?: return null
        if (raw.isBlank() || raw == "null") return null
        return runCatching { json.decodeFromString(ActiveShiftState.serializer(), raw) }.getOrNull()
    }

    fun saveActiveShift(shift: ActiveShiftState?) {
        if (shift == null) db.writeString(KEY_ACTIVE_SHIFT, "null")
        else db.writeString(KEY_ACTIVE_SHIFT, json.encodeToString(ActiveShiftState.serializer(), shift))
    }

    fun getStorageBreakdown(): Pair<Long, List<StorageBreakdownItem>> {
        val sizes = db.getAllSizesBytes()
        val labelMap = mapOf(
            KEY_PRODUCTS to "Inventory Catalog",
            KEY_SALES to "Sales & Receipts",
            KEY_SETTINGS to "Store Settings & QR",
            KEY_STOCK_LOG to "Stock Movement Audit",
            KEY_CUSTOMERS to "Suki & Utang Ledger",
            KEY_UTANG_TX to "Utang Transactions",
            KEY_SECURITY_LOG to "Security Audit Chain",
            KEY_CONFIG_HISTORY to "Config Checkpoints",
            KEY_HELD to "Parked / Held Orders"
        )
        val total = max(1L, sizes.values.sum())
        val items = labelMap.mapNotNull { (k, label) ->
            val b = sizes[k] ?: 0L
            if (b > 0L) StorageBreakdownItem(k, label, b, ((b * 100.0) / total).roundToInt()) else null
        }.sortedByDescending { it.bytes }
        return sizes.values.sum() to items
    }
}
