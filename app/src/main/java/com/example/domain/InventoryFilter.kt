package com.example.domain

import com.example.model.Product
import com.example.model.SaleRecord
import com.example.model.StockFilter
import com.example.model.StockSort
import com.example.model.StoreSettings
import kotlin.math.max

object InventoryFilter {
    fun filterAndSort(
        products: List<Product>,
        sales: List<SaleRecord>,
        settings: StoreSettings,
        query: String,
        filter: StockFilter,
        sort: StockSort
    ): List<Product> {
        val velocities = PosMath.computeProductVelocities(products, sales, 30)
        val q = query.trim().lowercase()

        val filtered = products.filter { p ->
            val matchQuery = q.isEmpty() ||
                p.name.lowercase().contains(q) ||
                p.category.lowercase().contains(q) ||
                p.barcode.lowercase().contains(q)
            if (!matchQuery) return@filter false

            val v = velocities[p.id] ?: 0.0
            val exp = PosMath.expiryInfo(p, settings.expiryWarnDays)
            val cap = p.capital ?: 0.0

            when (filter) {
                StockFilter.ALL -> true
                StockFilter.LOW -> StockAlerts.isLowStock(p, settings)
                StockFilter.OUT -> StockAlerts.isOutOfStock(p)
                StockFilter.FAST_LOW -> v > 0.0 && p.stock > 0.0 && (p.stock / v) <= (settings.reorderLeadDays + settings.reorderSafetyDays)
                StockFilter.DEAD -> v <= 0.0 && p.stock > 0.0
                StockFilter.EXPIRED -> exp.status == PosMath.ExpiryState.EXPIRED
                StockFilter.SOON -> exp.status == PosMath.ExpiryState.SOON
                StockFilter.NO_CAP -> cap <= 0.0
                StockFilter.LOSS -> cap > 0.0 && p.retailPrice < cap
            }
        }

        return when (sort) {
            StockSort.DEFAULT -> filtered
            StockSort.COVER_ASC -> filtered.sortedBy {
                val v = velocities[it.id] ?: 0.0
                if (v > 0.0) it.stock / v else 999999.0
            }
            StockSort.STOCK_ASC -> filtered.sortedBy { it.stock }
            StockSort.STOCK_DESC -> filtered.sortedByDescending { it.stock }
            StockSort.VELOCITY_DESC -> filtered.sortedByDescending { velocities[it.id] ?: 0.0 }
            StockSort.VALUE_DESC -> filtered.sortedByDescending { max(0.0, it.stock) * it.retailPrice }
            StockSort.EXPIRY_ASC -> filtered.sortedBy { PosMath.expiryInfo(it, settings.expiryWarnDays).days ?: 999999 }
            StockSort.NAME_ASC -> filtered.sortedBy { it.name.lowercase() }
        }
    }
}
