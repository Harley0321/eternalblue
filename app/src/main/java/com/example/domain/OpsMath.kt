package com.example.domain

import com.example.model.CashDrawerEvent
import com.example.model.DigitalServiceEntry
import com.example.model.DigitalServiceKind
import com.example.model.DrawerEventType
import com.example.model.Product
import com.example.model.RepackLogEntry
import com.example.model.RepackRule
import com.example.model.SaleRecord
import com.example.model.StockLogEntry
import com.example.model.SukiCustomer
import com.example.model.UtangTransaction
import java.time.Instant
import java.time.LocalDate
import java.util.Locale
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

object OpsMath {

    fun computeLoyaltyPointsEarned(grandTotal: Double, pesoPerPoint: Double = 50.0): Int {
        val rate = if (pesoPerPoint > 0.0) pesoPerPoint else 50.0
        val amt = max(0.0, grandTotal)
        return floor(amt / rate).toInt()
    }

    data class PointsRedemption(val pointsUsed: Int, val discountPeso: Double)

    fun computePointsRedemption(
        requestedPoints: Int,
        availablePoints: Int,
        pesoPerRedeemedPoint: Double = 1.0,
        maxBillAmount: Double = 0.0
    ): PointsRedemption {
        val avail = max(0, availablePoints)
        val req = max(0, requestedPoints)
        val pointVal = if (pesoPerRedeemedPoint > 0.0) pesoPerRedeemedPoint else 1.0
        val maxBill = max(0.0, PosMath.round2(maxBillAmount))
        if (avail <= 0 || req <= 0 || maxBill <= 0.0) return PointsRedemption(0, 0.0)
        val maxPointsForBill = floor(maxBill / pointVal).toInt()
        val used = minOf(req, avail, maxPointsForBill)
        return PointsRedemption(used, PosMath.round2(used * pointVal))
    }

    fun isCustomerOverdue(customer: SukiCustomer, today: LocalDate = LocalDate.now()): Boolean {
        if (!(customer.balance > 0.0) || customer.dueDate.isNullOrBlank()) return false
        val due = runCatching { LocalDate.parse(customer.dueDate.trim()) }.getOrNull() ?: return false
        return today.isAfter(due)
    }

    sealed interface UtangChargeResult {
        data class Success(val nextCustomer: SukiCustomer, val transaction: UtangTransaction) : UtangChargeResult
        data class Error(val error: String) : UtangChargeResult
    }

    fun applyUtangCharge(
        customer: SukiCustomer,
        amount: Double,
        receiptNo: String? = null,
        dueDate: String? = null,
        note: String? = null,
        cashierName: String? = null,
        allowOverLimit: Boolean = false,
        nowIso: String = Instant.now().toString()
    ): UtangChargeResult {
        val charge = PosMath.round2(amount)
        if (!(charge > 0.0)) return UtangChargeResult.Error("Charge amount must be greater than ₱0.00")
        val nextBal = PosMath.round2(customer.balance + charge)
        if (!allowOverLimit && customer.creditLimit > 0.0 && nextBal > customer.creditLimit + 1e-6) {
            val avail = max(0.0, PosMath.round2(customer.creditLimit - customer.balance))
            return UtangChargeResult.Error(
                String.format(Locale.US, "Exceeds credit limit (%.2f). Available credit: %.2f.", customer.creditLimit, avail)
            )
        }
        val nextCust = customer.copy(
            balance = nextBal,
            dueDate = if (dueDate != null) dueDate.ifEmpty { null } else customer.dueDate,
            totalSpent = PosMath.round2(customer.totalSpent + charge),
            updatedAt = nowIso
        )
        val tx = UtangTransaction(
            id = "UTX-${System.currentTimeMillis().toString(36).uppercase()}-${(100..999).random()}",
            customerId = customer.id,
            customerName = customer.name,
            type = "charge",
            amount = charge,
            balanceAfter = nextBal,
            receiptNo = receiptNo,
            note = note ?: if (receiptNo != null) "POS Receipt $receiptNo" else "Store credit charge",
            dateIso = nowIso,
            cashierName = cashierName
        )
        return UtangChargeResult.Success(nextCust, tx)
    }

    sealed interface UtangPaymentResult {
        data class Success(
            val nextCustomer: SukiCustomer,
            val transaction: UtangTransaction,
            val appliedAmount: Double
        ) : UtangPaymentResult
        data class Error(val error: String) : UtangPaymentResult
    }

    fun applyUtangPayment(
        customer: SukiCustomer,
        amount: Double,
        paymentMethod: String = "Cash",
        note: String? = null,
        cashierName: String? = null,
        nowIso: String = Instant.now().toString()
    ): UtangPaymentResult {
        val pay = PosMath.round2(amount)
        if (!(pay > 0.0)) return UtangPaymentResult.Error("Payment amount must be greater than ₱0.00")
        val currentBal = PosMath.round2(customer.balance)
        if (currentBal <= 0.0) return UtangPaymentResult.Error("${customer.name} has zero outstanding utang balance.")
        val applied = min(currentBal, pay)
        val nextBal = PosMath.round2(max(0.0, currentBal - applied))
        val nextCust = customer.copy(
            balance = nextBal,
            dueDate = if (nextBal <= 0.0) null else customer.dueDate,
            updatedAt = nowIso
        )
        val tx = UtangTransaction(
            id = "UPY-${System.currentTimeMillis().toString(36).uppercase()}-${(100..999).random()}",
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
        return UtangPaymentResult.Success(nextCust, tx, applied)
    }

    data class UtangLedgerSummary(
        val totalReceivable: Double,
        val overdueCount: Int,
        val overdueAmount: Double,
        val activeDebtors: Int,
        val totalPoints: Int,
        val collectedToday: Double,
        val chargedToday: Double
    )

    fun summarizeUtangLedger(
        customers: List<SukiCustomer>,
        transactions: List<UtangTransaction>,
        nowMs: Long = System.currentTimeMillis()
    ): UtangLedgerSummary {
        val startToday = PosMath.startOfDayMs(nowMs)
        val endToday = startToday + PosMath.DAY_MS
        val today = LocalDate.now()

        var totalRecC = 0L
        var overdueCount = 0
        var overdueAmtC = 0L
        var totalPts = 0
        var activeDebtors = 0

        for (c in customers) {
            val balC = PosMath.toCents(c.balance)
            if (balC > 0L) {
                activeDebtors++
                totalRecC += balC
                if (isCustomerOverdue(c, today)) {
                    overdueCount++
                    overdueAmtC += balC
                }
            }
            totalPts += max(0, c.points)
        }

        var collectedC = 0L
        var chargedC = 0L
        for (tx in transactions) {
            val t = PosMath.parseIsoMs(tx.dateIso)
            if (t !in startToday until endToday) continue
            if (tx.type == "payment") collectedC += PosMath.toCents(tx.amount)
            else if (tx.type == "charge") chargedC += PosMath.toCents(tx.amount)
        }

        return UtangLedgerSummary(
            totalReceivable = PosMath.fromCents(totalRecC),
            overdueCount = overdueCount,
            overdueAmount = PosMath.fromCents(overdueAmtC),
            activeDebtors = activeDebtors,
            totalPoints = totalPts,
            collectedToday = PosMath.fromCents(collectedC),
            chargedToday = PosMath.fromCents(chargedC)
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

    fun computeRepackUnitCost(masterCapital: Double?, yieldQty: Double): Double {
        val cap = masterCapital ?: 0.0
        if (!(cap > 0.0) || !(yieldQty > 0.0)) return 0.0
        return PosMath.round2(cap / yieldQty)
    }

    sealed interface RepackResult {
        data class Success(
            val nextProducts: List<Product>,
            val stockLogs: List<StockLogEntry>,
            val repackLog: RepackLogEntry,
            val addedQty: Double,
            val unitCost: Double
        ) : RepackResult
        data class Error(val error: String) : RepackResult
    }

    fun executeRepackConversion(
        products: List<Product>,
        rule: RepackRule,
        masterQtyToUnpack: Double,
        cashierName: String? = null,
        nowIso: String = Instant.now().toString()
    ): RepackResult {
        val unpackQty = PosMath.round3(masterQtyToUnpack)
        if (!(unpackQty > 0.0)) return RepackResult.Error("Unpack quantity must be greater than 0.")
        if (!(rule.yieldQty > 0.0)) return RepackResult.Error("Conversion yield per bulk unit must be greater than 0.")
        if (rule.masterProductId == rule.targetProductId) {
            return RepackResult.Error("Master bulk SKU and retail tingi SKU must be different products.")
        }

        val master = products.find { it.id == rule.masterProductId }
            ?: return RepackResult.Error("Master bulk SKU not found in inventory.")
        val target = products.find { it.id == rule.targetProductId }
            ?: return RepackResult.Error("Target retail/tingi SKU not found in inventory.")

        if (master.stock + 1e-6 < unpackQty) {
            return RepackResult.Error("Not enough ${master.name} in stock (${PosMath.formatQty(master.stock, master.unit)} available).")
        }

        val addedQty = PosMath.round3(unpackQty * rule.yieldQty)
        val nextMasterStock = max(0.0, PosMath.round3(master.stock - unpackQty))
        val nextTargetStock = PosMath.round3(target.stock + addedQty)

        val derivedUnitCost = computeRepackUnitCost(master.capital, rule.yieldQty)
        var nextTargetCap = target.capital
        if (rule.autoComputeCost && derivedUnitCost > 0.0) {
            val existingStock = max(0.0, target.stock)
            val existingCap = target.capital ?: 0.0
            nextTargetCap = if (existingStock > 0.0 && existingCap > 0.0 && nextTargetStock > 0.0) {
                PosMath.round2((existingStock * existingCap + addedQty * derivedUnitCost) / nextTargetStock)
            } else {
                derivedUnitCost
            }
        }

        val nextProducts = products.map { p ->
            when (p.id) {
                master.id -> p.copy(stock = nextMasterStock, updatedAt = nowIso)
                target.id -> p.copy(stock = nextTargetStock, capital = nextTargetCap, updatedAt = nowIso)
                else -> p
            }
        }

        val tag = System.currentTimeMillis().toString(36).uppercase()
        val stockLogs = listOf(
            StockLogEntry(
                id = "LOG-$tag-OUT",
                dateIso = nowIso,
                productId = master.id,
                productName = master.name,
                delta = -unpackQty,
                prevStock = master.stock,
                newStock = nextMasterStock,
                reason = "Count Correction",
                note = "Unpacked ${PosMath.formatQty(unpackQty, master.unit)} → +${PosMath.formatQty(addedQty, target.unit)} (${target.name})"
            ),
            StockLogEntry(
                id = "LOG-$tag-IN",
                dateIso = nowIso,
                productId = target.id,
                productName = target.name,
                delta = addedQty,
                prevStock = target.stock,
                newStock = nextTargetStock,
                reason = "Restock",
                note = "Repack from ${master.name} (${PosMath.formatQty(unpackQty, master.unit)})"
            )
        )

        val unitCostOut = if (derivedUnitCost > 0.0) derivedUnitCost else (target.capital ?: 0.0)
        val repackLog = RepackLogEntry(
            id = "RPK-$tag",
            dateIso = nowIso,
            ruleId = rule.id,
            masterProductId = master.id,
            masterName = master.name,
            masterQtyUsed = unpackQty,
            targetProductId = target.id,
            targetName = target.name,
            targetQtyAdded = addedQty,
            unitCost = unitCostOut,
            cashierName = cashierName
        )
        return RepackResult.Success(nextProducts, stockLogs, repackLog, addedQty, unitCostOut)
    }

    fun suggestServiceFee(kind: DigitalServiceKind, amount: Double): Double {
        if (!(amount > 0.0)) return 0.0
        return when (kind) {
            DigitalServiceKind.ELOAD -> if (amount >= 100.0) 5.0 else 3.0
            DigitalServiceKind.BILLS_PAY -> 15.0
            else -> when {
                amount <= 500.0 -> 10.0
                amount <= 1000.0 -> 15.0
                else -> ceil(amount / 1000.0) * 20.0
            }
        }
    }

    data class DigitalServicesSummary(
        val count: Int,
        val totalVolume: Double,
        val totalFees: Double,
        val cashDrawerImpact: Double
    )

    fun summarizeDigitalServices(entries: List<DigitalServiceEntry>, fromMs: Long, toMs: Long): DigitalServicesSummary {
        var volumeC = 0L
        var feesC = 0L
        var cashImpactC = 0L
        var count = 0
        for (entry in entries) {
            val t = PosMath.parseIsoMs(entry.dateIso)
            if (t !in fromMs until toMs) continue
            count++
            val amtC = PosMath.toCents(entry.amount)
            val feeC = PosMath.toCents(entry.fee)
            volumeC += amtC
            feesC += feeC
            if (entry.kind == DigitalServiceKind.GCASH_OUT.label || entry.kind == DigitalServiceKind.MAYA_OUT.label) {
                cashImpactC += feeC - amtC
            } else {
                cashImpactC += amtC + feeC
            }
        }
        return DigitalServicesSummary(
            count = count,
            totalVolume = PosMath.fromCents(volumeC),
            totalFees = PosMath.fromCents(feesC),
            cashDrawerImpact = PosMath.fromCents(cashImpactC)
        )
    }

    data class ShiftLedgerSummary(
        val salesCount: Int,
        val grossProfit: Double,
        val netSales: Double,
        val cashSales: Double,
        val utangCashCollected: Double,
        val cashTopUps: Double,
        val cashDrops: Double,
        val expensesTotal: Double,
        val serviceFeesTotal: Double,
        val serviceCashImpact: Double,
        val expectedDrawerCash: Double,
        val trueNetProfit: Double
    )

    fun computeShiftLedgerSummary(
        sales: List<SaleRecord>,
        products: List<Product>,
        drawerEvents: List<CashDrawerEvent>,
        utangTransactions: List<UtangTransaction>,
        serviceEntries: List<DigitalServiceEntry>,
        openingFloat: Double,
        fromMs: Long,
        toMs: Long
    ): ShiftLedgerSummary {
        val validSales = sales.filter { it.voided != true && PosMath.inRange(it.dateIso, fromMs, toMs) }
        val stats = PosMath.computeSalesStats(validSales, products)

        var expensesC = 0L
        var dropsC = 0L
        var topUpsC = 0L
        for (ev in drawerEvents) {
            val t = PosMath.parseIsoMs(ev.dateIso)
            if (t !in fromMs until toMs) continue
            val c = PosMath.toCents(ev.amount)
            when (ev.type) {
                DrawerEventType.expense -> expensesC += c
                DrawerEventType.drop -> dropsC += c
                DrawerEventType.topup -> topUpsC += c
                DrawerEventType.float -> {}
            }
        }

        var utangCashC = 0L
        for (utx in utangTransactions) {
            if (utx.type != "payment") continue
            val t = PosMath.parseIsoMs(utx.dateIso)
            if (t !in fromMs until toMs) continue
            if ((utx.paymentMethod ?: "Cash") == "Cash") utangCashC += PosMath.toCents(utx.amount)
        }

        var cashSalesC = 0L
        for (s in validSales) {
            if (s.paymentMethod == "Cash") cashSalesC += PosMath.toCents(s.grandTotal)
            else if (s.paymentMethod == "Split" && s.splitDetails != null) {
                cashSalesC += PosMath.toCents(s.splitDetails.cash)
            }
        }

        val svc = summarizeDigitalServices(serviceEntries, fromMs, toMs)
        val expectedC = PosMath.toCents(openingFloat) + cashSalesC + utangCashC + topUpsC +
            PosMath.toCents(svc.cashDrawerImpact) - expensesC - dropsC
        val expensesTotal = PosMath.fromCents(expensesC)
        val trueNetProfit = PosMath.round2(stats.profit + svc.totalFees - expensesTotal)

        return ShiftLedgerSummary(
            salesCount = stats.count,
            grossProfit = stats.profit,
            netSales = stats.net,
            cashSales = PosMath.fromCents(cashSalesC),
            utangCashCollected = PosMath.fromCents(utangCashC),
            cashTopUps = PosMath.fromCents(topUpsC),
            cashDrops = PosMath.fromCents(dropsC),
            expensesTotal = expensesTotal,
            serviceFeesTotal = svc.totalFees,
            serviceCashImpact = svc.cashDrawerImpact,
            expectedDrawerCash = PosMath.fromCents(expectedC),
            trueNetProfit = trueNetProfit
        )
    }

    private val CODE128_PATTERNS = arrayOf(
        "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
        "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
        "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
        "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
        "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
        "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
        "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
        "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
        "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
        "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
        "114131", "311141", "411131", "211412", "211214", "211232", "2331112"
    )

    data class Code128Encoded(val widths: List<Int>, val totalModules: Int)

    fun encodeCode128Bars(rawText: String): Code128Encoded {
        val sanitized = rawText.filter { it.code in 32..126 }.take(32).ifEmpty { "0000" }
        val codes = mutableListOf(104)
        var checksum = 104
        sanitized.forEachIndexed { idx, ch ->
            val v = ch.code - 32
            codes.add(v)
            checksum += v * (idx + 1)
        }
        codes.add(checksum % 103)
        codes.add(106)

        val widths = mutableListOf<Int>()
        var total = 0
        for (code in codes) {
            val pat = CODE128_PATTERNS.getOrElse(code) { CODE128_PATTERNS[0] }
            for (ch in pat) {
                val w = ch - '0'
                widths.add(w)
                total += w
            }
        }
        return Code128Encoded(widths, total)
    }
}
