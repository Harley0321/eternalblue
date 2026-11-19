package com.example.model

import kotlinx.serialization.Serializable

@Serializable
enum class PriceType {
    retail,
    wholesale
}

@Serializable
enum class PaymentMethod(val label: String) {
    Cash("Cash"),
    GCash("GCash"),
    Card("Card"),
    Split("Split"),
    Utang("Utang")
}

enum class TabName {
    pos,
    inventory,
    operations,
    sales,
    settings
}

enum class OperationsSubTab(val label: String) {
    utang("Utang & Suki"),
    repack("Tingi / Repack"),
    shift("Shift & Gastos"),
    services("GCash / E-Load"),
    printing("Printer & Labels")
}

enum class ScannerMode {
    pos,
    inventory,
    productForm
}

enum class StockFilter(val label: String) {
    ALL("All Items"),
    LOW("Low Stock"),
    OUT("Out of Stock"),
    FAST_LOW("Fast-Draining"),
    DEAD("Dead Stock (30d)"),
    EXPIRED("Expired"),
    SOON("Expiring Soon"),
    NO_CAP("Missing Capital"),
    LOSS("Below Capital (Loss)")
}

enum class StockSort(val label: String) {
    DEFAULT("Default Order"),
    COVER_ASC("Days Cover (Lowest)"),
    STOCK_ASC("Stock (Lowest)"),
    STOCK_DESC("Stock (Highest)"),
    VELOCITY_DESC("Fastest Moving"),
    VALUE_DESC("Highest Stock Value"),
    EXPIRY_ASC("Expiring Soonest"),
    MARGIN_ASC("Lowest Margin %"),
    NAME_ASC("Name (A–Z)")
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
    val wholesaleMinQty: Int,
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
    val wholesaleMinQty: Int,
    val priceType: PriceType,
    val qty: Double
)

@Serializable
data class SaleItem(
    val productId: String? = null,
    val category: String? = null,
    val name: String,
    val qty: Double,
    val unit: String,
    val unitPrice: Double,
    val priceType: PriceType,
    val capital: Double? = null,
    val lineTotal: Double
)

@Serializable
data class SplitDetails(
    val cash: Double,
    val digital: Double,
    val digitalMethod: String // "GCash" or "Card"
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
    val cashierId: String? = null,
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
    val storeIcon: String? = "basket",
    val storeTagline: String? = null,
    val lowStockThreshold: Double = 10.0,
    val expiryWarnDays: Int = 30,
    val reorderLeadDays: Int = 3,
    val reorderSafetyDays: Int = 2,
    val beep: Boolean = true,
    val vibrate: Boolean = true,
    val stockAlertNotifications: Boolean = false,
    val lastBackup: String = "",
    val scDiscountCap: Double = 125.0,
    val receiptWidth: String = "80mm",
    val loyaltyPesoPerPoint: Double = 50.0,
    val loyaltyPointValue: Double = 1.0,
    val adminPin: String? = null,
    val adminPinHash: String? = null,
    val adminPinSalt: String? = null,
    val adminPinIter: Int? = null,
    val adminPinAlgo: String? = null,
    val adminPinWeak: Boolean? = null,
    val autoLockMinutes: Int = 5,
    val lockWholePos: Boolean = false,
    val biometricEnabled: Boolean = false,
    val qrPayLabel: String? = null,
    val qrMerchantName: String? = null,
    val qrAccountNumber: String? = null,
    val qrEmvPayload: String? = null,
    val qrImageDataUrl: String? = null,
    val customerDisplayGreeting: String? = null,
    val githubRepo: String? = null,
    val autoCheckUpdates: Boolean = true
)

@Serializable
data class SukiCustomer(
    val id: String,
    val name: String,
    val phone: String? = null,
    val address: String? = null,
    val creditLimit: Double,
    val balance: Double,
    val dueDate: String? = null,
    val points: Int,
    val totalSpent: Double,
    val notes: String? = null,
    val createdAt: String,
    val updatedAt: String
)

@Serializable
data class UtangTransaction(
    val id: String,
    val customerId: String,
    val customerName: String,
    val type: String, // "charge", "payment", "adjustment"
    val amount: Double,
    val balanceAfter: Double,
    val receiptNo: String? = null,
    val paymentMethod: String? = null, // "Cash", "GCash", "Card"
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
    val autoComputeCost: Boolean,
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
enum class DrawerEventType(val label: String) {
    float("Opening Float"),
    expense("Expense / Gastos"),
    drop("Cash Drop / Vault"),
    topup("Cash Top-Up")
}

@Serializable
data class CashDrawerEvent(
    val id: String,
    val dateIso: String,
    val type: DrawerEventType,
    val category: String,
    val amount: Double,
    val note: String? = null,
    val cashierName: String? = null,
    val shiftId: String? = null
)

@Serializable
enum class DigitalServiceKind(val label: String) {
    GCASH_IN("GCash Cash-In"),
    GCASH_OUT("GCash Cash-Out"),
    MAYA_IN("Maya Cash-In"),
    MAYA_OUT("Maya Cash-Out"),
    ELOAD("E-Load"),
    BILLS_PAY("Bills Pay")
}

@Serializable
data class DigitalServiceEntry(
    val id: String,
    val dateIso: String,
    val kind: String,
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
    val role: String, // "manager" or "cashier"
    val pin: String? = null,
    val pinHash: String? = null,
    val pinSalt: String? = null,
    val pinIter: Int? = null,
    val pinAlgo: String? = null,
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
enum class SecuritySeverity {
    info,
    warning,
    critical
}

@Serializable
enum class SecurityEventType {
    PIN_SET,
    PIN_UPGRADED,
    PIN_FAIL,
    PIN_LOCKOUT,
    SETTINGS_UNLOCK,
    SETTINGS_LOCK,
    POS_LOCK,
    POS_UNLOCK,
    PASSKEY_ENROLLED,
    PASSKEY_UNLOCK,
    PASSKEY_REMOVED,
    SALE_VOIDED,
    BACKUP_EXPORTED,
    BACKUP_ENCRYPTED_EXPORTED,
    BACKUP_RESTORED,
    DATA_CLEARED,
    FACTORY_RESET,
    TAMPER_ALERT
}

@Serializable
data class SecurityLogEntry(
    val id: String,
    val seq: Int,
    val timestamp: String,
    val event: SecurityEventType,
    val severity: SecuritySeverity,
    val summary: String,
    val prevHash: String,
    val entryHash: String,
    val hmacSig: String? = null
)

@Serializable
data class VaultSummary(
    val products: Int,
    val sales: Int,
    val heldOrders: Int
)

@Serializable
data class EncryptedVaultEnvelope(
    val app: String = "omnimart-ph-pos",
    val format: String = "omnimart-aes256gcm-v2",
    val kdf: String = "PBKDF2-SHA512+HKDF-SHA256",
    val iterations: Int = 310000,
    val salt: String,
    val hkdfSalt: String,
    val iv: String,
    val ciphertext: String,
    val exportedAt: String,
    val summary: VaultSummary
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
    val reason: String, // "Restock", "Spoilage / Expired", "Damage", "Count Correction", "Other"
    val note: String? = null
)

data class CartTotals(
    val retailSubtotal: Double,
    val wholesaleSavings: Double,
    val seniorDiscount: Double,
    val grandTotal: Double,
    val isSeniorPwd: Boolean,
    val seniorBase: Double,
    val seniorCapped: Boolean,
    val seniorCap: Double,
    val scKinds: Int,
    val scOtherLines: Int
)

@Serializable
data class ConfigSnapshotData(
    val storeName: String,
    val storeAddress: String,
    val storeTin: String,
    val storePhone: String,
    val receiptFooter: String,
    val storeIcon: String? = "basket",
    val storeTagline: String? = "",
    val lowStockThreshold: Double,
    val expiryWarnDays: Int,
    val reorderLeadDays: Int,
    val reorderSafetyDays: Int,
    val beep: Boolean,
    val vibrate: Boolean,
    val stockAlertNotifications: Boolean = false,
    val scDiscountCap: Double,
    val receiptWidth: String = "80mm",
    val qrPayLabel: String? = null,
    val qrMerchantName: String? = null,
    val qrAccountNumber: String? = null,
    val qrEmvPayload: String? = null,
    val customerDisplayGreeting: String? = null
)

@Serializable
data class ConfigSnapshot(
    val id: String,
    val version: String,
    val createdAt: String,
    val label: String,
    val source: String, // "baseline", "auto", "manual", "rollback"
    val changedFields: List<String>,
    val config: ConfigSnapshotData
)

@Serializable
data class BackupPayload(
    val app: String = "omnimart-ph-pos",
    val version: Int = 1,
    val exportedAt: String = "",
    val products: List<Product>,
    val sales: List<SaleRecord>,
    val heldOrders: List<HeldOrder> = emptyList(),
    val settings: StoreSettings? = null
)

data class ReadingLine(
    val label: String,
    val value: String,
    val bold: Boolean = false,
    val dividerAfter: Boolean = false
)

data class ReadingReport(
    val title: String,
    val subtitle: String,
    val lines: List<ReadingLine>
)

enum class ToastType {
    SUCCESS,
    WARNING,
    ERROR
}

data class ToastItem(
    val id: Long,
    val message: String,
    val type: ToastType = ToastType.SUCCESS
)

data class CheckoutLiveDraft(
    val open: Boolean,
    val method: PaymentMethod,
    val finalDue: Double,
    val cashTendered: Double,
    val cashChange: Double,
    val splitCash: Double,
    val splitDigital: Double,
    val splitDigitalMethod: String,
    val customerName: String? = null,
    val pointsDiscount: Double = 0.0,
    val forceShowQr: Boolean = false
)

data class StorageBreakdownItem(
    val key: String,
    val label: String,
    val bytes: Long,
    val pct: Int
)

data class GitHubReleaseInfo(
    val tagName: String,
    val title: String,
    val remoteVersionCode: Int,
    val apkDownloadUrl: String,
    val releasePageUrl: String,
    val notes: String = ""
)

data class AppUpdateUiState(
    val currentVersionName: String = "2.3.0",
    val currentVersionCode: Int = 1,
    val effectiveRepo: String = "",
    val checking: Boolean = false,
    val availableRelease: GitHubReleaseInfo? = null,
    val upToDateMessage: String? = null,
    val errorMessage: String? = null,
    val bannerDismissed: Boolean = false
)
