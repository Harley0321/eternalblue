package com.example.domain

import com.example.model.CartLine
import com.example.model.HeldOrder
import com.example.model.PriceType
import com.example.model.Product
import com.example.model.SaleRecord
import com.example.model.SecurityLogEntry
import com.example.model.StockFilter
import com.example.model.StockLogEntry
import com.example.model.StoreSettings
import java.time.Instant
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import java.util.Locale
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

enum class AssistantLang { en, tl }
enum class AssistantTone { neutral, emerald, amber, rose, indigo }

data class AssistantMetric(
    val label: String,
    val value: String,
    val hint: String? = null,
    val tone: AssistantTone = AssistantTone.neutral
)

data class AssistantBar(
    val label: String,
    val valueText: String,
    val pct: Int,
    val tone: AssistantTone = AssistantTone.emerald
)

sealed interface AssistantAction {
    val label: String
    data class OpenReorder(override val label: String) : AssistantAction
    data class OpenStockFilter(override val label: String, val filter: StockFilter) : AssistantAction
    data class OpenScReview(override val label: String) : AssistantAction
    data class OpenBatchRestock(override val label: String) : AssistantAction
    data class OpenCsvImport(override val label: String) : AssistantAction
    data class OpenStockLog(override val label: String) : AssistantAction
    data class OpenReceipt(override val label: String, val receiptNo: String) : AssistantAction
    data class OpenSales(override val label: String) : AssistantAction
    data class OpenHeld(override val label: String) : AssistantAction
    data class OpenSettings(override val label: String) : AssistantAction
    data class OpenScanner(override val label: String) : AssistantAction
    data class OpenXRead(override val label: String) : AssistantAction
    data class OpenZRead(override val label: String) : AssistantAction
    data class OpenCashDrawer(override val label: String) : AssistantAction
    data class AddToCart(override val label: String, val productId: String, val qty: Double = 1.0) : AssistantAction
    data class FindProductStock(override val label: String, val query: String) : AssistantAction
}

data class AssistantContext(
    val products: List<Product>,
    val sales: List<SaleRecord>,
    val heldOrders: List<HeldOrder>,
    val settings: StoreSettings,
    val cart: List<CartLine> = emptyList(),
    val stockLog: List<StockLogEntry> = emptyList(),
    val securityLog: List<SecurityLogEntry> = emptyList(),
    val preferredLang: AssistantLang? = null
)

data class AssistantReply(
    val text: String,
    val lang: AssistantLang,
    val intent: String,
    val chips: List<String>,
    val metrics: List<AssistantMetric> = emptyList(),
    val bars: List<AssistantBar> = emptyList(),
    val actions: List<AssistantAction> = emptyList()
)

data class StorePulseSummary(
    val todayNet: Double,
    val todayProfit: Double,
    val todayOrders: Int,
    val avg7dDaily: Double,
    val pacePctVsAvg: Double?,
    val healthScore: Int,
    val healthTone: AssistantTone,
    val healthLabelEn: String,
    val healthLabelTl: String,
    val urgentStockCount: Int,
    val lowCount: Int,
    val outCount: Int,
    val expiredCount: Int,
    val soonCount: Int,
    val fastLowCount: Int,
    val lossCount: Int,
    val missingCapitalCount: Int,
    val parkedCount: Int,
    val cartCount: Int,
    val cartNearWholesaleCount: Int,
    val pinConfigured: Boolean,
    val daysSinceBackup: Int?
)

object AssistantEngine {

    private val DEFAULT_CHIPS = mapOf(
        AssistantLang.en to listOf("Store briefing", "Today's sales", "Stockout forecast", "Top profit items", "Frequently bought together", "Expiring items"),
        AssistantLang.tl to listOf("Kamusta ang tindahan?", "Benta ngayon", "Ano ang dapat i-restock?", "Pinakamalaking tubo", "Madalas magkasamang bilhin", "Malapit nang ma-expire")
    )

    private val CHIPMAP = mapOf(
        "briefing" to mapOf(
            AssistantLang.en to listOf("Stockout forecast", "Today's sales", "Margin & price audit", "Frequently bought together"),
            AssistantLang.tl to listOf("Kelan mauubos ang stock?", "Benta ngayon", "Suriin ang tubo at presyo", "Madalas magkasamang bilhin")
        ),
        "sales" to mapOf(
            AssistantLang.en to listOf("Yesterday", "Last 7 days", "Compare today vs yesterday", "Category sales"),
            AssistantLang.tl to listOf("Kahapon", "Nakaraang 7 araw", "Ikumpara ang ngayon at kahapon", "Benta bawat kategorya")
        ),
        "low" to mapOf(
            AssistantLang.en to listOf("Stockout forecast", "Expiring items", "Slow moving items", "Inventory value"),
            AssistantLang.tl to listOf("Kelan mauubos ang stock?", "Malapit nang ma-expire", "Mga hindi mabenta", "Halaga ng imbentaryo")
        ),
        "forecast" to mapOf(
            AssistantLang.en to listOf("What should I restock?", "Expiring items", "Best sellers"),
            AssistantLang.tl to listOf("Ano ang dapat i-restock?", "Malapit nang ma-expire", "Pinakamabenta")
        ),
        "closing" to mapOf(
            AssistantLang.en to listOf("Store briefing", "Compare today vs yesterday", "Security health"),
            AssistantLang.tl to listOf("Kamusta ang tindahan?", "Ikumpara ang ngayon at kahapon", "Kalagayan ng seguridad")
        )
    )

    private val TL_WORDS = (
        "ano anong magkano ilan ilang meron mayroon po opo ang ng mga yung ung kahapon kagabi ngayon ngayong kanina linggo lingo buwan benta nabenta mabenta " +
            "pinakamabenta pinaka pinakamalaking kita kinita kumita tubo paubos ubos maubos kulang wala naman lang kumusta kamusta musta salamat paki pakitingnan tingnan tignan sabihin ipakita " +
            "gusto presyo natira puhunan hindi di mo ko namin natin kami sino saan kailan kelan bakit paano pwede puwede sige oo araw paso nakaraang nakaraan nakalipas mamimili suki bayad dagdag " +
            "listahan dapat kailangan tulong magandang umaga tanghali hapon gabi ba pa na sa malapit nang imbentaryo paninda halaga ikumpara kumpara tingi hanap hanapin pila gaano karami lugi " +
            "kategorya kasabay magkasama resibo tindahan kalagayan bilhin suriin sarado kaha remittance"
        ).split(" ").toHashSet()

    private val EN_WORDS = (
        "the what how show sales sale price stock today yesterday please my our items item week month best top low expiring expired restock reorder profit inventory " +
            "sold many much are is any list tell give hello help thanks thank you voided busiest slow moving compare last days day this and about payment payments loss losing held parked " +
            "briefing health status forecast predict bundles combos category categories margin margins cart basket receipt security backup audit shift morning afternoon evening weekend closing eod drawer"
        ).split(" ").toHashSet()

    private val SLANG = mapOf(
        "mgkano" to "magkano", "magkno" to "magkano", "pls" to "please", "plz" to "please",
        "pki" to "paki", "ngyon" to "ngayon", "ngayn" to "ngayon", "ngaun" to "ngayon",
        "khapon" to "kahapon", "kelan" to "kailan", "bnta" to "benta", "pila" to "ilan",
        "tira" to "natira", "stck" to "stock", "qty" to "quantity", "sls" to "sales",
        "prc" to "price", "tnx" to "thanks", "thx" to "thanks", "ty" to "thanks",
        "slamat" to "salamat", "tody" to "today", "todays" to "today", "wk" to "week",
        "mnth" to "month", "restok" to "restock", "forcast" to "forecast",
        "breifing" to "briefing", "recipt" to "receipt", "resibo" to "receipt"
    )

    private val STOP = (
        "the and how much for what price prices stock stocks item items sales sale today many have show tell are you can ang ano anong magkano meron mayroon may mga ilan ilang yung ung nang sa ng na pa po ba " +
            "is of in on to me my our all any available presyo benta check kaya please low out left remaining natira yesterday kahapon kagabi kanina ngayon ngayong araw days day week month year linggo lingo buwan sold nabenta " +
            "last this nakaraang nakaraan nakalipas hm cost wholesale retail bulk tingi quantity pieces pcs find search look lookup list gusto naman lang din rin ito iyan iyon yan yon nito noon pwede puwede paki pakitingnan tingnan " +
            "tignan ipakita sabihin ilista there got does did was were with about from than then also give want need would could should get make made which who when where why sino saan kailan bakit paano per each every hanap hanapin stock"
        ).split(" ").toHashSet()

    private val ALIAS = listOf(
        Regex("""\bcoke\b""") to "coca cola",
        Regex("""\bsardinas\b""") to "sardines",
        Regex("""\bbigas\b""") to "bigas rice",
        Regex("""\bmantika\b""") to "mantika oil",
        Regex("""\bgatas\b""") to "gatas milk",
        Regex("""\btinapay\b""") to "tinapay bread",
        Regex("""\bkape\b""") to "kape coffee",
        Regex("""\btoyo\b""") to "toyo soy sauce",
        Regex("""\bsuka\b""") to "suka vinegar",
        Regex("""\bsabon\b""") to "sabon soap",
        Regex("""\bmanok\b""") to "manok chicken",
        Regex("""\bbaboy\b""") to "baboy pork",
        Regex("""\bitlog\b""") to "itlog egg",
        Regex("""\bpancit\b""") to "pancit noodles",
        Regex("""\bsoftdrinks?\b""") to "coca cola beverages",
        Regex("""\bpanglaba\b""") to "detergent"
    )

    private val RANGE_AWARE = setOf("sales", "profit", "best", "topprofit", "void", "peak", "psales", "payments", "bundles", "category", "daypart")
    private val RANGE_ONLY = Regex("""\b(yesterday|kahapon|kagabi|today|ngayon|ngayong|kanina|araw|nitong|week|linggo|lingo|month|buwan|days?|last|this|nakaraang|nakaraan|nakalipas|all time|overall|lahat|and|then|how about|what about|eh|e|paano|kumusta|kamusta|naman|na|po|ba|kaya|ano|ang|sa|ng|yung|ung|\d+)\b""")

    private fun pinConfigured(settings: StoreSettings): Boolean =
        !settings.adminPinHash.isNullOrBlank() || !settings.adminPin.isNullOrBlank()

    private fun daysSinceBackup(settings: StoreSettings, nowMs: Long): Int? {
        val raw = settings.lastBackup.trim()
        if (raw.isEmpty()) return null
        val ms = PosMath.parseIsoMs(raw)
        if (ms <= 0L) return null
        return max(0, ((nowMs - ms) / PosMath.DAY_MS).toInt())
    }

    fun computeStorePulse(ctx: AssistantContext, nowMs: Long = System.currentTimeMillis()): StorePulseSummary {
        val tStart = PosMath.startOfDayMs(nowMs)
        val tomorrow = tStart + PosMath.DAY_MS
        val todaySales = ctx.sales.filter { it.voided != true && PosMath.inRange(it.dateIso, tStart, tomorrow) }
        val todayStats = PosMath.computeSalesStats(todaySales, ctx.products)
        val trend7 = PosMath.summarize7DayTrend(PosMath.computeLast7DaysNetSales(ctx.sales, nowMs))
        val health = PosMath.computeStockHealthSummary(ctx.products, ctx.sales, ctx.settings, nowMs = nowMs)
        val pinOk = pinConfigured(ctx.settings)
        val backupDays = daysSinceBackup(ctx.settings, nowMs)

        var score = 100
        score -= min(20, health.outCount * 4)
        score -= min(20, health.expiredCount * 8)
        score -= min(10, health.soonCount * 2)
        score -= min(12, health.fastLowCount * 3)
        score -= min(18, health.lossMarginCount * 7)
        if (health.totalSkus > 0 && health.missingCapitalCount > 0) {
            score -= min(10, ((health.missingCapitalCount.toDouble() / health.totalSkus) * 12.0).roundToInt())
        }
        if (!pinOk) score -= 6
        if (backupDays == null || backupDays > 14) score -= 6
        val healthScore = score.coerceIn(0, 100)

        val tone = when {
            healthScore >= 85 -> AssistantTone.emerald
            healthScore >= 65 -> AssistantTone.indigo
            healthScore >= 45 -> AssistantTone.amber
            else -> AssistantTone.rose
        }
        val lblEn = when {
            healthScore >= 85 -> "Excellent"
            healthScore >= 65 -> "Healthy"
            healthScore >= 45 -> "Needs Attention"
            else -> "Critical"
        }
        val lblTl = when {
            healthScore >= 85 -> "Napakaganda"
            healthScore >= 65 -> "Maayos"
            healthScore >= 45 -> "Kailangan ng Pansin"
            else -> "Kritikal"
        }

        val prodMap = PosMath.buildProductMap(ctx.products)
        var nearWhs = 0
        for (line in ctx.cart) {
            val prod = prodMap[line.productId]
            val minQ = (prod?.wholesaleMinQty ?: line.wholesaleMinQty)
            val whs = prod?.wholesalePrice ?: line.wholesalePrice
            val ret = prod?.retailPrice ?: line.retailPrice
            val cap = prod?.capital ?: 0.0
            val valid = whs > 0.0 && whs < ret && !(cap > 0.0 && whs < cap)
            if (!valid || minQ <= 1) continue
            if ((line.qty >= minQ * 0.5 && line.qty < minQ) || (line.qty >= minQ && line.priceType != PriceType.wholesale)) {
                nearWhs++
            }
        }

        val pacePct = if (trend7.average > 0.0) {
            PosMath.round2(((todayStats.net - trend7.average) / trend7.average) * 100.0)
        } else null

        return StorePulseSummary(
            todayNet = todayStats.net,
            todayProfit = todayStats.profit,
            todayOrders = todayStats.count,
            avg7dDaily = trend7.average,
            pacePctVsAvg = pacePct,
            healthScore = healthScore,
            healthTone = tone,
            healthLabelEn = lblEn,
            healthLabelTl = lblTl,
            urgentStockCount = health.outCount + health.expiredCount + health.fastLowCount,
            lowCount = health.lowCount,
            outCount = health.outCount,
            expiredCount = health.expiredCount,
            soonCount = health.soonCount,
            fastLowCount = health.fastLowCount,
            lossCount = health.lossMarginCount,
            missingCapitalCount = health.missingCapitalCount,
            parkedCount = ctx.heldOrders.size,
            cartCount = ctx.cart.size,
            cartNearWholesaleCount = nearWhs,
            pinConfigured = pinOk,
            daysSinceBackup = backupDays
        )
    }

    private fun lev(a: String, b: String): Int {
        val m = a.length
        val n = b.length
        val d = Array(m + 1) { IntArray(n + 1) }
        for (i in 0..m) d[i][0] = i
        for (j in 0..n) d[0][j] = j
        for (i in 1..m) {
            for (j in 1..n) {
                d[i][j] = minOf(
                    d[i - 1][j] + 1,
                    d[i][j - 1] + 1,
                    d[i - 1][j - 1] + if (a[i - 1] == b[j - 1]) 0 else 1
                )
            }
        }
        return d[m][n]
    }

    private fun clampPct(n: Double): Int = if (!n.isFinite()) 0 else n.roundToInt().coerceIn(0, 100)

    class OfflineAssistant {
        private var lang: AssistantLang = AssistantLang.en
        private var lastIntent: String = ""
        private var lastProducts: List<Product> = emptyList()
        private var lastQ: String = ""

        fun reset(newLang: AssistantLang = AssistantLang.en): AssistantReply {
            lang = newLang
            lastIntent = ""
            lastProducts = emptyList()
            lastQ = ""
            return AssistantReply(
                text = if (lang == AssistantLang.tl) {
                    "Kumusta! Ako ang EternalBlue Store AI. Handa akong magbigay ng store briefing, hula kung kelan mauubos ang stock, madalas magkasamang paninda, tubo at margin audit, cart wholesale check, at resibo lookup — 100% offline.\n\nSubukan: \"Kamusta ang tindahan?\", \"Kelan mauubos ang stock?\", o \"Magkano ang Milo?\""
                } else {
                    "Hi! I'm your EternalBlue Store AI. I generate executive briefings, stockout forecasts, bundle affinities, margin audits, category breakdowns, cart wholesale checks, and receipt lookups — strictly read-only and 100% offline.\n\nTry: \"Store briefing\", \"Stockout forecast\", or \"Magkano ang Milo?\""
                },
                lang = lang,
                intent = "",
                chips = DEFAULT_CHIPS[lang] ?: emptyList()
            )
        }

        fun ask(text: String, ctx: AssistantContext): AssistantReply {
            val rawTrimmed = text.trim()
            val q = prep(text)
            val toks = q.split(" ").filter { it.isNotEmpty() }

            lang = ctx.preferredLang ?: detectLang(toks, lang)
            fun t(en: String, tl: String) = if (lang == AssistantLang.tl) tl else en
            fun p(v: Double) = PosMath.formatPeso(v)
            fun orders(c: Int) = t("$c order${if (c == 1) "" else "s"}", "$c order")
            val th = ctx.settings.lowStockThreshold.let { if (it > 0) it else 10.0 }
            val nowMs = System.currentTimeMillis()

            data class DateRange(val key: String, val from: Long, val to: Long, val days: Int, val label: String)

            fun range(rq: String, def: String): DateRange {
                val todayStart = PosMath.startOfDayMs(nowMs)
                val end = todayStart + PosMath.DAY_MS
                if (Regex("""\b(yesterday|kahapon|kagabi)\b""").containsMatchIn(rq)) {
                    return DateRange("yesterday", todayStart - PosMath.DAY_MS, todayStart, 1, t("Yesterday", "Kahapon"))
                }
                val m = Regex("""\b(\d{1,3}) ?(days?|araw)\b""").find(rq)
                if (m != null) {
                    val n = m.groupValues[1].toIntOrNull() ?: 0
                    if (n in 2..365) {
                        return DateRange(if (n == 7) "week" else "n", todayStart - (n - 1) * PosMath.DAY_MS, end, n, t("Last $n days", "Nakaraang $n araw"))
                    }
                }
                if (Regex("""\b(week|linggo|lingo|weekly|7d)\b""").containsMatchIn(rq)) {
                    return DateRange("week", todayStart - 6 * PosMath.DAY_MS, end, 7, t("Last 7 days", "Nakaraang 7 araw"))
                }
                if (Regex("""\b(month|buwan|monthly|30d)\b""").containsMatchIn(rq)) {
                    return DateRange("month", todayStart - 29 * PosMath.DAY_MS, end, 30, t("Last 30 days", "Nakaraang 30 araw"))
                }
                if (Regex("""\ball ?time\b|\boverall\b|\blahat ng\b""").containsMatchIn(rq)) {
                    return DateRange("all", 0L, Long.MAX_VALUE / 2, 0, t("All time", "Lahat ng panahon"))
                }
                if (Regex("""\b(today|ngayon|ngayong|kanina|nitong)\b""").containsMatchIn(rq) || def != "30d") {
                    return DateRange("today", todayStart, end, 1, t("Today", "Ngayong araw"))
                }
                return DateRange("month", todayStart - 29 * PosMath.DAY_MS, end, 30, t("Last 30 days", "Nakaraang 30 araw"))
            }

            fun liveSales(r: DateRange) = ctx.sales.filter { it.voided != true && PosMath.inRange(it.dateIso, r.from, r.to) }

            fun reply(
                intent: String,
                body: String,
                metrics: List<AssistantMetric> = emptyList(),
                bars: List<AssistantBar> = emptyList(),
                actions: List<AssistantAction> = emptyList()
            ): AssistantReply {
                if (intent.isNotEmpty()) lastIntent = intent
                val chips = CHIPMAP[lastIntent]?.get(lang) ?: DEFAULT_CHIPS[lang] ?: emptyList()
                return AssistantReply(body, lang, lastIntent, chips, metrics, bars, actions)
            }

            fun helpText(): String = t(
                "I analyze your saved POS data offline. Try asking:\n• \"Store briefing\" — health score & today's pace\n• \"Stockout forecast\" — days left per SKU\n• \"Frequently bought together\" — combo pairs\n• \"Category sales\" / \"Margin audit\" / \"Daypart breakdown\"\n• \"Check cart\" / \"Receipt OR-...\" / \"Sales last 7 days\"",
                "Sinusuri ko ang POS data mo nang offline. Subukan:\n• \"Kamusta ang tindahan?\" — store health score at benta\n• \"Kelan mauubos ang stock?\" — araw bago maubos\n• \"Madalas magkasamang bilhin\" — combo pairs\n• \"Benta bawat kategorya\" / \"Suriin ang tubo\"\n• \"Suriin ang cart\" / \"Resibo OR-...\" / \"Benta ngayon\""
            )

            if (q.isEmpty()) return reply("", helpText())
            smallTalk(q, toks, ::t)?.let { return reply("", it) }
            if (Regex("""\b(help|menu|tulong|tulungan|what can you do)\b""").containsMatchIn(q)) {
                return reply("", helpText())
            }

            fun run(intent: String, rq: String, ms: List<Product> = emptyList(), catMatch: String = ""): AssistantReply {
                lastIntent = intent
                lastQ = rq
                return when (intent) {
                    "briefing" -> {
                        val pulse = computeStorePulse(ctx, nowMs)
                        val lbl = if (lang == AssistantLang.tl) pulse.healthLabelTl else pulse.healthLabelEn
                        val pace = pulse.pacePctVsAvg?.let {
                            "${if (it >= 0) "+" else ""}${it.roundToInt()}% vs 7d avg"
                        } ?: orders(pulse.todayOrders)
                        val lines = listOf(
                            "${t("Store Executive Briefing", "Buod ng Tindahan")} — ${pulse.healthScore}/100 ($lbl)",
                            "• ${t("Today Net Sales:", "Benta Ngayon:")} ${p(pulse.todayNet)} (${orders(pulse.todayOrders)})",
                            "• ${t("Stock Alerts:", "Stock Alerts:")} ${pulse.outCount} out, ${pulse.lowCount} low, ${pulse.fastLowCount} fast-draining",
                            "• ${t("Shelf & Pricing:", "Shelf:")} ${pulse.expiredCount} expired, ${pulse.soonCount} expiring soon, ${pulse.lossCount} below capital",
                            "• ${t("Safety:", "Seguridad:")} ${if (pulse.pinConfigured) "Manager PIN active" else "No PIN set"} · ${pulse.daysSinceBackup?.let { "Backup ${it}d ago" } ?: "No backup yet"}"
                        )
                        val actions = mutableListOf<AssistantAction>()
                        if (pulse.expiredCount > 0) actions.add(AssistantAction.OpenStockFilter("Expired (${pulse.expiredCount})", StockFilter.EXPIRED))
                        if (pulse.urgentStockCount > 0 || pulse.lowCount > 0) actions.add(AssistantAction.OpenReorder(t("Open Reorder", "Buksan Reorder")))
                        if (pulse.lossCount > 0) actions.add(AssistantAction.OpenStockFilter("Loss (${pulse.lossCount})", StockFilter.LOSS))
                        if (!pulse.pinConfigured || (pulse.daysSinceBackup ?: 99) > 14) actions.add(AssistantAction.OpenSettings(t("Security & Backup", "Seguridad")))

                        val bars = mutableListOf(AssistantBar(t("Store Health Index", "Health Score"), "${pulse.healthScore}%", pulse.healthScore, pulse.healthTone))
                        if (pulse.avg7dDaily > 0.0) {
                            bars.add(AssistantBar(t("Today vs 7d Avg", "Ngayon vs 7d Avg"), "${p(pulse.todayNet)} / ${p(pulse.avg7dDaily)}", clampPct((pulse.todayNet / pulse.avg7dDaily) * 100.0), if (pulse.todayNet >= pulse.avg7dDaily) AssistantTone.emerald else AssistantTone.indigo))
                        }
                        reply(
                            intent, lines.joinToString("\n"),
                            metrics = listOf(
                                AssistantMetric(t("Health Score", "Health Score"), "${pulse.healthScore}/100", lbl, pulse.healthTone),
                                AssistantMetric(t("Today Net", "Benta Ngayon"), p(pulse.todayNet), pace, AssistantTone.emerald),
                                AssistantMetric(t("Urgent Alerts", "Agarang Aksyon"), "${pulse.urgentStockCount + pulse.lossCount}", "${pulse.outCount} out · ${pulse.expiredCount} exp", if (pulse.urgentStockCount + pulse.lossCount > 0) AssistantTone.rose else AssistantTone.emerald),
                                AssistantMetric(t("Parked", "Naka-Hold"), "${pulse.parkedCount}", t("orders waiting", "order"), AssistantTone.neutral)
                            ),
                            bars = bars,
                            actions = actions.take(4)
                        )
                    }
                    "forecast" -> {
                        val ro = PosMath.computeReorderList(ctx.products, ctx.sales, ctx.settings, nowMs)
                        val vel = PosMath.computeProductVelocities(ctx.products, ctx.sales, nowMs)
                        if (!vel.hasSalesInWindow) {
                            return reply(
                                intent,
                                t("Stockout velocity needs at least 1 sale in the last 30 days.", "Kailangan ng benta sa nakaraang 30 araw para sa stockout forecast."),
                                actions = listOf(
                                    AssistantAction.OpenStockFilter(t("View Low Stock", "Mababang Stock"), StockFilter.LOW),
                                    AssistantAction.OpenBatchRestock(t("Batch Restock", "Sabayang Restock"))
                                )
                            )
                        }
                        val leadSafety = ctx.settings.reorderLeadDays + ctx.settings.reorderSafetyDays
                        val candidates = ctx.products.mapNotNull { pr ->
                            vel.byId[pr.id]?.takeIf { it.avgDaily > 0.0 }?.let { pr to it }
                        }.sortedBy { it.second.daysOfCover ?: 999.0 }
                        val critical = candidates.count { (it.second.daysOfCover ?: 999.0) <= leadSafety }
                        val totalCost = PosMath.sumPeso(ro.rows) { it.cost ?: 0.0 }
                        val topList = candidates.take(6)
                        val lines = mutableListOf(t("Stockout Forecast (${vel.windowDays}d pace) · $critical urgent (<= ${leadSafety}d)", "Hula ng Stockout (${vel.windowDays}d) · $critical agaran"))
                        topList.forEachIndexed { idx, (pr, v) ->
                            val d = v.daysOfCover ?: 0.0
                            val dTxt = if (d <= 0.0) t("OUT NOW", "UBOS NA") else String.format(Locale.US, "~%.1fd left", d)
                            lines.add("${idx + 1}. ${pr.name} — $dTxt (${PosMath.formatQty(pr.stock, pr.unit)})")
                        }
                        reply(
                            intent, lines.joinToString("\n"),
                            metrics = listOf(
                                AssistantMetric("Urgent (<= ${leadSafety}d)", "$critical", tone = if (critical > 0) AssistantTone.rose else AssistantTone.emerald),
                                AssistantMetric("Reorder SKUs", "${ro.rows.size}", tone = AssistantTone.indigo),
                                AssistantMetric("Est. Cost", p(totalCost), tone = AssistantTone.amber)
                            ),
                            bars = topList.take(5).map { (pr, v) ->
                                val d = max(0.0, v.daysOfCover ?: 0.0)
                                AssistantBar(pr.name, if (d <= 0.0) "0d (OUT)" else String.format(Locale.US, "%.1fd", d), max(4, clampPct((d / 14.0) * 100.0)), when {
                                    d <= 2.0 -> AssistantTone.rose
                                    d <= leadSafety -> AssistantTone.amber
                                    else -> AssistantTone.emerald
                                })
                            },
                            actions = listOf(
                                AssistantAction.OpenReorder(t("Open Smart Reorder", "Buksan Smart Reorder")),
                                AssistantAction.OpenStockFilter(t("Filter Fast-Draining", "Paubos na"), StockFilter.FAST_LOW),
                                AssistantAction.OpenBatchRestock(t("Batch Receive", "Mag-receive"))
                            )
                        )
                    }
                    "bundles" -> {
                        val r = range(rq, "30d")
                        val list = liveSales(r).filter { it.items.size >= 2 }
                        if (list.isEmpty()) return reply(intent, t("No multi-item receipts in ${r.label} yet.", "Wala pang resibo na may 2+ item sa ${r.label}."))
                        val counts = HashMap<String, Int>()
                        val names = HashMap<String, String>()
                        for (s in list) {
                            val keys = s.items.map { it.productId ?: it.name }.distinct().sorted()
                            val nByKey = s.items.associate { (it.productId ?: it.name) to it.name }
                            for (i in keys.indices) {
                                for (j in i + 1 until keys.size) {
                                    val pk = "${keys[i]}||${keys[j]}"
                                    counts[pk] = (counts[pk] ?: 0) + 1
                                    names[pk] = "${nByKey[keys[i]]} + ${nByKey[keys[j]]}"
                                }
                            }
                        }
                        val topPairs = counts.entries.sortedByDescending { it.value }.take(6)
                        if (topPairs.isEmpty()) return reply(intent, t("No item pair patterns found yet.", "Wala pang pares na madalas bilhin."))
                        val maxC = topPairs.first().value.toDouble()
                        val lines = mutableListOf(t("Frequently Bought Together — ${r.label}", "Madalas Magkasamang Bilhin — ${r.label}"))
                        topPairs.forEachIndexed { idx, e -> lines.add("${idx + 1}. ${names[e.key]} — ${e.value}x") }
                        reply(
                            intent, lines.joinToString("\n"),
                            metrics = listOf(
                                AssistantMetric(t("2+ Item Orders", "2+ Item Orders"), "${list.size}", tone = AssistantTone.indigo),
                                AssistantMetric(t("Top Pair", "Top Pair"), "${topPairs.first().value}x", names[topPairs.first().key], AssistantTone.emerald)
                            ),
                            bars = topPairs.take(4).map { AssistantBar(names[it.key] ?: "", "${it.value}x", clampPct((it.value / maxC) * 100.0), AssistantTone.indigo) },
                            actions = listOf(AssistantAction.OpenSales(t("Inspect Receipts", "Tingnan ang Resibo")))
                        )
                    }
                    "category" -> {
                        val r = range(rq, "30d")
                        val list = liveSales(r)
                        val st = PosMath.computeSalesStats(list, ctx.products)
                        if (catMatch.isNotEmpty()) {
                            val catProds = ctx.products.filter { it.category.equals(catMatch, ignoreCase = true) }
                            val catRev = st.cats.entries.find { it.key.equals(catMatch, ignoreCase = true) }?.value ?: 0.0
                            val stockVal = PosMath.sumPeso(catProds) { PosMath.lineTotalPeso(it.retailPrice, it.stock) }
                            val lowC = catProds.count { it.stock <= th }
                            return reply(
                                intent, "$catMatch — ${r.label}\n• Sales: ${p(catRev)}\n• SKUs: ${catProds.size} ($lowC low/out)\n• Stock Value: ${p(stockVal)}",
                                metrics = listOf(
                                    AssistantMetric("Sales", p(catRev), tone = AssistantTone.emerald),
                                    AssistantMetric("SKUs", "${catProds.size}", "$lowC low/out", if (lowC > 0) AssistantTone.amber else AssistantTone.neutral),
                                    AssistantMetric("Stock Value", p(stockVal), tone = AssistantTone.indigo)
                                )
                            )
                        }
                        if (list.isEmpty()) return reply(intent, t("No category sales recorded in ${r.label}.", "Wala pang benta bawat kategorya sa ${r.label}."))
                        val sorted = st.cats.entries.sortedByDescending { it.value }
                        val tot = sorted.sumOf { it.value }.coerceAtLeast(1.0)
                        val lines = listOf(t("Category Revenue — ${r.label}", "Benta Bawat Kategorya — ${r.label}")) +
                            sorted.take(7).mapIndexed { i, e -> "${i + 1}. ${e.key} — ${p(e.value)} (${((e.value / tot) * 100.0).roundToInt()}%)" }
                        reply(
                            intent, lines.joinToString("\n"),
                            bars = sorted.take(5).map { AssistantBar(it.key, p(it.value), clampPct((it.value / tot) * 100.0), AssistantTone.emerald) },
                            actions = listOf(AssistantAction.OpenSales(t("Open Sales", "Buksan Sales")))
                        )
                    }
                    "margins" -> {
                        val withCap = ctx.products.filter { (it.capital ?: 0.0) > 0.0 && it.retailPrice > 0.0 }
                        val missingCap = ctx.products.count { (it.capital ?: 0.0) <= 0.0 }
                        val lossItems = withCap.filter { it.retailPrice < it.capital!! || (it.wholesalePrice > 0.0 && it.wholesalePrice < it.capital!!) }
                        val thinCount = withCap.count { pr ->
                            val m = ((pr.retailPrice - pr.capital!!) / pr.retailPrice) * 100.0
                            m >= 0.0 && m < 10.0
                        }
                        val scCount = ctx.products.count { PosMath.scEligibleProduct(it) }
                        val lines = listOf(
                            t("Margin & Pricing Audit", "Pagsusuri sa Tubo at Presyo"),
                            "• ${t("Loss-priced (< capital):", "Lugi:")} ${lossItems.size}",
                            "• ${t("Thin margin (0–10%):", "Manipis (0–10%):")} $thinCount",
                            "• ${t("Missing capital:", "Walang puhunan:")} $missingCap · SC/PWD eligible: $scCount"
                        )
                        val actions = mutableListOf<AssistantAction>()
                        if (lossItems.isNotEmpty()) actions.add(AssistantAction.OpenStockFilter("Loss (${lossItems.size})", StockFilter.LOSS))
                        if (missingCap > 0) actions.add(AssistantAction.OpenStockFilter("No Capital ($missingCap)", StockFilter.NO_CAP))
                        actions.add(AssistantAction.OpenScReview("Review SC/PWD"))
                        reply(
                            intent, lines.joinToString("\n"),
                            metrics = listOf(
                                AssistantMetric("Below Capital", "${lossItems.size}", tone = if (lossItems.isNotEmpty()) AssistantTone.rose else AssistantTone.emerald),
                                AssistantMetric("Thin (<10%)", "$thinCount", tone = if (thinCount > 0) AssistantTone.amber else AssistantTone.emerald),
                                AssistantMetric("No Capital", "$missingCap", tone = if (missingCap > 0) AssistantTone.indigo else AssistantTone.emerald),
                                AssistantMetric("SC/PWD SKUs", "$scCount")
                            ),
                            actions = actions
                        )
                    }
                    "cart" -> {
                        val cart = ctx.cart
                        if (cart.isEmpty()) {
                            return reply(
                                intent,
                                t("Your POS basket is currently empty.", "Walang laman ang POS basket ngayon."),
                                actions = listOfNotNull(
                                    AssistantAction.OpenScanner(t("Open Scanner", "Buksan Scanner")),
                                    if (ctx.heldOrders.isNotEmpty()) AssistantAction.OpenHeld(t("Parked (${ctx.heldOrders.size})", "Naka-Hold (${ctx.heldOrders.size})")) else null
                                )
                            )
                        }
                        val prodMap = PosMath.buildProductMap(ctx.products)
                        val totals = PosMath.computeCartTotals(cart, prodMap, false, ctx.settings)
                        val scTotals = PosMath.computeCartTotals(cart, prodMap, true, ctx.settings)
                        val lines = listOf(
                            t("Active Cart Audit (${cart.size} lines)", "Pagsusuri sa Cart (${cart.size} items)"),
                            "• ${t("Current Total:", "Kabuuan:")} ${p(totals.grandTotal)}",
                            "• ${t("If Senior/PWD 5%:", "Kung may Senior/PWD 5%:")} ${p(scTotals.grandTotal)} (disc ${p(scTotals.seniorDiscount)})"
                        )
                        reply(
                            intent, lines.joinToString("\n"),
                            metrics = listOf(
                                AssistantMetric("Cart Lines", "${cart.size}"),
                                AssistantMetric("Net Total", p(totals.grandTotal), tone = AssistantTone.emerald),
                                AssistantMetric("SC/PWD 5%", p(scTotals.seniorDiscount), tone = AssistantTone.indigo)
                            )
                        )
                    }
                    "closing" -> {
                        val tStart = PosMath.startOfDayMs(nowMs)
                        val tEnd = tStart + PosMath.DAY_MS
                        val todayAll = ctx.sales.filter { PosMath.inRange(it.dateIso, tStart, tEnd) }
                        val live = todayAll.filter { it.voided != true }
                        val st = PosMath.computeSalesStats(live, ctx.products)
                        val drawer = PosMath.computeCashDrawerSummary(ctx.sales, tStart, tEnd, emptyMap(), 0.0)
                        val digitalNet = PosMath.round2(max(0.0, st.net - drawer.expectedCashSales))
                        val lines = listOf(
                            t("End-of-Day Closing Summary", "Buod ng Pagsasara"),
                            "• ${t("Net Sales Today:", "Benta Ngayon:")} ${p(st.net)} (${orders(st.count)})",
                            "• ${t("Expected Cash Sales:", "Inaasahang Cash:")} ${p(drawer.expectedCashSales)}",
                            "• ${t("Digital / Other:", "GCash / Card:")} ${p(digitalNet)}",
                            "• ${t("Est. Profit:", "Tubo:")} ${p(st.profit)}"
                        )
                        reply(
                            intent, lines.joinToString("\n"),
                            metrics = listOf(
                                AssistantMetric("Expected Cash", p(drawer.expectedCashSales), tone = AssistantTone.emerald),
                                AssistantMetric("Digital / Card", p(digitalNet), tone = AssistantTone.indigo),
                                AssistantMetric("Today Profit", p(st.profit), orders(st.count))
                            ),
                            actions = listOf(
                                AssistantAction.OpenCashDrawer(t("Cash Count", "Bilangin ang Cash")),
                                AssistantAction.OpenXRead(t("X-Read Report", "X-Read")),
                                AssistantAction.OpenZRead(t("Run Z-Read", "Z-Read")),
                                AssistantAction.OpenSettings(t("Backup Vault", "Mag-Backup"))
                            )
                        )
                    }
                    "daypart" -> {
                        val r = range(rq, "30d")
                        val list = liveSales(r)
                        if (list.isEmpty()) return reply(intent, t("No sales found for ${r.label}.", "Wala pang benta sa ${r.label}."))
                        val sums = DoubleArray(4)
                        val counts = IntArray(4)
                        val labels = listOf(
                            t("Morning (5AM–12PM)", "Umaga (5AM–12PM)"),
                            t("Afternoon (12PM–5PM)", "Hapon (12PM–5PM)"),
                            t("Evening (5PM–10PM)", "Gabi (5PM–10PM)"),
                            t("Late Night (10PM–5AM)", "Madaling-araw (10PM–5AM)")
                        )
                        val zone = ZoneId.systemDefault()
                        for (s in list) {
                            val h = Instant.ofEpochMilli(PosMath.parseIsoMs(s.dateIso)).atZone(zone).hour
                            val idx = when {
                                h in 5..11 -> 0
                                h in 12..16 -> 1
                                h in 17..21 -> 2
                                else -> 3
                            }
                            sums[idx] += s.grandTotal
                            counts[idx]++
                        }
                        val tot = sums.sum().coerceAtLeast(1.0)
                        val ordered = (0..3).sortedByDescending { sums[it] }
                        val lines = listOf("Shift & Daypart Breakdown — ${r.label}") +
                            ordered.map { i -> "• ${labels[i]}: ${p(PosMath.round2(sums[i]))} (${orders(counts[i])})" }
                        reply(
                            intent, lines.joinToString("\n"),
                            bars = ordered.map { i -> AssistantBar(labels[i], p(PosMath.round2(sums[i])), clampPct((sums[i] / tot) * 100.0), AssistantTone.indigo) }
                        )
                    }
                    "receipt" -> {
                        val orMatch = Regex("""\bOR[-\s]?(\d{6})[-\s]?(\d{1,5})\b""", RegexOption.IGNORE_CASE).find(rawTrimmed)
                        val numMatch = Regex("""\b(\d{4,6})\b""").find(q)
                        var found: SaleRecord? = null
                        if (orMatch != null) {
                            val target = "OR-${orMatch.groupValues[1]}-${orMatch.groupValues[2].padStart(4, '0')}".uppercase()
                            found = ctx.sales.find { it.receiptNo.equals(target, ignoreCase = true) }
                        }
                        if (found == null && numMatch != null) {
                            found = ctx.sales.find { it.receiptNo.contains(numMatch.groupValues[1], ignoreCase = true) }
                        }
                        if (found == null && ctx.sales.isNotEmpty() && Regex("""\b(last|latest|pinakahuli|huling)\b""").containsMatchIn(q)) {
                            found = ctx.sales.last()
                        }
                        if (found == null) {
                            return reply(
                                intent,
                                t("Tell me a receipt number (e.g. \"receipt OR-261117-0001\") to inspect it.", "Ilagay ang receipt number para mahanap."),
                                actions = listOf(AssistantAction.OpenSales(t("Browse Receipts", "Lahat ng Resibo")))
                            )
                        }
                        val lines = mutableListOf("${found.receiptNo}${if (found.voided == true) " [VOIDED]" else ""} — ${found.dateFormatted}")
                        lines.add("• Total: ${p(found.grandTotal)} (${found.paymentMethod})")
                        found.items.take(5).forEach { lines.add("  • ${PosMath.formatQty(it.qty, it.unit)} × ${it.name} = ${p(it.lineTotal)}") }
                        reply(
                            intent, lines.joinToString("\n"),
                            metrics = listOf(
                                AssistantMetric("Total", p(found.grandTotal), tone = if (found.voided == true) AssistantTone.rose else AssistantTone.emerald),
                                AssistantMetric("Payment", found.paymentMethod, tone = AssistantTone.indigo),
                                AssistantMetric("Items", "${found.items.size}")
                            ),
                            actions = listOf(AssistantAction.OpenReceipt("Open ${found.receiptNo}", found.receiptNo))
                        )
                    }
                    "security" -> {
                        val pinOk = pinConfigured(ctx.settings)
                        val backupDays = daysSinceBackup(ctx.settings, nowMs)
                        val lines = listOf(
                            t("Security & Data Protection Audit", "Seguridad at Backup"),
                            "• Manager PIN: ${if (pinOk) ctx.settings.adminPinAlgo ?: "Active" else "Not set yet"}",
                            "• Biometric Unlock: ${if (ctx.settings.biometricEnabled) "Enabled" else "Off"}",
                            "• Last Backup: ${backupDays?.let { "${it}d ago" } ?: "None recorded"}",
                            "• Logs: ${ctx.securityLog.size} security · ${ctx.stockLog.size} stock movements"
                        )
                        reply(
                            intent, lines.joinToString("\n"),
                            metrics = listOf(
                                AssistantMetric("Manager PIN", if (pinOk) "Active" else "Off", tone = if (pinOk) AssistantTone.emerald else AssistantTone.amber),
                                AssistantMetric("Backup Age", backupDays?.let { "${it}d" } ?: "Never", tone = if (backupDays != null && backupDays <= 7) AssistantTone.emerald else AssistantTone.amber)
                            ),
                            actions = listOfNotNull(
                                AssistantAction.OpenSettings(t("Open Security & Vault", "Seguridad at Vault")),
                                if (ctx.stockLog.isNotEmpty()) AssistantAction.OpenStockLog(t("View Stock Log", "Stock History")) else null
                            )
                        )
                    }
                    "sales" -> {
                        val r = range(rq, "today")
                        val list = liveSales(r)
                        if (list.isEmpty()) return reply(intent, t("No sales recorded for ${r.label} yet.", "Wala pang benta para sa ${r.label}."))
                        val st = PosMath.computeSalesStats(list, ctx.products)
                        val lines = mutableListOf(
                            r.label,
                            "• ${t("Net sales:", "Netong benta:")} ${p(st.net)} (${orders(st.count)})",
                            "• ${t("Profit:", "Tubo:")} ${p(st.profit)}",
                            "• ${t("Avg basket:", "Avg basket:")} ${p(st.net / max(1, st.count))}"
                        )
                        val top = st.products.entries.sortedByDescending { it.value.amt }.take(3)
                        if (top.isNotEmpty()) lines.add("• Top: ${top.joinToString("; ") { "${it.key} (${PosMath.formatQty(it.value.qty, it.value.unit)})" }}")
                        reply(
                            intent, lines.joinToString("\n"),
                            metrics = listOf(
                                AssistantMetric("Net Sales", p(st.net), orders(st.count), AssistantTone.emerald),
                                AssistantMetric("Profit", p(st.profit), tone = AssistantTone.indigo),
                                AssistantMetric("Avg Basket", p(st.net / max(1, st.count)))
                            ),
                            actions = listOf(AssistantAction.OpenSales(t("Open Sales Dashboard", "Buksan ang Sales")))
                        )
                    }
                    "payments" -> {
                        val r = range(rq, "today")
                        val list = liveSales(r)
                        if (list.isEmpty()) return reply(intent, t("No payments recorded for ${r.label}.", "Wala pang bayad sa ${r.label}."))
                        val st = PosMath.computeSalesStats(list, ctx.products)
                        val entries = st.tender.entries.sortedByDescending { it.value.amt }
                        val tot = st.net.coerceAtLeast(1.0)
                        val lines = listOf("Payments — ${r.label}") + entries.map { "• ${it.key}: ${p(it.value.amt)} (${orders(it.value.count)})" }
                        reply(
                            intent, lines.joinToString("\n"),
                            bars = entries.map { AssistantBar(it.key, "${p(it.value.amt)} (${it.value.count})", clampPct((it.value.amt / tot) * 100.0), if (it.key == "GCash") AssistantTone.indigo else AssistantTone.emerald) }
                        )
                    }
                    "profit" -> {
                        val r = range(rq, "today")
                        val st = PosMath.computeSalesStats(liveSales(r), ctx.products)
                        val p30 = PosMath.profitLastDays(ctx.sales, ctx.products, 30, nowMs)
                        if (p30 == null) {
                            return reply(
                                intent,
                                t("Profit (${r.label}): ${p(st.profit)}. Set capital on items in Stock to compute profit.", "Lagyan ng puhunan ang mga item sa Stock para makuwenta ang tubo."),
                                actions = listOf(AssistantAction.OpenStockFilter(t("Set Capital", "Lagyan ng Puhunan"), StockFilter.NO_CAP))
                            )
                        }
                        reply(
                            intent, t("Profit (${r.label}): ${p(st.profit)} on sales of ${p(st.net)}. Last 30 days: ${p(p30)}.", "Tubo (${r.label}): ${p(st.profit)}. Nakaraang 30 araw: ${p(p30)}."),
                            metrics = listOf(
                                AssistantMetric(r.label, p(st.profit), tone = AssistantTone.emerald),
                                AssistantMetric("30-Day Profit", p(p30), tone = AssistantTone.indigo)
                            )
                        )
                    }
                    "loss" -> {
                        val bad = ctx.products.filter { (it.capital ?: 0.0) > 0.0 && (it.retailPrice < it.capital!! || (it.wholesalePrice > 0.0 && it.wholesalePrice < it.capital!!)) }
                        if (bad.isEmpty()) return reply(intent, t("No items are priced below capital.", "Walang panindang lugi sa puhunan."))
                        reply(
                            intent,
                            t("Items priced below capital (${bad.size}):\n", "Mga panindang lugi (${bad.size}):\n") +
                                bad.take(6).joinToString("\n") { "• ${it.name}: cap ${p(it.capital ?: 0.0)} vs retail ${p(it.retailPrice)}" },
                            actions = listOf(AssistantAction.OpenStockFilter("Fix Loss (${bad.size})", StockFilter.LOSS))
                        )
                    }
                    "held" -> {
                        if (ctx.heldOrders.isEmpty()) return reply(intent, t("No parked/held orders right now.", "Walang naka-hold na order ngayon."))
                        reply(
                            intent,
                            t("Parked orders (${ctx.heldOrders.size}):\n", "Naka-hold na orders (${ctx.heldOrders.size}):\n") +
                                ctx.heldOrders.take(6).joinToString("\n") { "• ${it.label ?: it.id} (${it.time}): ${it.items.size} items, ${p(it.total)}" },
                            actions = listOf(AssistantAction.OpenHeld(t("Open Parked Orders", "Buksan Naka-Hold")))
                        )
                    }
                    "low" -> {
                        val out = ctx.products.filter { it.stock <= 0.0 }
                        val low = ctx.products.filter { it.stock > 0.0 && StockAlerts.isProductLowStock(it, th) }.sortedBy { it.stock }
                        val ro = PosMath.computeReorderList(ctx.products, ctx.sales, ctx.settings, nowMs)
                        val lines = mutableListOf(
                            "Stock check (threshold $th)",
                            "• Out of stock: ${out.size}",
                            "• Low stock: ${low.size}"
                        )
                        if (ro.rows.isNotEmpty()) {
                            lines.add("Suggested reorder:")
                            ro.rows.take(5).forEach { lines.add("• ${it.p.name}: order ${PosMath.formatQty(it.suggest, it.p.unit)}") }
                        }
                        val actions = mutableListOf<AssistantAction>(AssistantAction.OpenReorder(t("Open Reorder List", "Buksan Reorder")))
                        if (out.isNotEmpty()) actions.add(AssistantAction.OpenStockFilter("Out (${out.size})", StockFilter.OUT))
                        if (low.isNotEmpty()) actions.add(AssistantAction.OpenStockFilter("Low (${low.size})", StockFilter.LOW))
                        reply(
                            intent, lines.joinToString("\n"),
                            metrics = listOf(
                                AssistantMetric("Out of Stock", "${out.size}", tone = if (out.isNotEmpty()) AssistantTone.rose else AssistantTone.emerald),
                                AssistantMetric("Low Stock", "${low.size}", tone = if (low.isNotEmpty()) AssistantTone.amber else AssistantTone.emerald),
                                AssistantMetric("Suggested Order", "${ro.rows.size}", tone = AssistantTone.indigo)
                            ),
                            actions = actions
                        )
                    }
                    "expiry" -> {
                        val warn = ctx.settings.expiryWarnDays.coerceAtLeast(1)
                        val rows = ctx.products.map { it to PosMath.expiryInfo(it, warn) }
                            .filter { it.second.status == PosMath.ExpiryState.EXPIRED || it.second.status == PosMath.ExpiryState.SOON }
                            .sortedBy { it.second.days ?: 0L }
                        if (rows.isEmpty()) return reply(intent, t("No items are expired or expiring soon.", "Walang paso o malapit ma-expire."))
                        val ex = rows.filter { it.second.status == PosMath.ExpiryState.EXPIRED }
                        val so = rows.filter { it.second.status == PosMath.ExpiryState.SOON }
                        val lines = mutableListOf<String>()
                        if (ex.isNotEmpty()) {
                            lines.add("Expired (${ex.size}):")
                            ex.take(6).forEach { lines.add("• ${it.first.name} (${it.first.expiry})") }
                        }
                        if (so.isNotEmpty()) {
                            lines.add("Expiring within ${warn}d (${so.size}):")
                            so.take(6).forEach { lines.add("• ${it.first.name} (${it.second.days}d left)") }
                        }
                        val actions = mutableListOf<AssistantAction>()
                        if (ex.isNotEmpty()) actions.add(AssistantAction.OpenStockFilter("Expired (${ex.size})", StockFilter.EXPIRED))
                        if (so.isNotEmpty()) actions.add(AssistantAction.OpenStockFilter("Expiring Soon (${so.size})", StockFilter.SOON))
                        reply(
                            intent, lines.joinToString("\n"),
                            metrics = listOf(
                                AssistantMetric("Expired", "${ex.size}", tone = if (ex.isNotEmpty()) AssistantTone.rose else AssistantTone.emerald),
                                AssistantMetric("Expiring Soon", "${so.size}", tone = if (so.isNotEmpty()) AssistantTone.amber else AssistantTone.emerald)
                            ),
                            actions = actions
                        )
                    }
                    "best" -> {
                        val r = range(rq, "30d")
                        val list = liveSales(r)
                        if (list.isEmpty()) return reply(intent, t("No sales found for ${r.label} yet.", "Wala pang benta sa ${r.label}."))
                        val st = PosMath.computeSalesStats(list, ctx.products)
                        val top = st.products.entries.sortedByDescending { it.value.amt }.take(7)
                        val maxA = top.firstOrNull()?.value?.amt?.coerceAtLeast(1.0) ?: 1.0
                        reply(
                            intent,
                            "Best sellers — ${r.label}\n" + top.mapIndexed { i, e -> "${i + 1}. ${e.key} — ${PosMath.formatQty(e.value.qty, e.value.unit)}, ${p(e.value.amt)}" }.joinToString("\n"),
                            bars = top.take(5).map { AssistantBar(it.key, p(it.value.amt), clampPct((it.value.amt / maxA) * 100.0), AssistantTone.emerald) }
                        )
                    }
                    "topprofit" -> {
                        val r = range(rq, "30d")
                        val pr = PosMath.computeProfitRanking(liveSales(r), ctx.products)
                        if (pr.ranked.isEmpty()) {
                            return reply(
                                intent,
                                t("No profit data for ${r.label}. Set capital in Stock first.", "Walang datos ng tubo. Lagyan ng puhunan ang mga item."),
                                actions = listOf(AssistantAction.OpenStockFilter("Set Capital", StockFilter.NO_CAP))
                            )
                        }
                        val top = pr.ranked.take(7)
                        val maxP = top.first().profit.coerceAtLeast(1.0)
                        reply(
                            intent,
                            "Top profit — ${r.label}\n" + top.mapIndexed { i, x -> "${i + 1}. [${x.cls}] ${x.name} — ${p(x.profit)}" }.joinToString("\n"),
                            bars = top.take(5).map { AssistantBar("[${it.cls}] ${it.name}", p(it.profit), clampPct((it.profit / maxP) * 100.0), if (it.cls == "A") AssistantTone.emerald else AssistantTone.indigo) }
                        )
                    }
                    "void" -> {
                        val r = range(rq, "today")
                        val vo = ctx.sales.filter { it.voided == true && PosMath.inRange(it.dateIso, r.from, r.to) }
                        if (vo.isEmpty()) return reply(intent, t("No voided sales for ${r.label}.", "Walang na-void na benta sa ${r.label}."))
                        reply(
                            intent,
                            "Voided (${vo.size}) — ${p(PosMath.sumPeso(vo) { it.grandTotal })}\n" + vo.take(6).joinToString("\n") { "• ${it.receiptNo} ${p(it.grandTotal)}" },
                            actions = listOf(
                                AssistantAction.OpenReceipt("Inspect ${vo.first().receiptNo}", vo.first().receiptNo),
                                AssistantAction.OpenSales("Open Sales")
                            )
                        )
                    }
                    "inventory" -> {
                        val valRet = PosMath.sumPeso(ctx.products) { PosMath.lineTotalPeso(it.retailPrice, it.stock) }
                        val cap = PosMath.sumPeso(ctx.products) { if ((it.capital ?: 0.0) > 0.0) PosMath.lineTotalPeso(it.capital!!, it.stock) else 0.0 }
                        val nOut = ctx.products.count { it.stock <= 0.0 }
                        val nLow = ctx.products.count { it.stock > 0.0 && StockAlerts.isProductLowStock(it, th) }
                        reply(
                            intent,
                            t("Inventory\n• SKUs: ${ctx.products.size}\n• Retail Value: ${p(valRet)}\n• Capital in Stock: ${p(cap)}\n• Out: $nOut · Low: $nLow", "Imbentaryo\n• SKUs: ${ctx.products.size}\n• Halaga: ${p(valRet)}\n• Puhunan: ${p(cap)}"),
                            metrics = listOf(
                                AssistantMetric("Total SKUs", "${ctx.products.size}"),
                                AssistantMetric("Retail Value", p(valRet), tone = AssistantTone.emerald),
                                AssistantMetric("Capital Value", p(cap), tone = AssistantTone.indigo)
                            ),
                            actions = listOf(
                                AssistantAction.OpenCsvImport("CSV Import"),
                                AssistantAction.OpenStockLog("Stock Log")
                            )
                        )
                    }
                    "slow" -> {
                        val r = range("30 days", "30d")
                        val list = liveSales(r)
                        val slow = ctx.products.filter { it.stock > 0.0 && itemSales(list, it).first == 0.0 }
                        if (slow.isEmpty()) return reply(intent, t("Every in-stock item sold at least once in 30 days.", "Lahat ng may stock ay nabenta sa nakaraang 30 araw."))
                        reply(
                            intent,
                            t("Slow movers (${slow.size}):\n", "Hindi nabebenta (${slow.size}):\n") +
                                slow.take(6).joinToString("\n") { "• ${it.name}: ${PosMath.formatQty(it.stock, it.unit)}" },
                            actions = listOf(AssistantAction.OpenStockFilter("View Dead Stock", StockFilter.DEAD))
                        )
                    }
                    "peak" -> {
                        val r = range(rq, "30d")
                        val st = PosMath.computeSalesStats(liveSales(r), ctx.products)
                        val hrs = st.hours.entries.sortedByDescending { it.value }.take(5)
                        if (hrs.isEmpty()) return reply(intent, t("No sales for ${r.label} yet.", "Wala pang benta sa ${r.label}."))
                        val maxH = hrs.first().value.coerceAtLeast(1.0)
                        fun lab(h: Int) = "${if (h % 12 == 0) 12 else h % 12} ${if (h < 12) "AM" else "PM"}"
                        reply(
                            intent,
                            "Busiest hours — ${r.label}\n" + hrs.take(3).mapIndexed { i, e -> "${i + 1}. ${lab(e.key)} — ${p(e.value)}" }.joinToString("\n"),
                            bars = hrs.take(4).map { AssistantBar(lab(it.key), p(it.value), clampPct((it.value / maxH) * 100.0), AssistantTone.indigo) }
                        )
                    }
                    "compare" -> {
                        val todayStart = PosMath.startOfDayMs(nowMs)
                        val tomorrow = todayStart + PosMath.DAY_MS
                        val yest = todayStart - PosMath.DAY_MS
                        val a = PosMath.computeSalesStats(ctx.sales.filter { it.voided != true && PosMath.inRange(it.dateIso, todayStart, tomorrow) }, ctx.products)
                        val b = PosMath.computeSalesStats(ctx.sales.filter { it.voided != true && PosMath.inRange(it.dateIso, yest, todayStart) }, ctx.products)
                        val deltaStr = if (b.net > 0.0) {
                            val pct = ((a.net - b.net) / b.net) * 100.0
                            "${if (a.net >= b.net) "▲" else "▼"} ${String.format(Locale.US, "%.1f", abs(pct))}%"
                        } else "n/a"
                        reply(
                            intent,
                            t("Today vs Yesterday\n• Net sales: ${p(a.net)} vs ${p(b.net)} ($deltaStr)\n• Orders: ${a.count} vs ${b.count}", "Ngayon vs Kahapon\n• Benta: ${p(a.net)} vs ${p(b.net)} ($deltaStr)"),
                            metrics = listOf(
                                AssistantMetric("Today Net", p(a.net), orders(a.count), if (a.net >= b.net) AssistantTone.emerald else AssistantTone.amber),
                                AssistantMetric("Yesterday Net", p(b.net), orders(b.count)),
                                AssistantMetric("Delta", deltaStr, tone = if (a.net >= b.net) AssistantTone.emerald else AssistantTone.rose)
                            )
                        )
                    }
                    "psales" -> {
                        lastProducts = ms
                        val r = range(rq, "today")
                        val list = liveSales(r)
                        reply(
                            intent,
                            r.label + "\n" + ms.take(4).joinToString("\n") { prod ->
                                val (qty, amt) = itemSales(list, prod)
                                "• ${prod.name}: sold ${PosMath.formatQty(qty, prod.unit)} (${p(amt)}), left ${PosMath.formatQty(prod.stock, prod.unit)}"
                            }
                        )
                    }
                    "product" -> {
                        lastProducts = ms
                        val vel = PosMath.computeProductVelocities(ctx.products, ctx.sales, nowMs)
                        val body = ms.joinToString("\n\n") { pr ->
                            val v = vel.byId[pr.id]
                            buildString {
                                append(pr.name)
                                append("\n• Price: ${p(pr.retailPrice)}/${pr.unit}")
                                if (pr.wholesalePrice < pr.retailPrice) append(" (whsle ${p(pr.wholesalePrice)} at ${pr.wholesaleMinQty}+)")
                                append("\n• Stock: ${PosMath.formatQty(pr.stock, pr.unit)}")
                                if (v?.daysOfCover != null) append(" (~${String.format(Locale.US, "%.1f", v.daysOfCover)}d cover)")
                                val cap = pr.capital ?: 0.0
                                if (cap > 0.0 && pr.retailPrice > 0.0) {
                                    append("\n• Capital: ${p(cap)} (${String.format(Locale.US, "%.1f", ((pr.retailPrice - cap) / pr.retailPrice) * 100.0)}% margin)")
                                }
                                if (!pr.expiry.isNullOrBlank()) append("\n• Expiry: ${pr.expiry}")
                            }
                        }
                        val top = ms.firstOrNull()
                        val actions = mutableListOf<AssistantAction>()
                        if (top != null) {
                            if (top.stock > 0.0 && PosMath.expiryInfo(top).status != PosMath.ExpiryState.EXPIRED && top.unit != "kg") {
                                actions.add(AssistantAction.AddToCart("Add 1 ${top.name.split(" ").first()} to Cart", top.id, 1.0))
                            }
                            actions.add(AssistantAction.FindProductStock("Inspect in Stock", top.barcode.ifEmpty { top.name }))
                        }
                        reply(intent, body, actions = actions)
                    }
                    else -> reply("", helpText())
                }
            }

            if (lastIntent in RANGE_AWARE && isRangeOnly(q)) {
                return run(lastIntent, q, lastProducts)
            }

            if (Regex("""\bOR[-\s]?\d{6}[-\s]?\d{1,5}\b""", RegexOption.IGNORE_CASE).containsMatchIn(rawTrimmed) || Regex("""\b(receipt|resibo)\b""").containsMatchIn(q)) {
                return run("receipt", q)
            }
            if (Regex("""\b(closing|eod|end of day|x ?read|z ?read|cash count|cash drawer|reconcil\w*|remittance)\b|sarado na|pagsasara""").containsMatchIn(q)) return run("closing", q)
            if (Regex("""\b(briefing|digest|health score|store health|overall health|executive summary)\b|kamusta ang tindahan|kumusta ang tindahan|kalagayan""").containsMatchIn(q)) return run("briefing", q)
            if (Regex("""\b(forecast|predict|stockout|run out|days of cover|kelan mauubos|kailan mauubos|mauubos)\b""").containsMatchIn(q)) return run("forecast", q)
            if (Regex("""\b(bundle|bundles|combo|frequently bought|bought together|affinity|pair|pairs|cross sell)\b|magkasama|kasabay""").containsMatchIn(q)) return run("bundles", q)
            if (Regex("""\b(cart|basket|check cart|wholesale check|sc check)\b|suriin ang cart""").containsMatchIn(q)) return run("cart", q)
            if (Regex("""\b(daypart|shift|shifts|morning|afternoon|evening|weekday|weekend)\b|umaga vs""").containsMatchIn(q)) return run("daypart", q)
            if (Regex("""\b(security|pin|passkey|backup|vault|audit log)\b|seguridad""").containsMatchIn(q)) return run("security", q)
            if (Regex("""\b(margin audit|margins|thin margin|high margin|pricing audit|markup)\b|suriin ang tubo""").containsMatchIn(q)) return run("margins", q)

            val allCats = ctx.products.map { it.category }.distinct().filter { it.isNotBlank() }
            val matchedCat = allCats.find { q.contains(it.lowercase()) }
            if (Regex("""\b(category|categories|department|kategorya)\b""").containsMatchIn(q) ||
                (matchedCat != null && Regex("""\b(sales|benta|share|breakdown|revenue)\b""").containsMatchIn(q))
            ) {
                return run("category", q, emptyList(), matchedCat ?: "")
            }

            if (Regex("""\b(compare|vs|versus|kumpara|ikumpara|ihambing)\b""").containsMatchIn(q)) return run("compare", q)
            if (Regex("""slow ?mov|dead stock|not selling|unsold|hindi (na)?mabenta|walang benta|tengga""").containsMatchIn(q)) return run("slow", q)
            if (Regex("""\b(busiest|peak|rush|anong oras|what time|busy hours?)\b""").containsMatchIn(q)) return run("peak", q)
            if (Regex("""\b(held|parked|on hold)\b|naka ?hold|naka ?park""").containsMatchIn(q)) return run("held", q)
            if (Regex("""\b(below capital|losing|loss)\b|lugi""").containsMatchIn(q)) return run("loss", q)

            val ms = findProducts(q, ctx.products)
            if (ms.isNotEmpty() && Regex("""\bsold\b|nabenta|sales of|benta ng|ilan.*nabenta""").containsMatchIn(q)) return run("psales", q, ms)
            val asksProduct = Regex("""\b(price|magkano|how much|presyo|stock|ilan|meron|available|barcode|margin|capital|puhunan|natira|cost|wholesale|hm|ubos)\b|expir""").containsMatchIn(q)
            val asksReport = Regex("""low stock|restock|re ?order|paubos|maubos""").containsMatchIn(q)
            if (ms.isNotEmpty() && asksProduct && !asksReport) return run("product", q, ms)
            if (Regex("""\bexpir|paso na|expiration""").containsMatchIn(q)) return run("expiry", q)
            if (Regex("""restock|re ?order|paubos|maubos|\bubos\b|kulang|low stock|\blow\b|out of stock|wala na|dagdagan""").containsMatchIn(q)) return run("low", q)
            if (Regex("""\b(top|best|pinakamalaking)\b.*\b(profit|kita|tubo)\b|\b(profit|kita|tubo)\b.*\b(item|items|top|rank|abc)\b""").containsMatchIn(q)) return run("topprofit", q)
            if (Regex("""\btop\b|best ?sell|pinaka ?(mabenta|malakas)|\bmabenta\b|\bmalakas\b|popular|fast ?moving""").containsMatchIn(q)) return run("best", q)
            if (Regex("""\bvoid|\bvoided\b|cancel""").containsMatchIn(q)) return run("void", q)
            if (Regex("""inventory|stock value|how many (products|items|skus?)|imbentaryo|halaga ng|paninda""").containsMatchIn(q)) return run("inventory", q)
            if (Regex("""\b(gcash|maya|cash|card|payment|payments|bayad)\b""").containsMatchIn(q) && !Regex("""\bsales\b|\bbenta\b""").containsMatchIn(q)) return run("payments", q)
            if (Regex("""\b(profit|tubo|margin)\b""").containsMatchIn(q)) return run("profit", q)
            if (Regex("""\b(sale|sales|benta|revenue|income|kita|kinita|kumita|orders?|transactions?|total)\b""").containsMatchIn(q)) return run("sales", q)
            if (ms.isNotEmpty()) return run("product", q, ms)
            if (matchedCat != null) return run("category", q, emptyList(), matchedCat)

            return reply("", t("I didn't quite get that.\n\n", "Hindi ko po masyadong naintindihan.\n\n") + helpText())
        }

        private fun prep(text: String): String {
            var q = text.lowercase()
                .replace(Regex("""['’`]s\b"""), "")
                .replace(Regex("""['’`]"""), "")
                .replace(Regex("""[-_/]+"""), " ")
                .replace(Regex("""[^a-z0-9ñ\s]"""), " ")
            val toks = q.split(Regex("""\s+""")).filter { it.isNotEmpty() }.map { SLANG[it] ?: it }
            return toks.joinToString(" ")
        }

        private fun detectLang(toks: List<String>, prev: AssistantLang): AssistantLang {
            if (toks.any { it in TL_WORDS }) return AssistantLang.tl
            if (toks.any { it in EN_WORDS }) return AssistantLang.en
            return prev
        }

        private fun isRangeOnly(q: String): Boolean =
            q.isNotEmpty() &&
                Regex("""(yesterday|kahapon|kagabi|today|ngayon|ngayong|week|linggo|lingo|month|buwan|\d+ ?(days?|araw)|all time|overall)""").containsMatchIn(q) &&
                q.replace(RANGE_ONLY, " ").trim().isEmpty()

        private fun smallTalk(q: String, toks: List<String>, t: (String, String) -> String): String? {
            val rest = toks.filterNot { Regex("""^(po|opo|ka|mo|na|ba|lang|naman|ikaw|you|boss|sir|maam)$""").matches(it) }.joinToString(" ")
            if (Regex("""^(hi|hello|hey|hoy|uy|yo|kumusta|kamusta|musta|good (morning|afternoon|evening)|magandang (umaga|hapon|gabi))$""").matches(rest)) {
                return t("Hello! Ready to help. Ask for a Store Briefing, Stockout Forecast, Sales, or any product price.", "Kumusta po! Itanong ang Kalagayan ng Tindahan, Benta, o presyo ng paninda.")
            }
            if (Regex("""\b(thanks|thank you|salamat)\b""").containsMatchIn(q)) {
                return t("You're welcome! Ask me anytime.", "Walang anuman po! Tanong ka lang.")
            }
            return null
        }

        private fun findProducts(q0: String, products: List<Product>): List<Product> {
            var q = q0
            for ((re, to) in ALIAS) q = q.replace(re, to)
            val toks = q.split(Regex("""[^a-z0-9ñ]+"""))
                .filter { it.length >= 3 && it !in STOP }
                .map { if (it.length > 4 && it.endsWith("s") && !it.endsWith("ss")) it.dropLast(1) else it }
            if (toks.isEmpty()) return emptyList()

            val scored = products.mapNotNull { pr ->
                val hay = "${pr.name} ${pr.category} ${pr.barcode}".lowercase()
                val words = "${pr.name} ${pr.category}".lowercase().split(Regex("""[^a-z0-9ñ]+""")).filter { it.length >= 3 }
                var hit = 0.0
                for (tok in toks) {
                    if (hay.contains(tok)) hit += 1.0
                    else if (tok.length >= 4 && words.any { abs(it.length - tok.length) <= 2 && lev(tok, it) <= (if (tok.length >= 7) 2 else 1) }) {
                        hit += 0.8
                    }
                }
                if (hit > 0.0) pr to hit else null
            }.sortedByDescending { it.second }

            if (scored.isEmpty()) return emptyList()
            val best = scored.first().second
            return scored.filter { it.second == best }.take(5).map { it.first }
        }

        private fun itemSales(list: List<SaleRecord>, p: Product): Pair<Double, Double> {
            var qty = 0.0
            var amt = 0.0
            for (s in list) {
                for (it in s.items) {
                    if (it.productId == p.id || it.name == p.name) {
                        qty += it.qty
                        amt += it.lineTotal
                    }
                }
            }
            return qty to amt
        }
    }
}
