package com.example.hardware

import com.example.domain.PosMath
import com.example.model.SaleRecord
import com.example.model.StoreSettings
import java.util.Locale

object EscPosPrinter {
    fun formatReceiptText(sale: SaleRecord, settings: StoreSettings): String {
        val width = if (settings.receiptWidth == "58mm") 32 else 42
        val sep = "-".repeat(width)
        val sb = StringBuilder()
        sb.appendLine(settings.storeName.uppercase(Locale.ROOT))
        sb.appendLine(settings.storeAddress)
        if (settings.storeTin.isNotBlank()) sb.appendLine(settings.storeTin)
        if (settings.storePhone.isNotBlank()) sb.appendLine("Tel: ${settings.storePhone}")
        sb.appendLine(sep)
        sb.appendLine("OR: ${sale.receiptNo}")
        sb.appendLine("Date: ${sale.dateFormatted}")
        sale.cashierName?.let { sb.appendLine("Cashier: $it") }
        sale.customerName?.let { sb.appendLine("Suki: $it") }
        sb.appendLine(sep)
        for (it in sale.items) {
            sb.appendLine(it.name)
            val qtyStr = "${PosMath.formatQty(it.qty, it.unit)} x ${PosMath.formatPeso(it.unitPrice)}"
            val totalStr = PosMath.formatPeso(it.lineTotal)
            val pad = (width - qtyStr.length - totalStr.length).coerceAtLeast(1)
            sb.appendLine(qtyStr + " ".repeat(pad) + totalStr)
        }
        sb.appendLine(sep)
        if (sale.wholesaleSavings > 0) sb.appendLine("Wholesale Savings: -${PosMath.formatPeso(sale.wholesaleSavings)}")
        if (sale.seniorDiscount > 0) sb.appendLine("SC/PWD 5% Disc: -${PosMath.formatPeso(sale.seniorDiscount)}")
        sb.appendLine("TOTAL: ${PosMath.formatPeso(sale.grandTotal)}")
        sb.appendLine("Payment: ${sale.paymentMethod}")
        if (sale.tendered > 0) sb.appendLine("Tendered: ${PosMath.formatPeso(sale.tendered)}")
        if (sale.change > 0) sb.appendLine("Change: ${PosMath.formatPeso(sale.change)}")
        sale.refNo?.takeIf { it.isNotBlank() }?.let { sb.appendLine("Ref #: $it") }
        sb.appendLine(sep)
        sb.appendLine(settings.receiptFooter)
        return sb.toString()
    }
}
