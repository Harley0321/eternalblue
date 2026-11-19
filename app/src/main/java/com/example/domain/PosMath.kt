package com.example.domain

import com.example.model.CartLine
import com.example.model.CartTotals
import com.example.model.ConfigSnapshotData
import com.example.model.PriceType
import com.example.model.Product
import com.example.model.SaleItem
import com.example.model.SaleRecord
import com.example.model.StockLogEntry
import com.example.model.StoreSettings
import java.text.NumberFormat
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.roundToLong

object PosMath {

    const val APP_VERSION = "2.3.0"
    const val DEFAULT_STORE_NAME = "EternalBlue Mart"
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

    private val pesoFormat: NumberFormat by lazy {
        NumberFormat.getNumberInstance(Locale("en", "PH")).apply {
            minimumFractionDigits = 2
            maximumFractionDigits = 2
        }
    }

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

    fun <T> sumPeso(list: List<T>, pick: (T) -> Double): Double {
        var c = 0L
        for (item in list) {
            c += toCents(pick(item))
        }
        return fromCents(c)
    }

    fun formatPeso(amount: Double?): String {
        val num = if (amount != null && amount.isFinite()) amount else 0.0
        return "₱" + pesoFormat.format(num)
    }

    fun formatQty(q: Double?, unit: String = ""): String {
        val clean = round3(q ?: 0.0)
        val txt = if (clean % 1.0 == 0.0) clean.toLong().toString() else clean.toString()
        return if (unit.isNotEmpty()) "$txt $unit" else txt
    }

    data class LinePricingInfo(
        val retail: Double,
        val wholesale: Double,
        val capital: Double,
        val minQty: Int
    )

    fun buildProductMap(products: List<Product>): Map<String, Product> = products.associateBy { it.id }

    fun linePricing(item: CartLine, productMap: Map<String, Product>): LinePricingInfo {
        val p = productMap[item.productId]
        val minQty = (p?.wholesaleMinQty ?: item.wholesaleMinQty).let { if (it > 0) it else 10 }
        return LinePricingInfo(
            retail = p?.retailPrice ?: item.retailPrice,
            wholesale = p?.wholesalePrice ?: item.wholesalePrice,
            capital = p?.capital?.takeIf { it > 0.0 } ?: 0.0,
            minQty = minQty
        )
    }

    enum class WholesaleBlockReason {
        NONE,
        COST,
        QTY
    }

    fun wholesaleBlock(item: CartLine, productMap: Map<String, Product>): WholesaleBlockReason? {
        val pr = linePricing(item, productMap)
        if (!(pr.wholesale > 0.0) || !(pr.wholesale < pr.retail)) return WholesaleBlockReason.NONE
        if (pr.capital > 0.0 && pr.wholesale < pr.capital) return WholesaleBlockReason.COST
        if (item.qty + 1e-9 < pr.minQty) return WholesaleBlockReason.QTY
        return null
    }

    fun isWholesaleLine(item: CartLine, productMap: Map<String, Product>): Boolean {
        return item.priceType == PriceType.wholesale && wholesaleBlock(item, productMap) == null
    }

    fun getLinePrice(item: CartLine, productMap: Map<String, Product>): Double {
        val pr = linePricing(item, productMap)
        return round2(if (isWholesaleLine(item, productMap)) pr.wholesale else pr.retail)
    }

    private val SC_EXCLUDE = Regex(
        """\b(chips|crisps|candy|candies|chocolate|biscuit|biscuits|cracker|crackers|cookie|cookies|wafer|cola|coke|sprite|pepsi|soda|juice|energy|beer|wine|gin|rum|whisky|whiskey|vodka|brandy|cigarette|cigarettes|tobacco|shampoo|conditioner|lotion|toothpaste|ice cream|cake|pastry|baby oil)\b""",
        RegexOption.IGNORE_CASE
    )
    private val SC_NAME_YES = Regex(
        """\b(rice|bigas|sugar|asukal|salt|asin|cooking oil|egg|eggs|itlog|milk|gatas|coffee|kape|nescafe|kopiko|bread|pandesal|noodle|noodles|pancit|sardine|sardines|tuna|corned|luncheon|hotdog|tocino|longganisa|chicken|manok|pork|baboy|beef|meat|fish|isda|bangus|tilapia|galunggong|vegetable|vegetables|gulay|onion|sibuyas|garlic|bawang|flour|vinegar|suka|soy sauce|toyo|patis|detergent|laundry|soap|sabon|candle|candles|kandila|bottled water|mineral water|corn|mais)\b""",
        RegexOption.IGNORE_CASE
    )
    private val SC_CAT_YES = Regex("""(meat|rice|staple|fish|seafood|egg|vegetable|fruit|noodle|canned)""", RegexOption.IGNORE_CASE)

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

    fun scEligibleLine(item: CartLine, productMap: Map<String, Product>): Boolean {
        val p = productMap[item.productId]
        return if (p != null) scEligibleProduct(p) else scSuggest(item.name, null)
    }

    fun scCapCents(settings: StoreSettings): Long {
        val c = settings.scDiscountCap
        return toCents(if (c > 0.0) c else 125.0)
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
            val pr = linePricing(item, productMap)
            val lineRetailC = lineCents(pr.retail, item.qty)
            val lineEffC = lineCents(getLinePrice(item, productMap), item.qty)
            val lineSavingC = max(0L, lineRetailC - lineEffC)
            retailC += lineRetailC
            savingsC += lineSavingC
            if (isSeniorPwd) {
                if (scEligibleLine(item, productMap)) {
                    eligC += lineRetailC - lineSavingC
                    eligKinds++
                } else {
                    otherLines++
                }
            }
        }

        val netC = retailC - savingsC
        val rawSeniorC = if (isSeniorPwd) ((eligC * 5.0) / 100.0).roundToLong() else 0L
        val capC = scCapCents(settings)
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

    enum class ExpiryState {
        NONE,
        EXPIRED,
        SOON,
        OK
    }

    data class ExpiryStatus(
        val status: ExpiryState,
        val days: Long?
    )

    private val EXPIRY_REGEX = Regex("""^\d{4}-\d{2}-\d{2}$""")

    fun expiryInfo(p: Product?, expiryWarnDays: Int = 30, today: LocalDate = LocalDate.now()): ExpiryStatus {
        val raw = p?.expiry?.trim() ?: ""
        if (!EXPIRY_REGEX.matches(raw)) return ExpiryStatus(ExpiryState.NONE, null)
        val expDate = runCatching { LocalDate.parse(raw) }.getOrNull()
            ?: return ExpiryStatus(ExpiryState.NONE, null)
        val days = ChronoUnit.DAYS.between(today, expDate)
        val warn = if (expiryWarnDays > 0) expiryWarnDays.toLong() else 30L
        return when {
            days <= 0L -> ExpiryStatus(ExpiryState.EXPIRED, days)
            days <= warn -> ExpiryStatus(ExpiryState.SOON, days)
            else -> ExpiryStatus(ExpiryState.OK, days)
        }
    }

    fun expiryLabel(p: Product?, expiryWarnDays: Int = 30, today: LocalDate = LocalDate.now()): String {
        val e = expiryInfo(p, expiryWarnDays, today)
        return when (e.status) {
            ExpiryState.EXPIRED -> if (e.days == 0L) "EXPIRES TODAY" else "EXPIRED ${-(e.days ?: 0L)}d ago"
            ExpiryState.SOON -> "Exp in ${e.days}d"
            else -> ""
        }
    }

    fun normBarcode(c: String?): String {
        val s = (c ?: "").trim().lowercase(Locale.US).replace(Regex("""\s+"""), "")
        return if (Regex("""^\d+$""").matches(s)) s.trimStart('0') else s
    }

    fun eanCheckOk(code: String): Boolean {
        if (!Regex("""^\d+$""").matches(code) || code.length < 2) return false
        val digits = code.map { it - '0' }
        val check = digits.last()
        var sum = 0
        var w = 3
        for (i in digits.size - 2 downTo 0) {
            sum += digits[i] * w
            w = 4 - w
        }
        return (10 - (sum % 10)) % 10 == check
    }

    fun expandUpcE(code: String): String? {
        val s = code.trim()
        if (!Regex("""^[01]\d{7}$""").matches(s)) return null
        val ns = s[0]
        val d1 = s[1]
        val d2 = s[2]
        val d3 = s[3]
        val d4 = s[4]
        val d5 = s[5]
        val d6 = s[6]
        val check = s[7]
        val body11 = when (d6) {
            '0', '1', '2' -> "$ns$d1$d2${d6}0000$d3$d4$d5"
            '3' -> "$ns$d1$d2${d3}00000$d4$d5"
            '4' -> "$ns$d1$d2$d3${d4}00000$d5"
            else -> "$ns$d1$d2$d3$d4${d5}0000$d6"
        }
        val candidate = body11 + check
        return if (eanCheckOk(candidate)) candidate else null
    }

    fun buildBarcodeIndex(products: List<Product>): Map<String, Product> {
        val map = LinkedHashMap<String, Product>()
        for (p in products) {
            val n = normBarcode(p.barcode)
            if (n.isNotEmpty() && !map.containsKey(n)) {
                map[n] = p
            }
        }
        return map
    }

    fun findProductByBarcodeIndexed(code: String, index: Map<String, Product>): Product? {
        val n = normBarcode(code)
        if (n.isEmpty()) return null
        index[n]?.let { return it }
        val trimmed = code.trim()
        if (Regex("""^[01]\d{7}$""").matches(trimmed)) {
            expandUpcE(trimmed)?.let { upca ->
                return index[normBarcode(upca)]
            }
        }
        return null
    }

    private val GS1_REGEX = Regex("""^(?:\][A-Za-z]\d)?\(?01\)?(\d{14})(?:$|[^\d]|\(\d{2}\)|\d{2})""")

    fun extractGs1Gtin(raw: String): String {
        val s = raw.trim()
        val m = GS1_REGEX.find(s) ?: return ""
        val g = m.groupValues[1]
        if (!eanCheckOk(g)) return ""
        return if (g.startsWith('0')) g.substring(1) else g
    }

    private val QTY_PREFIX_REGEX = Regex("""^(\d+(?:\.\d{1,3})?)\s*\*\s*(.+)$""")

    data class QtySearchParsed(val qty: Double, val query: String)

    fun parseQtySearchInput(raw: String): QtySearchParsed {
        val trimmed = raw.trim()
        val match = QTY_PREFIX_REGEX.matchEntire(trimmed) ?: return QtySearchParsed(1.0, trimmed)
        val qty = match.groupValues[1].toDoubleOrNull() ?: return QtySearchParsed(1.0, trimmed)
        val query = match.groupValues[2].trim()
        if (!qty.isFinite() || qty <= 0.0 || qty > 9999.0 || query.isEmpty()) {
            return QtySearchParsed(1.0, trimmed)
        }
        return QtySearchParsed(round3(qty), query)
    }

    data class ScanPayload(val qty: Double, val code: String, val rawQuery: String)

    fun extractScanPayload(rawInput: String): ScanPayload {
        val parsed = parseQtySearchInput(rawInput)
        val gtin = extractGs1Gtin(parsed.query)
        return ScanPayload(
            qty = parsed.qty,
            code = gtin.ifEmpty { parsed.query },
            rawQuery = parsed.query
        )
    }

    fun startOfDayMs(millis: Long = System.currentTimeMillis()): Long {
        val zone = ZoneId.systemDefault()
        return Instant.ofEpochMilli(millis).atZone(zone).toLocalDate()
            .atStartOfDay(zone).toInstant().toEpochMilli()
    }

    fun parseIsoMs(iso: String?): Long {
        if (iso.isNullOrBlank()) return 0L
        return runCatching { Instant.parse(iso).toEpochMilli() }.getOrElse {
            runCatching { java.time.OffsetDateTime.parse(iso).toInstant().toEpochMilli() }.getOrDefault(0L)
        }
    }

    fun inRange(dateIso: String?, fromMs: Long, toMs: Long): Boolean {
        val t = parseIsoMs(dateIso)
        return t in fromMs until toMs
    }

    fun nextReceiptNo(sales: List<SaleRecord>, nowMs: Long = System.currentTimeMillis()): String {
        val zdt = Instant.ofEpochMilli(nowMs).atZone(ZoneId.systemDefault())
        val prefix = String.format(
            Locale.US,
            "OR-%02d%02d%02d-",
            zdt.year % 100,
            zdt.monthValue,
            zdt.dayOfMonth
        )
        var seq = sales.count { it.receiptNo.startsWith(prefix) } + 1
        var no = prefix + seq.toString().padStart(4, '0')
        val existing = sales.mapTo(HashSet()) { it.receiptNo }
        while (no in existing) {
            seq++
            no = prefix + seq.toString().padStart(4, '0')
        }
        return no
    }

    fun formatDateTime(millis: Long = System.currentTimeMillis()): String {
        val zdt = Instant.ofEpochMilli(millis).atZone(ZoneId.systemDefault())
        return DateTimeFormatter.ofPattern("MMM d, yyyy, h:mm a", Locale.US).format(zdt)
    }

    fun formatTimeOnly(millis: Long = System.currentTimeMillis()): String {
        val zdt = Instant.ofEpochMilli(millis).atZone(ZoneId.systemDefault())
        return DateTimeFormatter.ofPattern("h:mm a", Locale.US).format(zdt)
    }

    fun itemUnitCapital(it: SaleItem, prodById: Map<String, Product>): Double {
        val c = it.capital ?: 0.0
        if (c > 0.0) return c
        val prod = it.productId?.let { id -> prodById[id] }
        return prod?.capital?.takeIf { it > 0.0 } ?: 0.0
    }

    fun saleLineRevenueC(s: SaleRecord, prodById: Map<String, Product>): DoubleArray {
        val items = s.items
        val lineC = DoubleArray(items.size) { toCents(items[it].lineTotal).toDouble() }
        val discC = toCents(s.seniorDiscount).toDouble()
        var rev = lineC.copyOf()

        if (discC > 0.0) {
            val elig = BooleanArray(items.size) { idx ->
                val it = items[idx]
                val p = it.productId?.let { pid -> prodById[pid] }
                if (p != null) scEligibleProduct(p) else scSuggest(it.name, it.category)
            }
            var eligSum = 0.0
            for (i in items.indices) if (elig[i]) eligSum += lineC[i]
            if (eligSum > 0.0) {
                rev = DoubleArray(items.size) { i ->
                    if (elig[i]) lineC[i] - (discC * lineC[i]) / eligSum else lineC[i]
                }
            }
        }
        val revSum = rev.sum()
        val g = toCents(s.grandTotal).toDouble()
        if (revSum > 0.0 && abs(revSum - g) > 1.0) {
            rev = DoubleArray(items.size) { i -> (rev[i] * g) / revSum }
        }
        return rev
    }

    fun saleProfitCalc(s: SaleRecord, prodById: Map<String, Product>): Double? {
        val revLines = saleLineRevenueC(s, prodById)
        var revC = 0.0
        var costC = 0.0
        var known = false
        s.items.forEachIndexed { i, it ->
            val c = itemUnitCapital(it, prodById)
            if (c > 0.0) {
                known = true
                revC += revLines[i]
                costC += c * 100.0 * it.qty
            }
        }
        return if (known) round2((revC - costC) / 100.0) else null
    }

    fun profitLastDays(sales: List<SaleRecord>, products: List<Product>, days: Int, nowMs: Long = System.currentTimeMillis()): Double? {
        val cutoff = nowMs - days.toLong() * DAY_MS
        val prodById = buildProductMap(products)
        var total = 0.0
        var known = false
        for (s in sales) {
            if (s.voided == true) continue
            val t = parseIsoMs(s.dateIso)
            if (t < cutoff) continue
            val pr = saleProfitCalc(s, prodById)
            if (pr != null) {
                total += pr
                known = true
            }
        }
        return if (known) round2(total) else null
    }

    data class TenderStats(val count: Int, val amt: Double)
    data class ProductSalesStat(val qty: Double, val amt: Double, val unit: String)

    data class SalesStats(
        val profit: Double,
        val gross: Double,
        val net: Double,
        val count: Int,
        val items: Double,
        val seniorDisc: Double,
        val wholesaleDisc: Double,
        val tender: Map<String, TenderStats>,
        val hours: Map<Int, Double>,
        val days: Map<String, Double>,
        val products: Map<String, ProductSalesStat>,
        val cats: Map<String, Double>
    )

    fun computeSalesStats(list: List<SaleRecord>, products: List<Product>): SalesStats {
        val prodById = buildProductMap(products)
        val prodByName = HashMap<String, Product>()
        for (p in products) prodByName.putIfAbsent(p.name, p)

        var profit = 0.0
        var gross = 0.0
        var net = 0.0
        var itemsCount = 0.0
        var seniorDisc = 0.0
        var wholesaleDisc = 0.0
        val tenderCounts = LinkedHashMap<String, Int>()
        val tenderAmts = LinkedHashMap<String, Double>()
        val hours = LinkedHashMap<Int, Double>()
        val days = LinkedHashMap<String, Double>()
        val prodQty = LinkedHashMap<String, Double>()
        val prodAmt = LinkedHashMap<String, Double>()
        val prodUnit = LinkedHashMap<String, String>()
        val cats = LinkedHashMap<String, Double>()
        val zone = ZoneId.systemDefault()

        for (s in list) {
            net += s.grandTotal
            saleProfitCalc(s, prodById)?.let { profit += it }
            gross += s.retailSubtotal
            seniorDisc += s.seniorDiscount
            wholesaleDisc += s.wholesaleSavings

            val m = s.paymentMethod.ifEmpty { "Cash" }
            tenderCounts[m] = (tenderCounts[m] ?: 0) + 1
            tenderAmts[m] = (tenderAmts[m] ?: 0.0) + s.grandTotal

            val ms = parseIsoMs(s.dateIso)
            if (ms > 0L) {
                val zdt = Instant.ofEpochMilli(ms).atZone(zone)
                hours[zdt.hour] = (hours[zdt.hour] ?: 0.0) + s.grandTotal
                val dk = String.format(Locale.US, "%04d-%02d-%02d", zdt.year, zdt.monthValue, zdt.dayOfMonth)
                days[dk] = (days[dk] ?: 0.0) + s.grandTotal
            }

            for (it in s.items) {
                itemsCount += if (it.unit == "kg") 1.0 else it.qty
                prodQty[it.name] = (prodQty[it.name] ?: 0.0) + it.qty
                prodAmt[it.name] = (prodAmt[it.name] ?: 0.0) + it.lineTotal
                prodUnit[it.name] = it.unit
                val prod = it.productId?.let { pid -> prodById[pid] } ?: prodByName[it.name]
                val c = it.category ?: prod?.category ?: "Uncategorized"
                cats[c] = (cats[c] ?: 0.0) + it.lineTotal
            }
        }

        return SalesStats(
            profit = round2(profit),
            gross = round2(gross),
            net = round2(net),
            count = list.size,
            items = itemsCount,
            seniorDisc = round2(seniorDisc),
            wholesaleDisc = round2(wholesaleDisc),
            tender = tenderCounts.keys.associateWith { k ->
                TenderStats(tenderCounts[k] ?: 0, round2(tenderAmts[k] ?: 0.0))
            },
            hours = hours.mapValues { round2(it.value) },
            days = days.mapValues { round2(it.value) },
            products = prodQty.keys.associateWith { k ->
                ProductSalesStat(round3(prodQty[k] ?: 0.0), round2(prodAmt[k] ?: 0.0), prodUnit[k] ?: "pc")
            },
            cats = cats.mapValues { round2(it.value) }
        )
    }

    data class DailySalesPoint(
        val dateKey: String,
        val label: String,
        val shortDay: String,
        val fullDate: String,
        val netSales: Double,
        val orders: Int
    )

    fun computeLast7DaysNetSales(sales: List<SaleRecord>, nowMs: Long = System.currentTimeMillis()): List<DailySalesPoint> {
        val zone = ZoneId.systemDefault()
        val today = Instant.ofEpochMilli(nowMs).atZone(zone).toLocalDate()
        val labelFmt = DateTimeFormatter.ofPattern("MMM d", Locale.US)
        val dayFmt = DateTimeFormatter.ofPattern("EEE", Locale.US)
        val fullFmt = DateTimeFormatter.ofPattern("EEE, MMM d, yyyy", Locale.US)

        val buckets = LinkedHashMap<String, Pair<Long, Int>>()
        val points = mutableListOf<DailySalesPoint>()

        for (offset in 6 downTo 0) {
            val d = today.minusDays(offset.toLong())
            val key = d.toString()
            buckets[key] = 0L to 0
            points.add(
                DailySalesPoint(
                    dateKey = key,
                    label = labelFmt.format(d),
                    shortDay = dayFmt.format(d),
                    fullDate = fullFmt.format(d),
                    netSales = 0.0,
                    orders = 0
                )
            )
        }

        for (s in sales) {
            if (s.voided == true) continue
            val ms = parseIsoMs(s.dateIso)
            if (ms <= 0L) continue
            val key = Instant.ofEpochMilli(ms).atZone(zone).toLocalDate().toString()
            val cur = buckets[key] ?: continue
            buckets[key] = (cur.first + toCents(s.grandTotal)) to (cur.second + 1)
        }

        return points.map { pt ->
            val b = buckets[pt.dateKey]
            if (b != null) pt.copy(netSales = fromCents(b.first), orders = b.second) else pt
        }
    }

    data class Trend7Summary(
        val total: Double,
        val average: Double,
        val bestDay: DailySalesPoint?,
        val activeDays: Int
    )

    fun summarize7DayTrend(points: List<DailySalesPoint>): Trend7Summary {
        val total = sumPeso(points) { it.netSales }
        val average = round2(total / max(1, points.size))
        var best: DailySalesPoint? = null
        var active = 0
        for (p in points) {
            if (p.netSales > 0.0) active++
            if (best == null || p.netSales > best.netSales) best = p
        }
        return Trend7Summary(
            total = total,
            average = average,
            bestDay = best?.takeIf { it.netSales > 0.0 },
            activeDays = active
        )
    }

    data class HourlySalesPoint(val hr: Int, val label: String, val sales: Double)

    fun computeHourlySalesSeries(hours: Map<Int, Double>): List<HourlySalesPoint> {
        val valid = hours.keys.filter { it in 0..23 }
        if (valid.isEmpty()) return emptyList()
        var lo = valid.min()
        var hi = valid.max()
        while (hi - lo < 7 && (lo > 0 || hi < 23)) {
            if (lo > 0) lo--
            if (hi - lo < 7 && hi < 23) hi++
        }
        return (lo..hi).map { hr ->
            val h12 = if (hr % 12 == 0) 12 else hr % 12
            val ampm = if (hr < 12) "a" else "p"
            HourlySalesPoint(hr, "$h12$ampm", round2(hours[hr] ?: 0.0))
        }
    }

    data class RankedProductProfit(
        val name: String,
        val unit: String,
        val qty: Double,
        val rev: Double,
        val profit: Double,
        val cls: String // "A", "B", "C"
    )

    data class ProfitRankingResult(
        val ranked: List<RankedProductProfit>,
        val unknownCount: Int
    )

    fun computeProfitRanking(list: List<SaleRecord>, products: List<Product>): ProfitRankingResult {
        val prodById = buildProductMap(products)
        val qtyMap = LinkedHashMap<String, Double>()
        val revMap = LinkedHashMap<String, Double>()
        val profMap = LinkedHashMap<String, Double>()
        val nameMap = LinkedHashMap<String, String>()
        val unitMap = LinkedHashMap<String, String>()
        val unknown = HashSet<String>()

        for (s in list) {
            val revLines = saleLineRevenueC(s, prodById)
            s.items.forEachIndexed { idx, it ->
                val c = itemUnitCapital(it, prodById)
                if (!(c > 0.0)) {
                    unknown.add(it.name)
                    return@forEachIndexed
                }
                val key = it.productId ?: it.name
                nameMap[key] = it.name
                unitMap[key] = it.unit
                qtyMap[key] = (qtyMap[key] ?: 0.0) + it.qty
                val rev = revLines[idx] / 100.0
                revMap[key] = (revMap[key] ?: 0.0) + rev
                profMap[key] = (profMap[key] ?: 0.0) + (rev - c * it.qty)
            }
        }

        val sortedKeys = profMap.entries.sortedByDescending { it.value }.map { it.key }
        val totalPos = sortedKeys.sumOf { k -> (profMap[k] ?: 0.0).coerceAtLeast(0.0) }
        var cum = 0.0
        val ranked = sortedKeys.map { k ->
            val p = round2(profMap[k] ?: 0.0)
            val cls = if (p > 0.0 && totalPos > 0.0) {
                val c = when {
                    cum < totalPos * 0.7 -> "A"
                    cum < totalPos * 0.9 -> "B"
                    else -> "C"
                }
                cum += p
                c
            } else {
                "C"
            }
            RankedProductProfit(
                name = nameMap[k] ?: k,
                unit = unitMap[k] ?: "pc",
                qty = round3(qtyMap[k] ?: 0.0),
                rev = round2(revMap[k] ?: 0.0),
                profit = p,
                cls = cls
            )
        }
        return ProfitRankingResult(ranked, unknown.size)
    }

    data class ProductVelocity(
        val productId: String,
        val soldQty: Double,
        val revenue30: Double,
        val avgDaily: Double,
        val daysOfCover: Double?,
        val isDeadStock: Boolean
    )

    data class VelocityResult(
        val byId: Map<String, ProductVelocity>,
        val windowDays: Int,
        val hasSalesInWindow: Boolean
    )

    fun computeProductVelocities(
        products: List<Product>,
        sales: List<SaleRecord>,
        nowMs: Long = System.currentTimeMillis()
    ): VelocityResult {
        val cutoff = nowMs - 30L * DAY_MS
        val prodById = buildProductMap(products)
        val prodByName = HashMap<String, Product>()
        for (p in products) prodByName.putIfAbsent(p.name, p)

        val soldQty = HashMap<String, Double>()
        val soldRevC = HashMap<String, Long>()
        var earliest = nowMs
        var hasSales = false

        for (s in sales) {
            if (s.voided == true) continue
            val t = parseIsoMs(s.dateIso)
            if (t < cutoff) continue
            hasSales = true
            if (t < earliest) earliest = t
            for (it in s.items) {
                val prod = it.productId?.let { pid -> prodById[pid] } ?: prodByName[it.name] ?: continue
                soldQty[prod.id] = (soldQty[prod.id] ?: 0.0) + it.qty
                soldRevC[prod.id] = (soldRevC[prod.id] ?: 0L) + toCents(it.lineTotal)
            }
        }

        val windowDays = ceil((nowMs - earliest).toDouble() / DAY_MS).toInt().coerceIn(1, 30)
        val byId = HashMap<String, ProductVelocity>()
        for (p in products) {
            val sq = round3(soldQty[p.id] ?: 0.0)
            val avg = sq / windowDays
            val stk = max(0.0, p.stock)
            val cover = if (avg > 0.0) stk / avg else null
            byId[p.id] = ProductVelocity(
                productId = p.id,
                soldQty = sq,
                revenue30 = fromCents(soldRevC[p.id] ?: 0L),
                avgDaily = avg,
                daysOfCover = cover,
                isDeadStock = hasSales && stk > 0.0 && sq == 0.0
            )
        }
        return VelocityResult(byId, windowDays, hasSales)
    }

    data class ReorderSuggestion(
        val p: Product,
        val avg: Double,
        val rop: Double,
        val suggest: Double,
        val daysLeft: Double,
        val cost: Double?
    )

    data class ReorderResult(
        val rows: List<ReorderSuggestion>,
        val days: Int,
        val hasSales: Boolean
    )

    fun computeReorderList(
        products: List<Product>,
        sales: List<SaleRecord>,
        settings: StoreSettings,
        nowMs: Long = System.currentTimeMillis()
    ): ReorderResult {
        val lead = settings.reorderLeadDays.coerceAtLeast(0)
        val safety = settings.reorderSafetyDays.coerceAtLeast(0)
        val vel = computeProductVelocities(products, sales, nowMs)
        val rows = mutableListOf<ReorderSuggestion>()

        for (p in products) {
            val v = vel.byId[p.id] ?: continue
            if (!(v.soldQty > 0.0)) continue
            val rop = v.avgDaily * (lead + safety)
            if (p.stock > rop) continue
            val target = rop + v.avgDaily * 7.0
            val need = max(0.0, target - p.stock)
            val suggest = if (p.unit == "kg") ceil(need * 10.0) / 10.0 else ceil(need)
            if (!(suggest > 0.0)) continue
            val cap = p.capital ?: 0.0
            rows.add(
                ReorderSuggestion(
                    p = p,
                    avg = v.avgDaily,
                    rop = rop,
                    suggest = suggest,
                    daysLeft = if (v.avgDaily > 0.0) p.stock / v.avgDaily else 0.0,
                    cost = if (cap > 0.0) round2(suggest * cap) else null
                )
            )
        }
        rows.sortBy { it.daysLeft }
        return ReorderResult(rows, vel.windowDays, vel.hasSalesInWindow)
    }

    data class StockHealthSummary(
        val totalSkus: Int,
        val stockRetailValue: Double,
        val capitalInStock: Double,
        val potentialProfit: Double,
        val missingCapitalCount: Int,
        val lossMarginCount: Int,
        val lowCount: Int,
        val outCount: Int,
        val expiredCount: Int,
        val soonCount: Int,
        val fastLowCount: Int,
        val deadStockCount: Int,
        val gmroi: String
    )

    fun computeStockHealthSummary(
        products: List<Product>,
        sales: List<SaleRecord>,
        settings: StoreSettings,
        today: LocalDate = LocalDate.now(),
        nowMs: Long = System.currentTimeMillis()
    ): StockHealthSummary {
        val lowTh = StockAlerts.normalizeThreshold(settings.lowStockThreshold, 10.0)
        val warnDays = if (settings.expiryWarnDays > 0) settings.expiryWarnDays else 30
        val coverWarnDays = settings.reorderLeadDays.coerceAtLeast(0) + settings.reorderSafetyDays.coerceAtLeast(0)
        val vel = computeProductVelocities(products, sales, nowMs)

        var retailC = 0L
        var capitalC = 0L
        var knownRetC = 0L
        var missingCap = 0
        var lossMargin = 0
        var low = 0
        var out = 0
        var expired = 0
        var soon = 0
        var fastLow = 0
        var dead = 0

        for (p in products) {
            val lineRetC = lineCents(p.retailPrice, p.stock)
            retailC += lineRetC
            val cap = p.capital ?: 0.0
            if (cap > 0.0) {
                capitalC += lineCents(cap, p.stock)
                knownRetC += lineRetC
                if (p.retailPrice < cap || (p.wholesalePrice > 0.0 && p.wholesalePrice < cap)) {
                    lossMargin++
                }
            } else {
                missingCap++
            }
            val effLow = StockAlerts.getEffectiveLowStockThreshold(p, lowTh)
            if (p.stock <= 0.0) out++ else if (p.stock <= effLow) low++
            when (expiryInfo(p, warnDays, today).status) {
                ExpiryState.EXPIRED -> expired++
                ExpiryState.SOON -> soon++
                else -> {}
            }
            val pv = vel.byId[p.id]
            if (pv != null) {
                if (p.stock > 0.0 && pv.daysOfCover != null && pv.daysOfCover <= coverWarnDays) fastLow++
                if (pv.isDeadStock) dead++
            }
        }

        val capitalInStock = fromCents(capitalC)
        val profit30 = profitLastDays(sales, products, 30, nowMs)
        val gmroi = if (capitalInStock > 0.0 && profit30 != null) {
            String.format(Locale.US, "%.2f×", profit30 / capitalInStock)
        } else "—"

        return StockHealthSummary(
            totalSkus = products.size,
            stockRetailValue = fromCents(retailC),
            capitalInStock = capitalInStock,
            potentialProfit = fromCents(max(0L, knownRetC - capitalC)),
            missingCapitalCount = missingCap,
            lossMarginCount = lossMargin,
            lowCount = low,
            outCount = out,
            expiredCount = expired,
            soonCount = soon,
            fastLowCount = fastLow,
            deadStockCount = dead,
            gmroi = gmroi
        )
    }

    data class BatchStockAdjustmentInput(
        val productId: String,
        val mode: String, // "delta" or "set"
        val value: Double,
        val reason: String,
        val note: String? = null,
        val newExpiry: String? = null,
        val newCapital: Double? = null
    )

    data class BatchUpdateResult(
        val nextProducts: List<Product>,
        val logEntries: List<StockLogEntry>,
        val changedCount: Int
    )

    fun applyBatchStockUpdates(
        products: List<Product>,
        adjustments: List<BatchStockAdjustmentInput>,
        nowIso: String = Instant.now().toString()
    ): BatchUpdateResult {
        val adjMap = adjustments.filter { it.value.isFinite() }.associateBy { it.productId }
        val logEntries = mutableListOf<StockLogEntry>()
        var changedCount = 0
        val stamp = System.currentTimeMillis().toString(36)

        val next = products.mapIndexed { idx, p ->
            val adj = adjMap[p.id] ?: return@mapIndexed p
            val prevStock = p.stock
            val rawTarget = if (adj.mode == "set") adj.value else prevStock + adj.value
            val nextStock = max(0.0, round3(rawTarget))
            val delta = round3(nextStock - prevStock)
            val expChanged = adj.newExpiry != null && adj.newExpiry != (p.expiry ?: "")
            val capChanged = adj.newCapital != null && adj.newCapital.isFinite() && adj.newCapital >= 0.0 && adj.newCapital != (p.capital ?: 0.0)

            if (delta == 0.0 && !expChanged && !capChanged) return@mapIndexed p
            changedCount++
            if (delta != 0.0) {
                logEntries.add(
                    StockLogEntry(
                        id = "LOG-$stamp-$idx",
                        dateIso = nowIso,
                        productId = p.id,
                        productName = p.name,
                        delta = delta,
                        prevStock = prevStock,
                        newStock = nextStock,
                        reason = adj.reason,
                        note = adj.note?.trim()?.ifEmpty { null }
                    )
                )
            }
            p.copy(
                stock = nextStock,
                expiry = if (expChanged) adj.newExpiry?.ifEmpty { null } else p.expiry,
                capital = if (capChanged) (adj.newCapital!! * 10000.0).roundToLong() / 10000.0 else p.capital,
                updatedAt = nowIso
            )
        }
        return BatchUpdateResult(next, logEntries, changedCount)
    }

    data class CsvImportRowPreview(
        val rowNum: Int,
        val action: String, // "create", "update", "skip"
        val reason: String? = null,
        val existing: Product? = null,
        val data: Product? = null
    )

    data class CsvParseResult(val rows: List<CsvImportRowPreview>, val error: String? = null)

    fun parseCsvRows(text: String): List<List<String>> {
        val cleaned = text.removePrefix("\uFEFF")
        val rows = mutableListOf<List<String>>()
        var row = mutableListOf<String>()
        val cell = StringBuilder()
        var inQuotes = false
        var i = 0
        while (i < cleaned.length) {
            val ch = cleaned[i]
            if (inQuotes) {
                if (ch == '"') {
                    if (i + 1 < cleaned.length && cleaned[i + 1] == '"') {
                        cell.append('"')
                        i++
                    } else {
                        inQuotes = false
                    }
                } else {
                    cell.append(ch)
                }
                i++
                continue
            }
            when (ch) {
                '"' -> inQuotes = true
                ',' -> {
                    row.add(cell.toString())
                    cell.setLength(0)
                }
                '\r' -> {
                    if (i + 1 < cleaned.length && cleaned[i + 1] == '\n') i++
                    row.add(cell.toString())
                    if (row.any { it.isNotBlank() }) rows.add(row)
                    row = mutableListOf()
                    cell.setLength(0)
                }
                '\n' -> {
                    row.add(cell.toString())
                    if (row.any { it.isNotBlank() }) rows.add(row)
                    row = mutableListOf()
                    cell.setLength(0)
                }
                else -> cell.append(ch)
            }
            i++
        }
        if (cell.isNotEmpty() || row.isNotEmpty()) {
            row.add(cell.toString())
            if (row.any { it.isNotBlank() }) rows.add(row)
        }
        return rows
    }

    fun parseInventoryCsv(csvText: String, existingProducts: List<Product>): CsvParseResult {
        val matrix = parseCsvRows(csvText)
        if (matrix.size < 2) {
            return CsvParseResult(emptyList(), "CSV must include a header row and at least one product row.")
        }
        val headers = matrix[0].map { it.trim().lowercase(Locale.US).replace(Regex("""[^a-z0-9]"""), "") }
        fun col(vararg aliases: String): Int = headers.indexOfFirst { it in aliases }

        val idxId = col("id", "sku")
        val idxBarcode = col("barcode", "upc", "ean", "gtin", "code")
        val idxName = col("name", "productname", "item", "description")
        val idxCat = col("category", "dept", "group")
        val idxUnit = col("unit", "uom")
        val idxCap = col("capital", "cost", "unitcost")
        val idxRetail = col("retailprice", "retail", "price", "sellingprice")
        val idxWhs = col("wholesaleprice", "wholesale")
        val idxWhsMin = col("wholesalemin", "wholesaleminqty", "minqty")
        val idxStock = col("stock", "qty", "quantity", "onhand")
        val idxLowAlert = col("lowalert", "lowstockthreshold", "minstock", "alertlevel")
        val idxExpiry = col("expiry", "expirydate", "exp")
        val idxSc = col("scpwd", "sceligible", "sc")

        if (idxName < 0 && idxBarcode < 0 && idxId < 0) {
            return CsvParseResult(emptyList(), "Include headers such as Barcode, Name, Retail Price, Stock.")
        }

        val byId = existingProducts.associateBy { it.id }
        val bcIdx = buildBarcodeIndex(existingProducts)
        val rows = mutableListOf<CsvImportRowPreview>()

        for (r in 1 until matrix.size) {
            val raw = matrix[r]
            fun get(idx: Int): String = if (idx in raw.indices) raw[idx].trim() else ""
            val rawId = get(idxId)
            val rawBc = get(idxBarcode)
            val rawName = get(idxName)
            val matched = (if (rawId.isNotEmpty()) byId[rawId] else null)
                ?: if (rawBc.isNotEmpty()) findProductByBarcodeIndexed(rawBc, bcIdx) else null

            fun parseNum(s: String): Pair<Boolean, Double?> {
                val c = s.replace(Regex("""[₱,\s]"""), "")
                if (c.isEmpty()) return true to null
                val d = c.toDoubleOrNull() ?: return false to null
                return if (d.isFinite()) true to d else false to null
            }

            val rNum = parseNum(get(idxRetail))
            val cNum = parseNum(get(idxCap))
            val wNum = parseNum(get(idxWhs))
            val wmNum = parseNum(get(idxWhsMin))
            val sNum = parseNum(get(idxStock))
            val laNum = parseNum(get(idxLowAlert))

            if (listOf(rNum, cNum, wNum, wmNum, sNum, laNum).any { !it.first }) {
                rows.add(CsvImportRowPreview(r + 1, "skip", "Invalid number format"))
                continue
            }

            val rawExp = get(idxExpiry)
            val rawSc = get(idxSc).lowercase(Locale.US)
            val scVal = when (rawSc) {
                "yes", "true", "1" -> true
                "no", "false", "0" -> false
                else -> null
            }

            if (matched != null) {
                val nextRetail = rNum.second?.let { round2(it) } ?: matched.retailPrice
                val nextCap = cNum.second ?: matched.capital
                val nextWhs = wNum.second?.let { round2(it) } ?: matched.wholesalePrice
                val nextMin = wmNum.second?.takeIf { it > 0 }?.roundToInt() ?: matched.wholesaleMinQty
                val nextStock = sNum.second?.let { max(0.0, round3(it)) } ?: matched.stock
                val nextLow = laNum.second?.let { if (it >= 0.0) round3(it) else null } ?: matched.lowStockThreshold

                if (nextRetail <= 0.0 || nextStock < 0.0 || (nextCap != null && nextCap < 0.0) || nextWhs < 0.0) {
                    rows.add(CsvImportRowPreview(r + 1, "skip", "Invalid negative/zero values", matched))
                    continue
                }
                rows.add(
                    CsvImportRowPreview(
                        rowNum = r + 1,
                        action = "update",
                        existing = matched,
                        data = matched.copy(
                            barcode = rawBc.ifEmpty { matched.barcode },
                            name = rawName.ifEmpty { matched.name },
                            category = get(idxCat).ifEmpty { matched.category },
                            unit = get(idxUnit).ifEmpty { matched.unit },
                            capital = nextCap,
                            retailPrice = nextRetail,
                            wholesalePrice = nextWhs,
                            wholesaleMinQty = nextMin,
                            stock = nextStock,
                            lowStockThreshold = nextLow,
                            expiry = if (EXPIRY_REGEX.matches(rawExp)) rawExp else matched.expiry,
                            scEligible = scVal ?: matched.scEligible
                        )
                    )
                )
            } else {
                val retailVal = rNum.second
                if (rawName.isEmpty() || retailVal == null || retailVal <= 0.0) {
                    rows.add(CsvImportRowPreview(r + 1, "skip", "New item requires Name and Retail Price > 0"))
                    continue
                }
                val cleanStock = sNum.second?.let { max(0.0, round3(it)) } ?: 0.0
                val cleanCap = cNum.second?.takeIf { it >= 0.0 }
                val cleanWhs = wNum.second?.takeIf { it >= 0.0 }?.let { round2(it) } ?: round2(retailVal)
                val cleanMin = wmNum.second?.takeIf { it > 0 }?.roundToInt() ?: 10
                val cleanLow = laNum.second?.takeIf { it >= 0.0 }?.let { round3(it) }
                rows.add(
                    CsvImportRowPreview(
                        rowNum = r + 1,
                        action = "create",
                        data = Product(
                            id = "",
                            barcode = rawBc.ifEmpty { "480${System.currentTimeMillis().toString().takeLast(7)}${r.toString().padStart(3, '0')}" },
                            name = rawName,
                            category = get(idxCat).ifEmpty { "Rice & Staples" },
                            unit = get(idxUnit).ifEmpty { "pc" },
                            capital = cleanCap,
                            retailPrice = round2(retailVal),
                            wholesalePrice = cleanWhs,
                            wholesaleMinQty = cleanMin,
                            stock = cleanStock,
                            lowStockThreshold = cleanLow,
                            expiry = if (EXPIRY_REGEX.matches(rawExp)) rawExp else null,
                            scEligible = scVal
                        )
                    )
                )
            }
        }
        return CsvParseResult(rows)
    }

    fun escapeCsvCell(v: String?): String {
        var t = v ?: ""
        val trimmed = t.trimStart()
        if (t.startsWith('\t') || t.startsWith('\r') ||
            (trimmed.isNotEmpty() && trimmed[0] in charArrayOf('=', '+', '-', '@') &&
                (trimmed.startsWith("=") || trimmed.startsWith("@") || trimmed.toDoubleOrNull() == null))
        ) {
            t = "'$t"
        }
        return "\"${t.replace("\"", "\"\"")}\""
    }

    data class CashDrawerSummary(
        val openingFloat: Double,
        val expectedCashSales: Double,
        val expectedDrawerTotal: Double,
        val countedTotal: Double,
        val variance: Double,
        val status: String, // "balanced", "over", "short"
        val cashOrders: Int,
        val splitCashOrders: Int
    )

    fun computeCashDrawerSummary(
        sales: List<SaleRecord>,
        fromMs: Long,
        toMs: Long,
        denominationCounts: Map<Double, Int>,
        openingFloat: Double = 0.0
    ): CashDrawerSummary {
        var cashSalesC = 0L
        var cashOrders = 0
        var splitCashOrders = 0
        for (s in sales) {
            if (s.voided == true || !inRange(s.dateIso, fromMs, toMs)) continue
            if (s.paymentMethod == "Cash") {
                cashSalesC += toCents(s.grandTotal)
                cashOrders++
            } else if (s.paymentMethod == "Split" && s.splitDetails != null) {
                cashSalesC += toCents(s.splitDetails.cash)
                splitCashOrders++
            }
        }
        var countedC = 0L
        for (denom in PH_DENOMINATIONS) {
            val qty = (denominationCounts[denom] ?: 0).coerceAtLeast(0)
            countedC += toCents(denom) * qty
        }
        val floatC = max(0L, toCents(openingFloat))
        val expectedDrawerC = cashSalesC + floatC
        val varianceC = countedC - expectedDrawerC
        val status = when {
            varianceC == 0L -> "balanced"
            varianceC > 0L -> "over"
            else -> "short"
        }
        return CashDrawerSummary(
            openingFloat = fromCents(floatC),
            expectedCashSales = fromCents(cashSalesC),
            expectedDrawerTotal = fromCents(expectedDrawerC),
            countedTotal = fromCents(countedC),
            variance = fromCents(varianceC),
            status = status,
            cashOrders = cashOrders,
            splitCashOrders = splitCashOrders
        )
    }

    fun getTopFastMoverIds(products: List<Product>, sales: List<SaleRecord>, limit: Int = 12): Set<String> {
        val vel = computeProductVelocities(products, sales)
        if (!vel.hasSalesInWindow || limit <= 0) return emptySet()
        return vel.byId.values
            .filter { it.soldQty > 0.0 }
            .sortedWith(compareByDescending<ProductVelocity> { it.revenue30 }.thenByDescending { it.soldQty })
            .take(limit)
            .mapTo(HashSet()) { it.productId }
    }

    fun getLastVoidableSale(sales: List<SaleRecord>): SaleRecord? {
        return sales.filter { it.voided != true }.maxByOrNull { parseIsoMs(it.dateIso) }
    }

    fun sanitizeConfigForSnapshot(settings: StoreSettings): ConfigSnapshotData = ConfigSnapshotData(
        storeName = settings.storeName.ifBlank { DEFAULT_STORE_NAME },
        storeAddress = settings.storeAddress,
        storeTin = settings.storeTin,
        storePhone = settings.storePhone,
        receiptFooter = settings.receiptFooter,
        storeIcon = settings.storeIcon ?: "basket",
        storeTagline = settings.storeTagline ?: "",
        lowStockThreshold = settings.lowStockThreshold,
        expiryWarnDays = settings.expiryWarnDays,
        reorderLeadDays = settings.reorderLeadDays,
        reorderSafetyDays = settings.reorderSafetyDays,
        beep = settings.beep,
        vibrate = settings.vibrate,
        stockAlertNotifications = settings.stockAlertNotifications,
        scDiscountCap = settings.scDiscountCap,
        receiptWidth = if (settings.receiptWidth == "58mm") "58mm" else "80mm",
        qrPayLabel = settings.qrPayLabel,
        qrMerchantName = settings.qrMerchantName,
        qrAccountNumber = settings.qrAccountNumber,
        qrEmvPayload = settings.qrEmvPayload,
        customerDisplayGreeting = settings.customerDisplayGreeting
    )

    fun diffConfigFields(prev: ConfigSnapshotData, next: ConfigSnapshotData): List<String> {
        val diff = mutableListOf<String>()
        if (prev.storeName != next.storeName) diff.add("storeName")
        if (prev.storeAddress != next.storeAddress) diff.add("storeAddress")
        if (prev.storeTin != next.storeTin) diff.add("storeTin")
        if (prev.storePhone != next.storePhone) diff.add("storePhone")
        if (prev.receiptFooter != next.receiptFooter) diff.add("receiptFooter")
        if (prev.storeIcon != next.storeIcon) diff.add("storeIcon")
        if (prev.storeTagline != next.storeTagline) diff.add("storeTagline")
        if (prev.lowStockThreshold != next.lowStockThreshold) diff.add("lowStockThreshold")
        if (prev.expiryWarnDays != next.expiryWarnDays) diff.add("expiryWarnDays")
        if (prev.reorderLeadDays != next.reorderLeadDays) diff.add("reorderLeadDays")
        if (prev.reorderSafetyDays != next.reorderSafetyDays) diff.add("reorderSafetyDays")
        if (prev.beep != next.beep) diff.add("beep")
        if (prev.vibrate != next.vibrate) diff.add("vibrate")
        if (prev.stockAlertNotifications != next.stockAlertNotifications) diff.add("stockAlertNotifications")
        if (prev.scDiscountCap != next.scDiscountCap) diff.add("scDiscountCap")
        if (prev.receiptWidth != next.receiptWidth) diff.add("receiptWidth")
        if (prev.qrPayLabel != next.qrPayLabel) diff.add("qrPayLabel")
        if (prev.qrMerchantName != next.qrMerchantName) diff.add("qrMerchantName")
        if (prev.qrAccountNumber != next.qrAccountNumber) diff.add("qrAccountNumber")
        if (prev.qrEmvPayload != next.qrEmvPayload) diff.add("qrEmvPayload")
        if (prev.customerDisplayGreeting != next.customerDisplayGreeting) diff.add("customerDisplayGreeting")
        return diff
    }

    private data class SeedRow(
        val barcode: String,
        val name: String,
        val category: String,
        val unit: String,
        val retail: Double,
        val wholesale: Double,
        val minQty: Int,
        val stock: Double
    )

    fun buildDefaultCatalog(): List<Product> {
        val rows = listOf(
            SeedRow("4800016644801", "Purefoods Tender Juicy Hotdog Regular 1kg", "Frozen Meat", "pack", 195.0, 185.0, 5, 30.0),
            SeedRow("4800016644818", "CDO Idol Cheesedog 1kg", "Frozen Meat", "pack", 175.0, 165.0, 5, 25.0),
            SeedRow("4800016644825", "Magnolia Chicken Breast Fillet (Per Kg)", "Frozen Meat", "kg", 235.0, 220.0, 5, 40.0),
            SeedRow("4800016644832", "Pork Kasim / Shoulder Cut (Per Kg)", "Frozen Meat", "kg", 320.0, 305.0, 5, 35.0),
            SeedRow("4800016644849", "Pork Liempo / Belly Strip (Per Kg)", "Frozen Meat", "kg", 365.0, 348.0, 5, 28.0),
            SeedRow("4800016644856", "Pampanga's Best Tocino Original 450g", "Frozen Meat", "pack", 145.0, 138.0, 6, 24.0),
            SeedRow("4800099100014", "Sinandomeng White Rice (Per Kg)", "Rice & Staples", "kg", 54.0, 51.0, 25, 150.0),
            SeedRow("4800099100021", "Jasmin Fragrant Rice 5kg Sack", "Rice & Staples", "pack", 285.0, 272.0, 4, 40.0),
            SeedRow("4800010011203", "Lucky Me! Pancit Canton Original 60g", "Canned & Noodles", "pc", 15.0, 13.5, 12, 120.0),
            SeedRow("4800010011210", "Lucky Me! Pancit Canton Calamansi 60g", "Canned & Noodles", "pc", 15.0, 13.5, 12, 120.0),
            SeedRow("4800047820106", "Century Tuna Flakes in Oil 180g", "Canned & Noodles", "pc", 42.0, 39.5, 12, 60.0),
            SeedRow("4800047820113", "555 Sardines in Tomato Sauce 155g", "Canned & Noodles", "pc", 26.0, 24.0, 12, 85.0),
            SeedRow("4800047820120", "Argentina Corned Beef 175g", "Canned & Noodles", "pc", 44.0, 41.5, 12, 55.0),
            SeedRow("4800024556011", "Coca-Cola Original 1.5L Bottle", "Beverages", "pc", 68.0, 63.0, 6, 48.0),
            SeedRow("4800024556028", "Nescafe Classic Twin Pack 44g", "Beverages", "pc", 16.0, 14.5, 12, 100.0),
            SeedRow("4800024556035", "Milo Chocolate Malt Powder 300g", "Beverages", "pack", 108.0, 102.0, 6, 36.0),
            SeedRow("4800361390814", "Bear Brand Fortified Powdered Milk 300g", "Dairy & Bakery", "pack", 118.0, 112.0, 6, 42.0),
            SeedRow("4800110025914", "Gardenia Classic White Bread 600g", "Dairy & Bakery", "pack", 85.0, 81.0, 5, 20.0),
            SeedRow("4800011132105", "Datu Puti Soy Sauce 1L Bottle", "Condiments & Cooking", "pc", 56.0, 52.0, 6, 45.0),
            SeedRow("4800011132112", "Datu Puti White Vinegar 1L Bottle", "Condiments & Cooking", "pc", 44.0, 41.0, 6, 45.0),
            SeedRow("4800011132129", "Golden Fiesta Palm Cooking Oil 1L", "Condiments & Cooking", "pc", 112.0, 106.0, 6, 40.0),
            SeedRow("4800016644108", "Piattos Cheese Potato Crisps 85g", "Snacks & Biscuits", "pc", 39.0, 36.5, 10, 50.0),
            SeedRow("4800016644115", "SkyFlakes Crackers 10s Pack", "Snacks & Biscuits", "pack", 64.0, 60.0, 6, 40.0),
            SeedRow("4800888140119", "Safeguard Pure White Bath Soap 130g", "Personal & Home", "pc", 54.0, 50.0, 6, 55.0),
            SeedRow("4800888140126", "Surf Powder Detergent Sun Fresh 1kg", "Personal & Home", "pack", 128.0, 120.0, 6, 38.0)
        )
        return rows.mapIndexed { idx, row ->
            Product(
                id = "SKU-${(idx + 1).toString().padStart(4, '0')}",
                barcode = row.barcode,
                name = row.name,
                category = row.category,
                unit = row.unit,
                retailPrice = row.retail,
                wholesalePrice = row.wholesale,
                wholesaleMinQty = row.minQty,
                stock = row.stock
            )
        }
    }
}
