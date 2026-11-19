package com.example.domain

import com.example.model.Product
import com.example.model.StockFilter
import com.example.model.StockLogEntry
import com.example.model.StockSort
import java.time.LocalDate
import java.time.format.DateTimeFormatter

object InventoryFilter {

    fun matchesInventorySearch(product: Product, rawQuery: String): Boolean {
        val trimmed = rawQuery.trim()
        if (trimmed.isEmpty()) return true

        val payload = PosMath.extractScanPayload(trimmed)
        val qLower = trimmed.lowercase()
        val extractedLower = payload.rawQuery.lowercase()
        val codeLower = payload.code.lowercase()
        val normQ = PosMath.normBarcode(payload.code.ifEmpty { payload.rawQuery })

        val nameLower = product.name.lowercase()
        val catLower = product.category.lowercase()
        val bcLower = product.barcode.lowercase()

        if (nameLower.contains(qLower) || catLower.contains(qLower) || bcLower.contains(qLower)) {
            return true
        }
        if (extractedLower != qLower &&
            (nameLower.contains(extractedLower) || catLower.contains(extractedLower) || bcLower.contains(codeLower))
        ) {
            return true
        }
        if (normQ.isNotEmpty()) {
            val prodNorm = PosMath.normBarcode(product.barcode)
            if (prodNorm.isNotEmpty() && (prodNorm == normQ || prodNorm.contains(normQ))) {
                return true
            }
        }
        return false
    }

    fun buildExpiryStatusMap(
        products: List<Product>,
        expiryWarnDays: Int,
        today: LocalDate = LocalDate.now()
    ): Map<String, PosMath.ExpiryStatus> {
        return products.associate { it.id to PosMath.expiryInfo(it, expiryWarnDays, today) }
    }

    fun filterAndSortInventory(
        products: List<Product>,
        searchQuery: String,
        stockFilter: StockFilter,
        selectedCategory: String,
        sortBy: StockSort,
        lowStockThreshold: Double,
        coverWarnDays: Int,
        expiryMap: Map<String, PosMath.ExpiryStatus>,
        velocityById: Map<String, PosMath.ProductVelocity>
    ): List<Product> {
        val hasQuery = searchQuery.trim().isNotEmpty()
        val filtered = products.filter { p ->
            if (selectedCategory != "All" && p.category != selectedCategory) return@filter false
            if (hasQuery && !matchesInventorySearch(p, searchQuery)) return@filter false
            if (stockFilter == StockFilter.ALL) return@filter true

            val stk = p.stock
            val st = expiryMap[p.id]?.status ?: PosMath.ExpiryState.NONE
            val vel = velocityById[p.id]
            val cap = p.capital ?: 0.0
            val effLowTh = StockAlerts.getEffectiveLowStockThreshold(p, lowStockThreshold)

            when (stockFilter) {
                StockFilter.LOW -> stk > 0.0 && stk <= effLowTh
                StockFilter.OUT -> stk <= 0.0
                StockFilter.FAST_LOW -> stk > 0.0 && vel?.daysOfCover != null && vel.daysOfCover <= coverWarnDays
                StockFilter.DEAD -> vel?.isDeadStock == true
                StockFilter.EXPIRED -> st == PosMath.ExpiryState.EXPIRED
                StockFilter.SOON -> st == PosMath.ExpiryState.SOON
                StockFilter.NO_CAP -> cap <= 0.0
                StockFilter.LOSS -> cap > 0.0 && (p.retailPrice < cap || (p.wholesalePrice > 0.0 && p.wholesalePrice < cap))
                StockFilter.ALL -> true
            }
        }

        if (sortBy == StockSort.DEFAULT) return filtered

        return when (sortBy) {
            StockSort.STOCK_ASC -> filtered.sortedBy { it.stock }
            StockSort.STOCK_DESC -> filtered.sortedByDescending { it.stock }
            StockSort.NAME_ASC -> filtered.sortedBy { it.name.lowercase() }
            StockSort.COVER_ASC -> filtered.sortedBy { velocityById[it.id]?.daysOfCover ?: 999999.0 }
            StockSort.VELOCITY_DESC -> filtered.sortedByDescending { velocityById[it.id]?.avgDaily ?: 0.0 }
            StockSort.VALUE_DESC -> filtered.sortedByDescending { PosMath.lineTotalPeso(it.retailPrice, it.stock) }
            StockSort.EXPIRY_ASC -> filtered.sortedBy { expiryMap[it.id]?.days ?: 999999L }
            StockSort.MARGIN_ASC -> filtered.sortedBy { p ->
                val cap = p.capital ?: 0.0
                if (cap > 0.0 && p.retailPrice > 0.0) (p.retailPrice - cap) / p.retailPrice else 999.0
            }
            StockSort.DEFAULT -> filtered
        }
    }

    data class AppliedCsvImportResult(
        val nextProducts: List<Product>,
        val newLogs: List<StockLogEntry>,
        val created: Int,
        val updated: Int
    )

    fun applyCsvImportToCatalog(
        products: List<Product>,
        rows: List<PosMath.CsvImportRowPreview>,
        mode: String, // "merge" or "new-only"
        nowIso: String = java.time.Instant.now().toString(),
        stampMs: Long = System.currentTimeMillis()
    ): AppliedCsvImportResult {
        val updatedProducts = products.toMutableList()
        val indexById = updatedProducts.mapIndexed { idx, p -> p.id to idx }.toMap()
        val createdProducts = mutableListOf<Product>()
        val newLogs = mutableListOf<StockLogEntry>()
        var created = 0
        var updated = 0
        val stamp = stampMs.toString(36)

        for (row in rows) {
            if (row.action == "update" && mode == "merge" && row.existing != null && row.data != null) {
                val idx = indexById[row.existing.id] ?: continue
                val oldProd = updatedProducts[idx]
                updatedProducts[idx] = row.data.copy(id = oldProd.id, updatedAt = nowIso)
                updated++
                val delta = PosMath.round3(row.data.stock - oldProd.stock)
                if (delta != 0.0) {
                    newLogs.add(
                        StockLogEntry(
                            id = "LOG-$stamp-${row.rowNum}",
                            dateIso = nowIso,
                            productId = oldProd.id,
                            productName = row.data.name,
                            delta = delta,
                            prevStock = oldProd.stock,
                            newStock = row.data.stock,
                            reason = if (delta > 0) "Restock" else "Count Correction",
                            note = "CSV Import"
                        )
                    )
                }
            } else if (row.action == "create" && row.data != null) {
                val id = "SKU-${stamp.uppercase()}-${row.rowNum}"
                createdProducts.add(0, row.data.copy(id = id, updatedAt = nowIso))
                created++
                if (row.data.stock > 0.0) {
                    newLogs.add(
                        StockLogEntry(
                            id = "LOG-$stamp-C${row.rowNum}",
                            dateIso = nowIso,
                            productId = id,
                            productName = row.data.name,
                            delta = row.data.stock,
                            prevStock = 0.0,
                            newStock = row.data.stock,
                            reason = "Restock",
                            note = "CSV Import (new SKU)"
                        )
                    )
                }
            }
        }
        return AppliedCsvImportResult(
            nextProducts = createdProducts + updatedProducts,
            newLogs = newLogs,
            created = created,
            updated = updated
        )
    }
}
