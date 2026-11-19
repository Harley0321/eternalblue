package com.example.domain

import com.example.model.Product
import com.example.model.StoreSettings

object StockAlerts {
    fun effectiveThreshold(product: Product, settings: StoreSettings): Double {
        val custom = product.lowStockThreshold ?: 0.0
        if (custom > 0.0) return custom
        return if (settings.lowStockThreshold > 0.0) settings.lowStockThreshold else 10.0
    }

    fun isOutOfStock(product: Product): Boolean = product.stock <= 0.0001

    fun isLowStock(product: Product, settings: StoreSettings): Boolean =
        product.stock > 0.0001 && product.stock <= effectiveThreshold(product, settings) + 1e-6
}
