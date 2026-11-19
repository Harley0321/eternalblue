package com.example.domain

import com.example.model.Product

data class LowStockAlertSummary(
    val lowStockItems: List<Product>,
    val outOfStockItems: List<Product>,
    val lowCount: Int,
    val outCount: Int,
    val totalAlertCount: Int
)

data class StockAlertNotificationPayload(
    val title: String,
    val body: String,
    val tag: String,
    val itemsCount: Int
)

object StockAlerts {
    fun normalizeThreshold(value: Double?, fallback: Double = 10.0): Double {
        return if (value != null && value.isFinite() && value >= 0.0) value else fallback
    }

    fun getEffectiveLowStockThreshold(product: Product, globalThreshold: Double): Double {
        val globalVal = normalizeThreshold(globalThreshold, 10.0)
        val custom = product.lowStockThreshold
        return if (custom != null && custom.isFinite() && custom >= 0.0) custom else globalVal
    }

    fun isProductLowStock(product: Product, globalThreshold: Double): Boolean {
        return product.stock <= getEffectiveLowStockThreshold(product, globalThreshold)
    }

    fun computeLowStockAlerts(products: List<Product>, globalThreshold: Double): LowStockAlertSummary {
        val low = mutableListOf<Product>()
        val out = mutableListOf<Product>()
        for (p in products) {
            val th = getEffectiveLowStockThreshold(p, globalThreshold)
            if (p.stock <= 0.0) {
                out.add(p)
            } else if (p.stock <= th) {
                low.add(p)
            }
        }
        return LowStockAlertSummary(
            lowStockItems = low,
            outOfStockItems = out,
            lowCount = low.size,
            outCount = out.size,
            totalAlertCount = low.size + out.size
        )
    }

    fun detectNewlyLowStockProducts(
        prevProducts: List<Product>,
        nextProducts: List<Product>,
        globalThreshold: Double,
        prevGlobalThreshold: Double = globalThreshold
    ): List<Product> {
        val prevById = prevProducts.associateBy { it.id }
        val triggered = mutableListOf<Product>()
        for (nextProd in nextProducts) {
            val nextTh = getEffectiveLowStockThreshold(nextProd, globalThreshold)
            if (nextProd.stock > nextTh) continue
            val prevProd = prevById[nextProd.id]
            if (prevProd == null) {
                triggered.add(nextProd)
                continue
            }
            val prevTh = getEffectiveLowStockThreshold(prevProd, prevGlobalThreshold)
            val wasAlert = prevProd.stock <= prevTh
            if (!wasAlert || (prevProd.stock > 0.0 && nextProd.stock <= 0.0)) {
                triggered.add(nextProd)
            }
        }
        return triggered
    }

    fun buildStockAlertNotificationPayload(
        items: List<Product>,
        globalThreshold: Double,
        storeName: String
    ): StockAlertNotificationPayload {
        val safeStore = storeName.trim().ifEmpty { "EternalBlue Mart" }
        if (items.isEmpty()) {
            return StockAlertNotificationPayload(
                title = "Stock Alert · $safeStore",
                body = "All inventory items are currently above low-stock thresholds.",
                tag = "eternalblue-stock-alert",
                itemsCount = 0
            )
        }
        val outCount = items.count { it.stock <= 0.0 }
        val title = if (outCount > 0 && outCount == items.size) {
            "Out of Stock Alert · $safeStore"
        } else {
            "Low Stock Alert · $safeStore"
        }
        val preview = items.take(3).map { p ->
            val th = getEffectiveLowStockThreshold(p, globalThreshold)
            if (p.stock <= 0.0) "${p.name} (OUT OF STOCK)"
            else "${p.name} (${PosMath.formatQty(p.stock, p.unit)} left, min ${PosMath.formatQty(th)})"
        }
        val extra = if (items.size > 3) " +${items.size - 3} more" else ""
        val body = if (items.size == 1) {
            "${preview[0]} is below its low-stock threshold."
        } else {
            "${items.size} products need restock: ${preview.joinToString(", ")}$extra."
        }
        return StockAlertNotificationPayload(
            title = title,
            body = body,
            tag = "eternalblue-stock-alert",
            itemsCount = items.size
        )
    }
}
