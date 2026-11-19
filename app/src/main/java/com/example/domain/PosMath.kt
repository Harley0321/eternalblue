package com.example.domain

import com.example.model.CartLine
import com.example.model.CartTotals
import com.example.model.PriceType
import com.example.model.Product
import com.example.model.SaleRecord
import com.example.model.StoreSettings
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.roundToLong

object PosMath {
    const val APP_VERSION = "2.3.0"
    const val DAY_MS = 86_400_000L

    val BASE_CATEGORIES = listOf(
        "Frozen Meat",
        "Rice & Staples",
        "Canned & Noodles",
        "Beverages",
        "Dairy & Bakery",
        "Condiments & Cooking",
        "Snacks & Biscuits",
        "Personal & Home"
    )

    val PH_DENOMINATIONS = listOf(1000.0, 500.0, 200.0, 100.0, 50.0, 20.0, 10.0, 5.0, 1.0, 0.25)

    fun toCents(n: Double?): Long {
        if (n == null || !n.isFinite()) return 0L
        return (n * 100.0).roundToLong()
    }

    fun fromCents(c: Long): Double = c / 100.0

    fun round2(n: Double?): Double = fromCents(toCents(n))

    fun round3(n: Double?): Double {
        if (n == null || !n.isFinite()) return 0.0
        return (n * 1000.0).roundToLong() / 1000.0
    }

    fun lineCents(unitPrice: Double, qty: Double): Long {
        val qMilli = if (qty.isFinite()) (qty * 1000.0).roundToLong() else 0L
        val unitC = toCents(unitPrice)
        return ((unitC * qMilli) / 1000.0).roundToLong()
    }

    fun lineTotalPeso(unitPrice: Double, qty: Double): Double = fromCents(lineCents(unitPrice, qty))

    fun formatPeso(amount: Double?): String {
        val clean = if (amount != null && amount.isFinite()) amount else 0.0
        return String.format(Locale.US, "₱%,.2f", clean)
    }

    fun formatQty(qty: Double?, unit: String = ""): String {
        val clean = round3(qty ?: 0.0)
        val txt = if (clean % 1.0 == 0.0) clean.roundToInt().toString() else clean.toString()
        return if (unit.isNotBlank()) "$txt $unit" else txt
    }

    enum class WholesaleBlockReason { NONE, COST, QTY }

    fun wholesaleBlock(item: CartLine, productMap: Map<String, Product>): WholesaleBlockReason? {
        val p = productMap[item.productId]
        val retail = p?.retailPrice ?: item.retailPrice
        val wholesale = p?.wholesalePrice ?: item.wholesalePrice
        val capital = p?.capital ?: 0.0
        val minQty = (p?.wholesaleMinQty ?: item.wholesaleMinQty).let { if (it > 0.0) it else 10.0 }
        if (wholesale <= 0.0 || wholesale >= retail) return WholesaleBlockReason.NONE
        if (capital > 0.0 && wholesale < capital) return WholesaleBlockReason.COST
        if (item.qty + 1e-9 < minQty) return WholesaleBlockReason.QTY
        return null
    }

    fun isWholesaleLine(item: CartLine, productMap: Map<String, Product>): Boolean =
        item.priceType == PriceType.wholesale && wholesaleBlock(item, productMap) == null

    fun getLinePrice(item: CartLine, productMap: Map<String, Product>): Double {
        val p = productMap[item.productId]
        val retail = p?.retailPrice ?: item.retailPrice
        val wholesale = p?.wholesalePrice ?: item.wholesalePrice
        return round2(if (isWholesaleLine(item, productMap)) wholesale else retail)
    }

    private val SC_EXCLUDE = Regex(
        "\\b(chips|crisps|candy|candies|chocolate|biscuit|biscuits|cracker|crackers|cookie|cookies|wafer|cola|coke|sprite|pepsi|soda|juice|energy|beer|wine|gin|rum|whisky|whiskey|vodka|brandy|cigarette|cigarettes|tobacco|shampoo|conditioner|lotion|toothpaste|ice cream|cake|pastry|baby oil)\\b",
        RegexOption.IGNORE_CASE
    )

    private val SC_NAME_YES = Regex(
        "\\b(rice|bigas|sugar|asukal|salt|asin|cooking oil|egg|eggs|itlog|milk|gatas|coffee|kape|nescafe|kopiko|bread|pandesal|noodle|noodles|pancit|sardine|sardines|tuna|corned|luncheon|hotdog|tocino|longganisa|chicken|manok|pork|baboy|beef|meat|fish|isda|bangus|tilapia|galunggong|vegetable|vegetables|gulay|onion|sibuyas|garlic|bawang|flour|vinegar|suka|soy sauce|toyo|patis|detergent|laundry|soap|sabon|candle|candles|kandila|bottled water|mineral water|corn|mais)\\b",
        RegexOption.IGNORE_CASE
    )

    private val SC_CAT_YES = Regex("(meat|rice|staple|fish|seafood|egg|vegetable|fruit|noodle|canned)", RegexOption.IGNORE_CASE)

    fun scSuggest(name: String?, category: String?): Boolean {
        val n = name ?: ""
        val c = category ?: ""
        if (SC_EXCLUDE.containsMatchIn(n)) return false
        return SC_NAME_YES.containsMatchIn(n) || SC_CAT_YES.containsMatchIn(c)
    }

    fun scEligibleProduct(p: Product?): Boolean {
        if (p == null) return false
        return p.scEligible ?: scSuggest(p.name, p.category)
    }

    fun computeCartTotals(
        cart: List<CartLine>,
        productMap: Map<String, Product>,
        isSeniorPwd: Boolean,
        settings: StoreSettings
    ): CartTotals {
        var retailC = 0L
        var savingsC = 0L
        var eligC = 0L
        var eligKinds = 0
        var otherLines = 0

        for (item in cart) {
            val p = productMap[item.productId]
            val retail = p?.retailPrice ?: item.retailPrice
            val lineRetailC = lineCents(retail, item.qty)
            val lineEffC = lineCents(getLinePrice(item, productMap), item.qty)
            val lineSavingC = max(0L, lineRetailC - lineEffC)
            retailC += lineRetailC
            savingsC += lineSavingC
            if (isSeniorPwd) {
                val eligible = if (p != null) scEligibleProduct(p) else scSuggest(item.name, null)
                if (eligible) {
                    eligC += (lineRetailC - lineSavingC)
                    eligKinds++
                } else {
                    otherLines++
                }
            }
        }

        val netC = retailC - savingsC
        val rawSeniorC = if (isSeniorPwd) ((eligC * 5.0) / 100.0).roundToLong() else 0L
        val capC = toCents(if (settings.scDiscountCap > 0.0) settings.scDiscountCap else 125.0)
        val seniorC = min(rawSeniorC, capC)
        val grandC = max(0L, netC - seniorC)

        return CartTotals(
            retailSubtotal = fromCents(retailC),
            wholesaleSavings = fromCents(savingsC),
            seniorDiscount = fromCents(seniorC),
            grandTotal = fromCents(grandC),
            isSeniorPwd = isSeniorPwd,
            seniorBase = fromCents(eligC),
            seniorCapped = rawSeniorC > capC,
            seniorCap = fromCents(capC),
            scKinds = eligKinds,
            scOtherLines = otherLines
        )
    }

    enum class ExpiryState { NONE, EXPIRED, SOON, OK }
    data class ExpiryStatus(val status: ExpiryState, val days: Int?)

    fun expiryInfo(p: Product?, warnDays: Int = 30): ExpiryStatus {
        val raw = p?.expiry?.trim().orEmpty()
        if (raw.isEmpty()) return ExpiryStatus(ExpiryState.NONE, null)
        return try {
            val exp = LocalDate.parse(raw)
            val today = LocalDate.now()
            val days = ChronoUnit.DAYS.between(today, exp).toInt()
            val w = if (warnDays > 0) warnDays else 30
            when {
                days <= 0 -> ExpiryStatus(ExpiryState.EXPIRED, days)
                days <= w -> ExpiryStatus(ExpiryState.SOON, days)
                else -> ExpiryStatus(ExpiryState.OK, days)
            }
        } catch (_: Exception) {
            ExpiryStatus(ExpiryState.NONE, null)
        }
    }

    fun parseIsoMs(iso: String?): Long {
        if (iso.isNullOrBlank()) return 0L
        return try {
            Instant.parse(iso).toEpochMilli()
        } catch (_: Exception) {
            0L
        }
    }

    fun startOfDayMs(ms: Long = System.currentTimeMillis()): Long {
        val z = ZoneId.systemDefault()
        return Instant.ofEpochMilli(ms).atZone(z).toLocalDate().atStartOfDay(z).toInstant().toEpochMilli()
    }

    fun formatDateTime(iso: String?): String {
        val ms = parseIsoMs(iso)
        if (ms <= 0L) return iso.orEmpty()
        val dt = Instant.ofEpochMilli(ms).atZone(ZoneId.systemDefault()).toLocalDateTime()
        return dt.format(DateTimeFormatter.ofPattern("MMM dd, yyyy hh:mm a", Locale.US))
    }

    fun nextReceiptNo(sales: List<SaleRecord>): String {
        var maxNum = 1000
        for (s in sales) {
            val num = s.receiptNo.replace(Regex("[^0-9]"), "").toIntOrNull()
            if (num != null && num > maxNum) maxNum = num
        }
        return String.format(Locale.US, "OR-%06d", maxNum + 1)
    }

    fun generateEan13(): String {
        val base12 = "480" + (1..9).map { (0..9).random() }.joinToString("")
        var sum = 0
        base12.forEachIndexed { idx, ch ->
            val d = ch.digitToInt()
            sum += if (idx % 2 == 0) d else d * 3
        }
        val check = (10 - (sum % 10)) % 10
        return base12 + check
    }

    fun computeProductVelocities(products: List<Product>, sales: List<SaleRecord>, days: Int = 30): Map<String, Double> {
        val cutoff = System.currentTimeMillis() - days * DAY_MS
        val byId = products.associateBy { it.id }
        val unitsSold = mutableMapOf<String, Double>()
        for (s in sales) {
            if (s.voided == true) continue
            if (parseIsoMs(s.dateIso) < cutoff) continue
            for (it in s.items) {
                val id = it.productId?.takeIf { pid -> byId.containsKey(pid) }
                    ?: products.firstOrNull { p -> p.name.equals(it.name, ignoreCase = true) }?.id
                if (id != null) {
                    unitsSold[id] = (unitsSold[id] ?: 0.0) + it.qty
                }
            }
        }
        val div = max(1, days).toDouble()
        return unitsSold.mapValues { (_, qty) -> round3(qty / div) }
    }

    data class SalesStats(
        val revenue: Double,
        val profit: Double,
        val orders: Int,
        val itemsCount: Double,
        val marginPct: Double,
        val avgTicket: Double
    )

    fun computeSalesStats(sales: List<SaleRecord>, fromMs: Long, toMs: Long, productMap: Map<String, Product>): SalesStats {
        var revC = 0L
        var costC = 0L
        var orders = 0
        var qtySum = 0.0

        for (s in sales) {
            if (s.voided == true) continue
            val ms = parseIsoMs(s.dateIso)
            if (ms < fromMs || ms >= toMs) continue
            orders++
            revC += toCents(s.grandTotal)
            for (it in s.items) {
                qtySum += it.qty
                val cap = it.capital ?: it.productId?.let { productMap[it]?.capital } ?: 0.0
                if (cap > 0.0) costC += lineCents(cap, it.qty)
            }
        }
        val rev = fromCents(revC)
        val profit = fromCents(revC - costC)
        val margin = if (rev > 0.0) round2((profit / rev) * 100.0) else 0.0
        val avg = if (orders > 0) round2(rev / orders) else 0.0
        return SalesStats(rev, profit, orders, round3(qtySum), margin, avg)
    }

    data class StockHealthSummary(
        val totalSkus: Int,
        val lowCount: Int,
        val outCount: Int,
        val fastLowCount: Int,
        val deadCount: Int,
        val expiredCount: Int,
        val soonCount: Int,
        val noCapCount: Int,
        val lossCount: Int,
        val retailValue: Double,
        val costValue: Double
    )

    fun computeStockHealthSummary(
        products: List<Product>,
        sales: List<SaleRecord>,
        settings: StoreSettings
    ): StockHealthSummary {
        val vel = computeProductVelocities(products, sales, 30)
        var low = 0; var out = 0; var fastLow = 0; var dead = 0
        var exp = 0; var soon = 0; var noCap = 0; var loss = 0
        var retailValC = 0L; var costValC = 0L

        for (p in products) {
            val stock = max(0.0, p.stock)
            retailValC += lineCents(p.retailPrice, stock)
            val cap = p.capital ?: 0.0
            if (cap > 0.0) {
                costValC += lineCents(cap, stock)
                if (p.retailPrice < cap) loss++
            } else {
                noCap++
            }
            if (StockAlerts.isOutOfStock(p)) out++
            else if (StockAlerts.isLowStock(p, settings)) low++

            val v = vel[p.id] ?: 0.0
            if (v <= 0.0 && stock > 0.0) dead++
            if (v > 0.0 && stock > 0.0 && (stock / v) <= (settings.reorderLeadDays + settings.reorderSafetyDays)) {
                fastLow++
            }
            val e = expiryInfo(p, settings.expiryWarnDays)
            if (e.status == ExpiryState.EXPIRED) exp++
            else if (e.status == ExpiryState.SOON) soon++
        }
        return StockHealthSummary(
            totalSkus = products.size,
            lowCount = low,
            outCount = out,
            fastLowCount = fastLow,
            deadCount = dead,
            expiredCount = exp,
            soonCount = soon,
            noCapCount = noCap,
            lossCount = loss,
            retailValue = fromCents(retailValC),
            costValue = fromCents(costValC)
        )
    }

    fun isWholeSaleNearThreshold(item: CartLine, productMap: Map<String, Product>): Double? {
        val p = productMap[item.productId] ?: return null
        if (p.wholesalePrice <= 0.0 || p.wholesalePrice >= p.retailPrice) return null
        if (p.capital != null && p.capital > 0.0 && p.wholesalePrice < p.capital) return null
        val diff = p.wholesaleMinQty - item.qty
        return if (diff > 0.0 && diff <= max(2.0, abs(p.wholesaleMinQty) * 0.4)) round3(diff) else null
    }
}
