package com.example.data

import android.content.Context
import com.example.domain.PosMath
import com.example.model.ActiveCartSnapshot
import com.example.model.ActiveShiftState
import com.example.model.CashDrawerEvent
import com.example.model.CashierAccount
import com.example.model.DigitalServiceEntry
import com.example.model.HeldOrder
import com.example.model.Product
import com.example.model.RepackLogEntry
import com.example.model.RepackRule
import com.example.model.SaleItem
import com.example.model.SaleRecord
import com.example.model.SecurityLogEntry
import com.example.model.StockLogEntry
import com.example.model.StoreSettings
import com.example.model.SukiCustomer
import com.example.model.UtangTransaction
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.decodeFromJsonElement
import java.time.Instant
import java.time.LocalDate

class PosRepository(context: Context) {
    private val appCtx = context.applicationContext
    private val db = PosDatabaseHelper(appCtx)
    private val identityPrefs = appCtx.getSharedPreferences("eternalblue_store_identity", Context.MODE_PRIVATE)
    val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        isLenient = true
        coerceInputValues = true
    }

    private inline fun <reified T> loadListResilient(
        key: String,
        noinline seedProvider: (() -> List<T>)? = null
    ): List<T> {
        val raw = db.getString(key)
        if (raw.isNullOrBlank()) {
            val prevRaw = db.getString("${key}__prev")
            if (!prevRaw.isNullOrBlank()) {
                val fromPrev = runCatching { json.decodeFromString<List<T>>(prevRaw) }.getOrNull()
                if (fromPrev != null) return fromPrev
            }
            if (seedProvider != null) {
                val seed = seedProvider()
                db.putString(key, json.encodeToString(seed))
                return seed
            }
            return emptyList()
        }

        runCatching { json.decodeFromString<List<T>>(raw) }.getOrNull()?.let { return it }

        // Preserve any raw unreadable payload before attempting shadow or per-element recovery
        db.putString("${key}__corrupt_backup", raw)

        val prevRaw = db.getString("${key}__prev")
        if (!prevRaw.isNullOrBlank()) {
            runCatching { json.decodeFromString<List<T>>(prevRaw) }.getOrNull()?.let { return it }
        }

        val partial = runCatching {
            val elem = json.parseToJsonElement(raw)
            if (elem is JsonArray) {
                elem.mapNotNull { item -> runCatching { json.decodeFromJsonElement<T>(item) }.getOrNull() }
            } else emptyList()
        }.getOrNull()
        if (!partial.isNullOrEmpty()) return partial

        return seedProvider?.invoke() ?: emptyList()
    }

    fun loadProducts(): List<Product> = loadListResilient("products") { seedProducts() }

    fun saveProducts(list: List<Product>) = db.putString("products", json.encodeToString(list))

    fun loadSales(): List<SaleRecord> = loadListResilient("sales") { seedSales() }

    fun saveSales(list: List<SaleRecord>) = db.putString("sales", json.encodeToString(list))

    fun loadHeldOrders(): List<HeldOrder> = loadListResilient("held")

    fun saveHeldOrders(list: List<HeldOrder>) = db.putString("held", json.encodeToString(list))

    fun loadActiveCart(): ActiveCartSnapshot {
        val raw = db.getString("active_cart") ?: return ActiveCartSnapshot()
        return runCatching { json.decodeFromString<ActiveCartSnapshot>(raw) }.getOrElse {
            db.getString("active_cart__prev")?.let { prev ->
                runCatching { json.decodeFromString<ActiveCartSnapshot>(prev) }.getOrNull()
            } ?: ActiveCartSnapshot()
        }
    }

    fun saveActiveCart(snapshot: ActiveCartSnapshot) = db.putString("active_cart", json.encodeToString(snapshot))

    fun loadPinnedStoreName(): String? =
        identityPrefs.getString("pinned_store_name", null)?.trim()?.takeIf { it.isNotEmpty() }

    fun savePinnedStoreName(name: String) {
        val clean = name.trim()
        if (clean.isNotEmpty()) {
            identityPrefs.edit().putString("pinned_store_name", clean).apply()
        }
    }

    fun loadSettings(): StoreSettings {
        val pinned = loadPinnedStoreName()
        val raw = db.getString("settings")
        val decoded = raw?.let { runCatching { json.decodeFromString<StoreSettings>(it) }.getOrNull() }
            ?: db.getString("settings__prev")?.let { prev ->
                runCatching { json.decodeFromString<StoreSettings>(prev) }.getOrNull()
            }
        return when {
            decoded != null -> {
                val safeName = decoded.storeName.trim().ifEmpty { pinned ?: "EternalBlue Mart" }
                if (pinned == null && safeName != "EternalBlue Mart") savePinnedStoreName(safeName)
                if (safeName != decoded.storeName) decoded.copy(storeName = safeName) else decoded
            }
            pinned != null -> StoreSettings(storeName = pinned)
            else -> StoreSettings()
        }
    }

    fun saveSettings(s: StoreSettings) {
        val safeName = s.storeName.trim().ifEmpty { loadPinnedStoreName() ?: "EternalBlue Mart" }
        val normalized = if (safeName != s.storeName) s.copy(storeName = safeName) else s
        savePinnedStoreName(safeName)
        db.putString("settings", json.encodeToString(normalized))
    }

    fun loadSukiCustomers(): List<SukiCustomer> = loadListResilient("suki") { seedCustomers() }

    fun saveSukiCustomers(list: List<SukiCustomer>) = db.putString("suki", json.encodeToString(list))

    fun loadUtangTx(): List<UtangTransaction> = loadListResilient("utang_tx")

    fun saveUtangTx(list: List<UtangTransaction>) = db.putString("utang_tx", json.encodeToString(list))

    fun loadRepackRules(): List<RepackRule> = loadListResilient("repack_rules") { seedRepackRules() }

    fun saveRepackRules(list: List<RepackRule>) = db.putString("repack_rules", json.encodeToString(list))

    fun loadRepackLog(): List<RepackLogEntry> = loadListResilient("repack_log")

    fun saveRepackLog(list: List<RepackLogEntry>) = db.putString("repack_log", json.encodeToString(list))

    fun loadDrawerEvents(): List<CashDrawerEvent> = loadListResilient("drawer_events")

    fun saveDrawerEvents(list: List<CashDrawerEvent>) = db.putString("drawer_events", json.encodeToString(list))

    fun loadDigitalServices(): List<DigitalServiceEntry> = loadListResilient("digital_services")

    fun saveDigitalServices(list: List<DigitalServiceEntry>) = db.putString("digital_services", json.encodeToString(list))

    fun loadCashiers(): List<CashierAccount> = loadListResilient("cashiers") {
        val now = Instant.now().toString()
        listOf(
            CashierAccount("cashier-owner", "Ate Maria (Owner)", "manager", true, now),
            CashierAccount("cashier-shift1", "Juan (Cashier)", "cashier", true, now)
        )
    }

    fun saveCashiers(list: List<CashierAccount>) = db.putString("cashiers", json.encodeToString(list))

    fun loadActiveShift(): ActiveShiftState? {
        val raw = db.getString("active_shift")?.takeIf { it.isNotBlank() }
        return raw?.let { runCatching { json.decodeFromString<ActiveShiftState>(it) }.getOrNull() }
            ?: db.getString("active_shift__prev")?.takeIf { it.isNotBlank() }?.let { prev ->
                runCatching { json.decodeFromString<ActiveShiftState>(prev) }.getOrNull()
            }
    }

    fun saveActiveShift(shift: ActiveShiftState?) {
        if (shift == null) db.putString("active_shift", "")
        else db.putString("active_shift", json.encodeToString(shift))
    }

    fun loadStockLog(): List<StockLogEntry> = loadListResilient("stock_log")

    fun saveStockLog(list: List<StockLogEntry>) = db.putString("stock_log", json.encodeToString(list))

    fun loadSecurityLog(): List<SecurityLogEntry> = loadListResilient("security_log")

    fun saveSecurityLog(list: List<SecurityLogEntry>) = db.putString("security_log", json.encodeToString(list))

    fun loadPinLockState(): Pair<Int, Long> {
        val raw = db.getString("pin_lock_state") ?: return 0 to 0L
        val parts = raw.split('|')
        val fails = parts.getOrNull(0)?.toIntOrNull()?.coerceAtLeast(0) ?: 0
        val until = parts.getOrNull(1)?.toLongOrNull()?.coerceAtLeast(0L) ?: 0L
        return fails to until
    }

    fun savePinLockState(fails: Int, untilMs: Long) = db.putString("pin_lock_state", "$fails|$untilMs")

    fun resetAll() = db.clearAll()

    companion object {
        fun seedProducts(): List<Product> {
            val soon = LocalDate.now().plusDays(14).toString()
            val okDate = LocalDate.now().plusMonths(6).toString()
            return listOf(
                Product("p-rice-50", "4800010000011", "Sinandomeng Rice 25kg Sack", "Rice & Staples", "sack", 1125.0, 1250.0, 1210.0, 3.0, 8.0, 3.0, okDate, true),
                Product("p-rice-1", "4800010000028", "Sinandomeng Rice 1kg Repack", "Rice & Staples", "kg", 45.0, 54.0, 51.0, 10.0, 42.0, 15.0, okDate, true),
                Product("p-corned", "4800010000035", "Argentina Corned Beef 175g", "Canned & Noodles", "can", 33.5, 42.0, 39.5, 12.0, 36.0, 12.0, okDate, true),
                Product("p-sardines", "4800010000042", "555 Sardines Tomato 155g", "Canned & Noodles", "can", 21.0, 27.0, 25.5, 12.0, 48.0, 12.0, okDate, true),
                Product("p-canton", "4800010000059", "Lucky Me Pancit Canton Chilimansi", "Canned & Noodles", "pack", 12.5, 16.0, 15.0, 12.0, 64.0, 20.0, okDate, true),
                Product("p-kopiko", "4800010000066", "Kopiko Black 3-in-1 Twin Pack", "Beverages", "pack", 11.0, 15.0, 13.75, 10.0, 55.0, 15.0, okDate, true),
                Product("p-milo", "4800010000073", "Milo Active-Go 24g Sachet", "Beverages", "sachet", 8.5, 12.0, 11.0, 12.0, 72.0, 24.0, okDate, true),
                Product("p-oil", "4800010000080", "Golden Fiesta Palm Oil 1L", "Condiments & Cooking", "bottle", 92.0, 112.0, 106.0, 6.0, 18.0, 6.0, okDate, true),
                Product("p-toyo", "4800010000097", "Datu Puti Soy Sauce 385ml", "Condiments & Cooking", "bottle", 23.0, 30.0, 28.0, 12.0, 24.0, 8.0, okDate, true),
                Product("p-eggs", "4800010000103", "Fresh Farm Eggs Medium (Tray 30s)", "Dairy & Bakery", "tray", 205.0, 240.0, 230.0, 3.0, 6.0, 3.0, soon, true),
                Product("p-cola", "4800010000110", "Coca-Cola Kasalo 1.5L", "Beverages", "bottle", 58.0, 72.0, 67.0, 12.0, 22.0, 8.0, okDate, false),
                Product("p-water", "4800010000127", "Absolute Mineral Water 500ml", "Beverages", "bottle", 10.5, 15.0, 13.5, 24.0, 40.0, 12.0, okDate, true),
                Product("p-chips", "4800010000134", "Piattos Cheese 85g", "Snacks & Biscuits", "pack", 30.0, 39.0, 36.5, 10.0, 9.0, 10.0, okDate, false),
                Product("p-soap", "4800010000141", "Safeguard Pure White 130g", "Personal & Home", "bar", 42.0, 52.0, 49.0, 12.0, 16.0, 6.0, okDate, true),
                Product("p-ariel", "4800010000158", "Ariel Sunrise Fresh 75g Twin", "Personal & Home", "sachet", 13.0, 17.0, 15.75, 12.0, 0.0, 12.0, okDate, true),
                Product("p-tocino", "4800010000165", "CDO Funtastyk Young Pork Tocino 450g", "Frozen Meat", "pack", 118.0, 145.0, 138.0, 5.0, 14.0, 5.0, soon, true)
            )
        }

        fun seedSales(): List<SaleRecord> {
            val now = Instant.now()
            val yday = now.minusSeconds(PosMath.DAY_MS / 1000)
            return listOf(
                SaleRecord(
                    receiptNo = "OR-001001",
                    dateIso = now.minusSeconds(3600).toString(),
                    dateFormatted = PosMath.formatDateTime(now.minusSeconds(3600).toString()),
                    items = listOf(
                        SaleItem("p-rice-1", "Rice & Staples", "Sinandomeng Rice 1kg Repack", 3.0, "kg", 54.0, capital = 45.0, lineTotal = 162.0),
                        SaleItem("p-corned", "Canned & Noodles", "Argentina Corned Beef 175g", 2.0, "can", 42.0, capital = 33.5, lineTotal = 84.0)
                    ),
                    retailSubtotal = 246.0,
                    wholesaleSavings = 0.0,
                    seniorDiscount = 0.0,
                    grandTotal = 246.0,
                    paymentMethod = "Cash",
                    tendered = 300.0,
                    change = 54.0,
                    cashierName = "Ate Maria (Owner)"
                ),
                SaleRecord(
                    receiptNo = "OR-001000",
                    dateIso = yday.toString(),
                    dateFormatted = PosMath.formatDateTime(yday.toString()),
                    items = listOf(
                        SaleItem("p-canton", "Canned & Noodles", "Lucky Me Pancit Canton Chilimansi", 6.0, "pack", 16.0, capital = 12.5, lineTotal = 96.0),
                        SaleItem("p-cola", "Beverages", "Coca-Cola Kasalo 1.5L", 1.0, "bottle", 72.0, capital = 58.0, lineTotal = 72.0)
                    ),
                    retailSubtotal = 168.0,
                    wholesaleSavings = 0.0,
                    seniorDiscount = 0.0,
                    grandTotal = 168.0,
                    paymentMethod = "GCash",
                    tendered = 168.0,
                    change = 0.0,
                    refNo = "GC-884120",
                    cashierName = "Juan (Cashier)"
                )
            )
        }

        fun seedCustomers(): List<SukiCustomer> {
            val now = Instant.now().toString()
            val due = LocalDate.now().plusDays(5).toString()
            return listOf(
                SukiCustomer("suki-1", "Aling Nena Reyes", "0917-555-0142", "Brgy. Poblacion", 2500.0, 420.0, due, 48, 4820.0, now, now),
                SukiCustomer("suki-2", "Mang Tonyo Cruz", "0918-555-0199", "Sitio Mabini", 1500.0, 0.0, null, 115, 7250.0, now, now)
            )
        }

        fun seedRepackRules(): List<RepackRule> {
            val now = Instant.now().toString()
            return listOf(
                RepackRule("rpk-rice", "25kg Sack → 25× 1kg Repack", "p-rice-50", "p-rice-1", 25.0, true, now)
            )
        }
    }
}
