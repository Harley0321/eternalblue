package com.example.domain

import com.example.model.CashDrawerEvent
import com.example.model.DigitalServiceEntry
import com.example.model.Product
import com.example.model.RepackLogEntry
import com.example.model.RepackRule
import com.example.model.SaleRecord
import com.example.model.StockLogEntry
import com.example.model.SukiCustomer
import com.example.model.UtangTransaction
import java.time.Instant
import java.time.LocalDate
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

object OpsMath {
    fun computeLoyaltyPointsEarned(grandTotal: Double, pesoPerPoint: Double = 50.0): Int {
        val rate = if (pesoPerPoint > 0.0) pesoPerPoint else 50.0
        return floor(max(0.0, grandTotal) / rate).toInt()
    }

    fun isCustomerOverdue(customer: SukiCustomer, todayYmd: String = LocalDate.now().toString()): Boolean {
        if (customer.balance <= 0.0 || customer.dueDate.isNullOrBlank()) return false
        return todayYmd > customer.dueDate.trim()
    }

    sealed class UtangResult {
        data class Ok(val customer: SukiCustomer, val tx: UtangTransaction) : UtangResult()
        data class Err(val error: String) : UtangResult()
    }

    fun applyUtangCharge(
        customer: SukiCustomer,
        amount: Double,
        receiptNo: String? = null,
        dueDate: String? = null,
        note: String? = null,
        cashierName: String? = null,
        allowOverLimit: Boolean = false
    ): UtangResult {
        val charge = PosMath.round2(amount)
        if (charge <= 0.0) return UtangResult.Err("Charge amount must be greater than ₱0.00")
        val nextBal = PosMath.round2(customer.balance + charge)
        if (!allowOverLimit && customer.creditLimit > 0.0 && nextBal > customer.creditLimit + 1e-6) {
            return UtangResult.Err("Exceeds credit limit (${PosMath.formatPeso(customer.creditLimit)}).")
        }
        val nowIso = Instant.now().toString()
        val next = customer.copy(
            balance = nextBal,
            dueDate = dueDate?.takeIf { it.isNotBlank() } ?: customer.dueDate,
            totalSpent = PosMath.round2(customer.totalSpent + charge),
            updatedAt = nowIso
        )
        val tx = UtangTransaction(
            id = "UTX-${System.currentTimeMillis()}",
            customerId = customer.id,
            customerName = customer.name,
            type = "charge",
            amount = charge,
            balanceAfter = nextBal,
            receiptNo = receiptNo,
            note = note ?: (receiptNo?.let { "POS Receipt $it" } ?: "Store credit charge"),
            dateIso = nowIso,
            cashierName = cashierName
        )
        return UtangResult.Ok(next, tx)
    }

    fun applyUtangPayment(
        customer: SukiCustomer,
        amount: Double,
        paymentMethod: String = "Cash",
        note: String? = null,
        cashierName: String? = null
    ): UtangResult {
        val pay = PosMath.round2(amount)
        if (pay <= 0.0) return UtangResult.Err("Payment must be greater than ₱0.00")
        val cur = PosMath.round2(customer.balance)
        if (cur <= 0.0) return UtangResult.Err("${customer.name} has zero balance.")
        val applied = min(cur, pay)
        val nextBal = PosMath.round2(max(0.0, cur - applied))
        val nowIso = Instant.now().toString()
        val next = customer.copy(
            balance = nextBal,
            dueDate = if (nextBal <= 0.0) null else customer.dueDate,
            updatedAt = nowIso
        )
        val tx = UtangTransaction(
            id = "UPY-${System.currentTimeMillis()}",
            customerId = customer.id,
            customerName = customer.name,
            type = "payment",
            amount = applied,
            balanceAfter = nextBal,
            paymentMethod = paymentMethod,
            note = note ?: "Bayad utang ($paymentMethod)",
            dateIso = nowIso,
            cashierName = cashierName
        )
        return UtangResult.Ok(next, tx)
    }

    sealed class RepackResult {
        data class Ok(
            val nextProducts: List<Product>,
            val stockLogs: List<StockLogEntry>,
            val repackLog: RepackLogEntry
        ) : RepackResult()
        data class Err(val error: String) : RepackResult()
    }

    fun executeRepackConversion(
        products: List<Product>,
        rule: RepackRule,
        masterQtyToUnpack: Double,
        cashierName: String? = null
    ): RepackResult {
        val unpack = PosMath.round3(masterQtyToUnpack)
        if (unpack <= 0.0) return RepackResult.Err("Unpack quantity must be > 0.")
        val master = products.firstOrNull { it.id == rule.masterProductId }
            ?: return RepackResult.Err("Master SKU not found.")
        val target = products.firstOrNull { it.id == rule.targetProductId }
            ?: return RepackResult.Err("Target SKU not found.")
        if (master.stock + 1e-6 < unpack) {
            return RepackResult.Err("Not enough ${master.name} in stock.")
        }

        val added = PosMath.round3(unpack * rule.yieldQty)
        val nextMasterStock = max(0.0, PosMath.round3(master.stock - unpack))
        val nextTargetStock = PosMath.round3(target.stock + added)
        val derivedCost = if ((master.capital ?: 0.0) > 0.0 && rule.yieldQty > 0.0) {
            PosMath.round2(master.capital!! / rule.yieldQty)
        } else 0.0

        val nextTargetCap = if (rule.autoComputeCost && derivedCost > 0.0) {
            val prevStock = max(0.0, target.stock)
            val prevCap = target.capital ?: 0.0
            if (prevStock > 0.0 && prevCap > 0.0 && nextTargetStock > 0.0) {
                PosMath.round2((prevStock * prevCap + added * derivedCost) / nextTargetStock)
            } else derivedCost
        } else target.capital

        val nowIso = Instant.now().toString()
        val updated = products.map { p ->
            when (p.id) {
                master.id -> p.copy(stock = nextMasterStock, updatedAt = nowIso)
                target.id -> p.copy(stock = nextTargetStock, capital = nextTargetCap, updatedAt = nowIso)
                else -> p
            }
        }
        val tag = System.currentTimeMillis().toString(36).uppercase()
        val logs = listOf(
            StockLogEntry(
                id = "LOG-$tag-OUT",
                dateIso = nowIso,
                productId = master.id,
                productName = master.name,
                delta = -unpack,
                prevStock = master.stock,
                newStock = nextMasterStock,
                reason = "Count Correction",
                note = "Unpacked ${PosMath.formatQty(unpack, master.unit)} → +${PosMath.formatQty(added, target.unit)}"
            ),
            StockLogEntry(
                id = "LOG-$tag-IN",
                dateIso = nowIso,
                productId = target.id,
                productName = target.name,
                delta = added,
                prevStock = target.stock,
                newStock = nextTargetStock,
                reason = "Restock",
                note = "Repack from ${master.name}"
            )
        )
        val rLog = RepackLogEntry(
            id = "RPK-$tag",
            dateIso = nowIso,
            ruleId = rule.id,
            masterProductId = master.id,
            masterName = master.name,
            masterQtyUsed = unpack,
            targetProductId = target.id,
            targetName = target.name,
            targetQtyAdded = added,
            unitCost = if (derivedCost > 0.0) derivedCost else (target.capital ?: 0.0),
            cashierName = cashierName
        )
        return RepackResult.Ok(updated, logs, rLog)
    }

    fun suggestServiceFee(kind: String, amount: Double): Double {
        if (amount <= 0.0) return 0.0
        return when (kind) {
            "ELOAD" -> if (amount >= 100.0) 5.0 else 3.0
            "BILLS_PAY" -> 15.0
            else -> when {
                amount <= 500.0 -> 10.0
                amount <= 1000.0 -> 15.0
                else -> ceil(amount / 1000.0) * 20.0
            }
        }
    }

    data class ShiftLedgerSummary(
        val cashSales: Double,
        val digitalSales: Double,
        val utangCollectedCash: Double,
        val openingFloat: Double,
        val cashTopUps: Double,
        val expenses: Double,
        val cashDrops: Double,
        val serviceFees: Double,
        val expectedDrawerCash: Double
    )

    fun summarizeShiftDrawer(
        sales: List<SaleRecord>,
        drawerEvents: List<CashDrawerEvent>,
        utangTx: List<UtangTransaction>,
        digitalServices: List<DigitalServiceEntry>,
        fromMs: Long,
        toMs: Long
    ): ShiftLedgerSummary {
        var cashC = 0L; var digC = 0L
        for (s in sales) {
            if (s.voided == true) continue
            val ms = PosMath.parseIsoMs(s.dateIso)
            if (ms < fromMs || ms >= toMs) continue
            when {
                s.paymentMethod.equals("Cash", ignoreCase = true) -> cashC += PosMath.toCents(s.grandTotal)
                s.paymentMethod.equals("Split", ignoreCase = true) && s.splitDetails != null -> {
                    cashC += PosMath.toCents(s.splitDetails.cash)
                    digC += PosMath.toCents(s.splitDetails.digital)
                }
                !s.paymentMethod.equals("Utang", ignoreCase = true) -> digC += PosMath.toCents(s.grandTotal)
            }
        }
        var floatC = 0L; var topupC = 0L; var expC = 0L; var dropC = 0L
        for (ev in drawerEvents) {
            val ms = PosMath.parseIsoMs(ev.dateIso)
            if (ms < fromMs || ms >= toMs) continue
            when (ev.type) {
                "float" -> floatC += PosMath.toCents(ev.amount)
                "topup" -> topupC += PosMath.toCents(ev.amount)
                "expense" -> expC += PosMath.toCents(ev.amount)
                "drop" -> dropC += PosMath.toCents(ev.amount)
            }
        }
        var utangCashC = 0L
        for (tx in utangTx) {
            val ms = PosMath.parseIsoMs(tx.dateIso)
            if (ms < fromMs || ms >= toMs) continue
            if (tx.type == "payment" && (tx.paymentMethod == null || tx.paymentMethod.equals("Cash", true))) {
                utangCashC += PosMath.toCents(tx.amount)
            }
        }
        var feeC = 0L
        for (ds in digitalServices) {
            val ms = PosMath.parseIsoMs(ds.dateIso)
            if (ms < fromMs || ms >= toMs) continue
            feeC += PosMath.toCents(ds.fee)
        }
        val expectedC = floatC + topupC + cashC + utangCashC - expC - dropC
        return ShiftLedgerSummary(
            cashSales = PosMath.fromCents(cashC),
            digitalSales = PosMath.fromCents(digC),
            utangCollectedCash = PosMath.fromCents(utangCashC),
            openingFloat = PosMath.fromCents(floatC),
            cashTopUps = PosMath.fromCents(topupC),
            expenses = PosMath.fromCents(expC),
            cashDrops = PosMath.fromCents(dropC),
            serviceFees = PosMath.fromCents(feeC),
            expectedDrawerCash = PosMath.fromCents(expectedC)
        )
    }

    fun buildUtangSmsStatement(customer: SukiCustomer, storeName: String): String {
        val sb = StringBuilder()
        sb.append("[$storeName] Suki Balance Reminder\n")
        sb.append("Hi ${customer.name}, your current store utang balance is ${PosMath.formatPeso(customer.balance)}.\n")
        if (!customer.dueDate.isNullOrBlank()) sb.append("Due date: ${customer.dueDate}\n")
        if (customer.points > 0) sb.append("Available Suki Points: ${customer.points} pts\n")
        sb.append("Maraming salamat po!")
        return sb.toString()
    }
}
