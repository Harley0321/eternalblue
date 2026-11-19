package com.example.model

import kotlinx.serialization.Serializable

@Serializable
enum class PriceType { retail, wholesale }

@Serializable
enum class TabName(val label: String) {
    POS("POS"),
    INVENTORY("Stock"),
    OPERATIONS("Ops & Suki"),
    SALES("Sales"),
    SETTINGS("Settings")
}

@Serializable
enum class OperationsSubTab(val label: String) {
    UTANG("Utang & Suki"),
    REPACK("Tingi / Repack"),
    SHIFT("Shift & Gastos"),
    SERVICES("GCash / E-Load"),
    PRINTING("Printer & Labels")
}

@Serializable
enum class StockFilter(val label: String) {
    ALL("All Items"),
    LOW("Low Stock"),
    OUT("Out of Stock"),
    FAST_LOW("Fast-Draining"),
    DEAD("Dead Stock"),
    EXPIRED("Expired"),
    SOON("Expiring Soon"),
    NO_CAP("No Capital"),
    LOSS("Below Capital")
}

@Serializable
enum class StockSort(val label: String) {
    DEFAULT("Default"),
    COVER_ASC("Days Cover"),
    STOCK_ASC("Lowest Stock"),
    STOCK_DESC("Highest Stock"),
    VELOCITY_DESC("Fastest Moving"),
    VALUE_DESC("Highest Value"),
    EXPIRY_ASC("Expiring Soonest"),
    NAME_ASC("Name A–Z")
}

@Serializable
data class Product(
    val id: String,
    val barcode: String,
    val name: String,
    val category: String,
    val unit: String,
    val capital: Double? = null,
    val retailPrice: Double,
    val wholesalePrice: Double,
    val wholesaleMinQty: Double = 10.0,
    val stock: Double,
    val lowStockThreshold: Double? = null,
    val expiry: String? = null,
    val scEligible: Boolean? = null,
    val icon: String? = null,
    val iconColor: String? = null,
    val updatedAt: String? = null
)

@Serializable
data class CartLine(
    val productId: String,
    val name: String,
    val unit: String,
    val retailPrice: Double,
    val wholesalePrice: Double,
    val wholesaleMinQty: Double,
    val priceType: PriceType = PriceType.retail,
    val qty: Double = 1.0
)

@Serializable
data class SaleItem(
    val productId: String? = null,
    val category: String? = null,
    val name: String,
    val qty: Double,
    val unit: String,
    val unitPrice: Double,
    val priceType: PriceType = PriceType.retail,
    val capital: Double? = null,
    val lineTotal: Double
)

@Serializable
data class SplitDetails(
    val cash: Double,
    val digital: Double,
    val digitalMethod: String = "GCash"
)

@Serializable
data class SaleRecord(
    val receiptNo: String,
    val dateIso: String,
    val dateFormatted: String,
    val items: List<SaleItem>,
    val retailSubtotal: Double,
    val wholesaleSavings: Double,
    val seniorDiscount: Double,
    val grandTotal: Double,
    val paymentMethod: String,
    val tendered: Double,
    val change: Double,
    val refNo: String? = null,
    val splitDetails: SplitDetails? = null,
    val seniorId: String? = null,
    val seniorBase: Double? = null,
    val seniorCapped: Boolean? = null,
    val voided: Boolean? = null,
    val voidedAt: String? = null,
    val voidReason: String? = null,
    val customerId: String? = null,
    val customerName: String? = null,
    val pointsEarned: Int? = null,
    val pointsRedeemed: Int? = null,
    val pointsDiscount: Double? = null,
    val utangDueDate: String? = null,
    val cashierName: String? = null,
    val shiftId: String? = null
)

@Serializable
data class HeldOrder(
    val id: String,
    val label: String? = null,
    val time: String,
    val items: List<CartLine>,
    val total: Double,
    val isSeniorPwd: Boolean? = null,
    val priceMode: PriceType? = null
)

@Serializable
data class StoreSettings(
    val storeName: String = "EternalBlue Mart",
    val storeAddress: String = "Mangatarem, Pangasinan, Philippines",
    val storeTin: String = "NON-VAT / NON-BIR INVOICE",
    val zCount: Int = 0,
    val storePhone: String = "",
    val receiptFooter: String = "Thank you for shopping with us!",
    val storeIcon: String = "basket",
    val storeTagline: String? = null,
    val lowStockThreshold: Double = 10.0,
    val expiryWarnDays: Int = 30,
    val reorderLeadDays: Int = 3,
    val reorderSafetyDays: Int = 2,
    val beep: Boolean = true,
    val scDiscountCap: Double = 125.0,
    val receiptWidth: String = "80mm",
    val loyaltyPesoPerPoint: Double = 50.0,
    val loyaltyPointValue: Double = 1.0,
    val adminPinHash: String? = null,
    val adminPinSalt: String? = null,
    val adminPinIter: Int = 100000,
    val autoLockMinutes: Int = 5,
    val lockWholePos: Boolean = false,
    val qrPayLabel: String? = null,
    val qrMerchantName: String? = null,
    val qrAccountNumber: String? = null,
    val qrEmvPayload: String? = null,
    val customerDisplayGreeting: String? = null,
    val githubRepo: String = "Harley0321/eternalblue",
    val autoUpdateEnabled: Boolean = true
)

@Serializable
data class SukiCustomer(
    val id: String,
    val name: String,
    val phone: String? = null,
    val address: String? = null,
    val creditLimit: Double = 2000.0,
    val balance: Double = 0.0,
    val dueDate: String? = null,
    val points: Int = 0,
    val totalSpent: Double = 0.0,
    val createdAt: String,
    val updatedAt: String
)

@Serializable
data class UtangTransaction(
    val id: String,
    val customerId: String,
    val customerName: String,
    val type: String, // "charge" | "payment"
    val amount: Double,
    val balanceAfter: Double,
    val receiptNo: String? = null,
    val paymentMethod: String? = null,
    val note: String? = null,
    val dateIso: String,
    val cashierName: String? = null
)

@Serializable
data class RepackRule(
    val id: String,
    val name: String,
    val masterProductId: String,
    val targetProductId: String,
    val yieldQty: Double,
    val autoComputeCost: Boolean = true,
    val updatedAt: String
)

@Serializable
data class RepackLogEntry(
    val id: String,
    val dateIso: String,
    val ruleId: String,
    val masterProductId: String,
    val masterName: String,
    val masterQtyUsed: Double,
    val targetProductId: String,
    val targetName: String,
    val targetQtyAdded: Double,
    val unitCost: Double,
    val cashierName: String? = null
)

@Serializable
data class CashDrawerEvent(
    val id: String,
    val dateIso: String,
    val type: String, // float | expense | drop | topup
    val category: String,
    val amount: Double,
    val note: String? = null,
    val cashierName: String? = null,
    val shiftId: String? = null
)

@Serializable
data class DigitalServiceEntry(
    val id: String,
    val dateIso: String,
    val kind: String, // GCASH_IN | GCASH_OUT | MAYA_IN | MAYA_OUT | ELOAD | BILLS_PAY
    val amount: Double,
    val fee: Double,
    val reference: String? = null,
    val customerPhone: String? = null,
    val note: String? = null,
    val cashierName: String? = null
)

@Serializable
data class CashierAccount(
    val id: String,
    val name: String,
    val role: String = "cashier", // manager | cashier
    val active: Boolean = true,
    val createdAt: String
)

@Serializable
data class ActiveShiftState(
    val shiftId: String,
    val cashierId: String,
    val cashierName: String,
    val cashierRole: String,
    val openedAt: String,
    val openingFloat: Double
)

@Serializable
data class StockLogEntry(
    val id: String,
    val dateIso: String,
    val productId: String,
    val productName: String,
    val delta: Double,
    val prevStock: Double,
    val newStock: Double,
    val reason: String,
    val note: String? = null
)

@Serializable
data class SecurityLogEntry(
    val id: String,
    val seq: Int,
    val timestamp: String,
    val event: String,
    val severity: String,
    val summary: String,
    val prevHash: String,
    val entryHash: String
)

data class CartTotals(
    val retailSubtotal: Double = 0.0,
    val wholesaleSavings: Double = 0.0,
    val seniorDiscount: Double = 0.0,
    val grandTotal: Double = 0.0,
    val isSeniorPwd: Boolean = false,
    val seniorBase: Double = 0.0,
    val seniorCapped: Boolean = false,
    val seniorCap: Double = 125.0,
    val scKinds: Int = 0,
    val scOtherLines: Int = 0
)

enum class ToastType { INFO, WARNING, ERROR }

data class ToastItem(
    val id: Long,
    val message: String,
    val type: ToastType = ToastType.INFO
)

@Serializable
data class ActiveCartSnapshot(
    val cart: List<CartLine> = emptyList(),
    val priceMode: PriceType = PriceType.retail,
    val isSeniorPwd: Boolean = false,
    val seniorId: String = ""
)

@Serializable
data class PosBackupPayload(
    val app: String = "eternalblue-pos",
    val version: String = "2.3.0",
    val exportedAt: String,
    val settings: StoreSettings,
    val products: List<Product>,
    val sales: List<SaleRecord>,
    val heldOrders: List<HeldOrder>,
    val sukiCustomers: List<SukiCustomer> = emptyList(),
    val utangTransactions: List<UtangTransaction> = emptyList(),
    val repackRules: List<RepackRule> = emptyList(),
    val repackLog: List<RepackLogEntry> = emptyList(),
    val drawerEvents: List<CashDrawerEvent> = emptyList(),
    val digitalServices: List<DigitalServiceEntry> = emptyList(),
    val stockLog: List<StockLogEntry> = emptyList(),
    val cashiers: List<CashierAccount> = emptyList(),
    val activeShift: ActiveShiftState? = null
)
