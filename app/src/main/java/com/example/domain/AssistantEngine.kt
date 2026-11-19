package com.example.domain

import com.example.model.CartLine
import com.example.model.HeldOrder
import com.example.model.Product
import com.example.model.SaleRecord
import com.example.model.StoreSettings
import kotlin.math.max

object AssistantEngine {
    enum class Lang { EN, TL }

    data class StorePulse(
        val todayNet: Double,
        val todayProfit: Double,
        val todayOrders: Int,
        val healthScore: Int,
        val lowCount: Int,
        val outCount: Int,
        val expiredCount: Int,
        val soonCount: Int,
        val parkedCount: Int
    )

    data class AssistantMetric(val label: String, val value: String)
    data class AssistantReply(
        val text: String,
        val lang: Lang,
        val chips: List<String>,
        val metrics: List<AssistantMetric> = emptyList()
    )

    data class ChatMessage(
        val id: Long,
        val isUser: Boolean,
        val text: String,
        val metrics: List<AssistantMetric> = emptyList(),
        val chips: List<String> = emptyList()
    )

    fun computePulse(
        products: List<Product>,
        sales: List<SaleRecord>,
        heldOrders: List<HeldOrder>,
        settings: StoreSettings
    ): StorePulse {
        val startToday = PosMath.startOfDayMs()
        val endToday = startToday + PosMath.DAY_MS
        val map = products.associateBy { it.id }
        val todayStats = PosMath.computeSalesStats(sales, startToday, endToday, map)
        val health = PosMath.computeStockHealthSummary(products, sales, settings)

        var score = 100
        score -= (health.outCount * 6).coerceAtMost(24)
        score -= (health.expiredCount * 6).coerceAtMost(18)
        score -= (health.lowCount * 3).coerceAtMost(15)
        score -= (health.lossCount * 5).coerceAtMost(15)
        if (settings.adminPinHash.isNullOrBlank()) score -= 5

        return StorePulse(
            todayNet = todayStats.revenue,
            todayProfit = todayStats.profit,
            todayOrders = todayStats.orders,
            healthScore = score.coerceIn(0, 100),
            lowCount = health.lowCount,
            outCount = health.outCount,
            expiredCount = health.expiredCount,
            soonCount = health.soonCount,
            parkedCount = heldOrders.size
        )
    }

    fun welcome(lang: Lang): AssistantReply {
        return if (lang == Lang.TL) {
            AssistantReply(
                text = "Kumusta! Ako ang EternalBlue Store AI. Handa akong magbigay ng store briefing, benta ngayon, stockout forecast, margin audit, at presyo ng paninda — 100% offline.",
                lang = lang,
                chips = listOf("Kamusta ang tindahan?", "Benta ngayon", "Ano ang dapat i-restock?", "Malapit nang ma-expire")
            )
        } else {
            AssistantReply(
                text = "Hi! I'm EternalBlue Store AI. Ask for a Store Briefing, Today's Sales, Stockout Forecast, Margin Audit, or any product price — 100% offline.",
                lang = lang,
                chips = listOf("Store briefing", "Today's sales", "Stockout forecast", "Expiring items")
            )
        }
    }

    fun ask(
        query: String,
        products: List<Product>,
        sales: List<SaleRecord>,
        heldOrders: List<HeldOrder>,
        cart: List<CartLine>,
        settings: StoreSettings,
        preferredLang: Lang = Lang.EN
    ): AssistantReply {
        val q = query.trim().lowercase()
        val isTl = q.contains("benta") || q.contains("magkano") || q.contains("tindahan") ||
            q.contains("kelan") || q.contains("malapit") || q.contains("ano") || preferredLang == Lang.TL
        val lang = if (isTl) Lang.TL else Lang.EN

        val map = products.associateBy { it.id }
        val health = PosMath.computeStockHealthSummary(products, sales, settings)
        val startToday = PosMath.startOfDayMs()
        val endToday = startToday + PosMath.DAY_MS
        val today = PosMath.computeSalesStats(sales, startToday, endToday, map)
        val last7 = PosMath.computeSalesStats(sales, startToday - 6 * PosMath.DAY_MS, endToday, map)

        if (q.contains("sales") || q.contains("benta") || q.contains("revenue")) {
            val txt = if (lang == Lang.TL) {
                "Benta Ngayon: ${PosMath.formatPeso(today.revenue)} (${today.orders} orders), tinatayang tubo ${PosMath.formatPeso(today.profit)}. Kabuuang 7-day sales: ${PosMath.formatPeso(last7.revenue)}."
            } else {
                "Today's Net Sales: ${PosMath.formatPeso(today.revenue)} across ${today.orders} orders, estimated profit ${PosMath.formatPeso(today.profit)}. 7-day total: ${PosMath.formatPeso(last7.revenue)}."
            }
            return AssistantReply(
                text = txt,
                lang = lang,
                chips = if (lang == Lang.TL) listOf("Kamusta ang tindahan?", "Ano ang dapat i-restock?") else listOf("Store briefing", "Stockout forecast"),
                metrics = listOf(
                    AssistantMetric("Today Sales", PosMath.formatPeso(today.revenue)),
                    AssistantMetric("Today Profit", PosMath.formatPeso(today.profit)),
                    AssistantMetric("Orders", today.orders.toString()),
                    AssistantMetric("7-Day Sales", PosMath.formatPeso(last7.revenue))
                )
            )
        }

        if (q.contains("restock") || q.contains("low") || q.contains("stockout") || q.contains("ubos") || q.contains("kelan")) {
            val urgent = products.filter { StockAlerts.isOutOfStock(it) || StockAlerts.isLowStock(it, settings) }
                .sortedBy { it.stock }
                .take(6)
            val names = if (urgent.isEmpty()) {
                if (lang == Lang.TL) "Kumpleto at maayos lahat ng stock." else "All items currently have healthy stock."
            } else {
                urgent.joinToString("\n") { "• ${it.name}: ${PosMath.formatQty(it.stock, it.unit)}" }
            }
            return AssistantReply(
                text = (if (lang == Lang.TL) "Priority restock list:\n" else "Priority restock items:\n") + names,
                lang = lang,
                chips = if (lang == Lang.TL) listOf("Benta ngayon", "Malapit nang ma-expire") else listOf("Today's sales", "Expiring items"),
                metrics = listOf(
                    AssistantMetric("Out of Stock", health.outCount.toString()),
                    AssistantMetric("Low Stock", health.lowCount.toString()),
                    AssistantMetric("Fast-Draining", health.fastLowCount.toString())
                )
            )
        }

        if (q.contains("expir")) {
            val expiring = products.mapNotNull { p ->
                val e = PosMath.expiryInfo(p, settings.expiryWarnDays)
                if (e.status == PosMath.ExpiryState.EXPIRED || e.status == PosMath.ExpiryState.SOON) p to e else null
            }.sortedBy { it.second.days ?: 999 }.take(6)
            val body = if (expiring.isEmpty()) {
                if (lang == Lang.TL) "Walang malapit ma-expire sa loob ng ${settings.expiryWarnDays} araw." else "No products expiring within ${settings.expiryWarnDays} days."
            } else {
                expiring.joinToString("\n") { (p, e) -> "• ${p.name} (${p.expiry ?: ""}) — ${if ((e.days ?: 0) <= 0) "EXPIRED" else "${e.days}d left"}" }
            }
            return AssistantReply(
                text = body,
                lang = lang,
                chips = listOf("Store briefing", "Stockout forecast"),
                metrics = listOf(
                    AssistantMetric("Expired", health.expiredCount.toString()),
                    AssistantMetric("Expiring Soon", health.soonCount.toString())
                )
            )
        }

        // Product price / stock lookup
        val matched = products.filter {
            val tokens = q.split(Regex("\\s+")).filter { t -> t.length >= 3 }
            tokens.any { tok -> it.name.lowercase().contains(tok) || it.barcode.contains(tok) }
        }.take(4)

        if (matched.isNotEmpty() && !q.contains("briefing") && !q.contains("kamusta")) {
            val lines = matched.joinToString("\n") {
                "• ${it.name}: Retail ${PosMath.formatPeso(it.retailPrice)} | Wholesale ${PosMath.formatPeso(it.wholesalePrice)} (${PosMath.formatQty(it.wholesaleMinQty)}+) | Stock: ${PosMath.formatQty(it.stock, it.unit)}"
            }
            return AssistantReply(text = lines, lang = lang, chips = listOf("Store briefing", "Today's sales"))
        }

        val pulse = computePulse(products, sales, heldOrders, settings)
        val briefing = if (lang == Lang.TL) {
            "Kalagayan ng Tindahan (Score ${pulse.healthScore}/100): Benta ngayon ${PosMath.formatPeso(pulse.todayNet)}, tubo ${PosMath.formatPeso(pulse.todayProfit)}. May ${pulse.outCount} out-of-stock, ${pulse.lowCount} low stock, at ${cart.size} item sa cart."
        } else {
            "Store Health ${pulse.healthScore}/100: Today's net sales ${PosMath.formatPeso(pulse.todayNet)} (${pulse.todayOrders} orders, est. profit ${PosMath.formatPeso(pulse.todayProfit)}). Inventory alerts: ${pulse.outCount} out, ${pulse.lowCount} low stock, ${pulse.soonCount} expiring soon."
        }
        return AssistantReply(
            text = briefing,
            lang = lang,
            chips = if (lang == Lang.TL) listOf("Benta ngayon", "Ano ang dapat i-restock?", "Malapit nang ma-expire") else listOf("Today's sales", "Stockout forecast", "Expiring items"),
            metrics = listOf(
                AssistantMetric("Health", "${pulse.healthScore}/100"),
                AssistantMetric("Today Net", PosMath.formatPeso(pulse.todayNet)),
                AssistantMetric("Stock Alerts", "${pulse.outCount + pulse.lowCount}"),
                AssistantMetric("Retail Stock Value", PosMath.formatPeso(health.retailValue))
            )
        )
    }
}
