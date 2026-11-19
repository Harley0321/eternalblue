package com.example.domain

import com.example.model.StoreSettings
import java.util.Locale

data class EmvTlvTag(
    val id: String,
    val length: Int,
    val value: String
)

sealed interface ParseEmvCoResult {
    data class Success(
        val tags: List<EmvTlvTag>,
        val merchantName: String,
        val merchantCity: String,
        val currencyNumeric: String,
        val countryCode: String,
        val amount: Double?,
        val channelLabel: String,
        val isDynamic: Boolean,
        val crcValid: Boolean
    ) : ParseEmvCoResult

    data class Error(val error: String) : ParseEmvCoResult
}

enum class CheckoutQrMode {
    EMVCO,
    IMAGE,
    MANUAL,
    UNCONFIGURED
}

data class ResolvedCheckoutQr(
    val mode: CheckoutQrMode,
    val channelLabel: String,
    val merchantName: String,
    val accountNumber: String,
    val amount: Double,
    val qrPayload: String?,
    val qrImageDataUrl: String?,
    val isDynamicAmount: Boolean,
    val error: String? = null
)

object PaymentQr {
    fun crc16CcittFalse(input: String): String {
        var crc = 0xFFFF
        for (ch in input) {
            crc = crc xor ((ch.code and 0xFF) shl 8)
            repeat(8) {
                crc = if ((crc and 0x8000) != 0) {
                    ((crc shl 1) xor 0x1021) and 0xFFFF
                } else {
                    (crc shl 1) and 0xFFFF
                }
            }
        }
        return crc.toString(16).uppercase(Locale.US).padStart(4, '0')
    }

    fun parseEmvTlv(raw: String): Result<List<EmvTlvTag>> {
        val clean = raw.trim()
        if (clean.length < 12) {
            return Result.failure(IllegalArgumentException("Payload is too short to be an EMVCo / QR Ph code."))
        }
        val tags = mutableListOf<EmvTlvTag>()
        var cursor = 0
        while (cursor < clean.length) {
            if (cursor + 4 > clean.length) {
                return Result.failure(IllegalArgumentException("Truncated TLV header at offset $cursor."))
            }
            val id = clean.substring(cursor, cursor + 2)
            val lenStr = clean.substring(cursor + 2, cursor + 4)
            val length = lenStr.toIntOrNull()
                ?: return Result.failure(IllegalArgumentException("Invalid TLV length \"$lenStr\" for tag $id."))
            val valStart = cursor + 4
            val valEnd = valStart + length
            if (valEnd > clean.length) {
                return Result.failure(IllegalArgumentException("Tag $id length ($length) exceeds payload end."))
            }
            tags.add(EmvTlvTag(id = id, length = length, value = clean.substring(valStart, valEnd)))
            cursor = valEnd
        }
        return Result.success(tags)
    }

    fun serializeEmvTlv(tags: List<EmvTlvTag>): String {
        return tags.joinToString("") { t ->
            "${t.id}${t.value.length.toString().padStart(2, '0')}${t.value}"
        }
    }

    private fun detectPhChannel(tags: List<EmvTlvTag>): String {
        val acctText = tags
            .filter { (it.id.toIntOrNull() ?: -1) in 26..51 }
            .joinToString(" ") { it.value.lowercase() }
        return when {
            "gcash" in acctText || "gxch" in acctText -> "GCash / QR Ph"
            "maya" in acctText || "paymaya" in acctText -> "Maya / QR Ph"
            "gotyme" in acctText -> "GoTyme / QR Ph"
            "bpi" in acctText -> "BPI / QR Ph"
            "bdo" in acctText -> "BDO / QR Ph"
            "qrph" in acctText || "ph.p2m" in acctText || "instapay" in acctText || "bancnet" in acctText -> "QR Ph"
            else -> "QR Ph / EMV"
        }
    }

    fun parseEmvCoQr(raw: String): ParseEmvCoResult {
        val clean = raw.trim()
        if (!clean.startsWith("000201")) {
            return ParseEmvCoResult.Error("Not an EMVCo QR Ph payload (must start with 000201).")
        }
        val parsed = parseEmvTlv(clean)
        val tags = parsed.getOrElse { return ParseEmvCoResult.Error(it.message ?: "Invalid TLV") }
        val crcTag = tags.lastOrNull()
        if (crcTag == null || crcTag.id != "63" || crcTag.value.length != 4) {
            return ParseEmvCoResult.Error("Missing valid EMVCo Tag 63 (CRC checksum).")
        }
        val bodyWithoutCrc = clean.substring(0, clean.length - 4)
        val expectedCrc = crc16CcittFalse(bodyWithoutCrc)
        val crcValid = crcTag.value.equals(expectedCrc, ignoreCase = true)

        fun getTag(id: String): String = tags.firstOrNull { it.id == id }?.value ?: ""
        val amtNum = getTag("54").toDoubleOrNull()

        return ParseEmvCoResult.Success(
            tags = tags,
            merchantName = getTag("59").ifEmpty { "Store Merchant" },
            merchantCity = getTag("60").ifEmpty { "Philippines" },
            currencyNumeric = getTag("53").ifEmpty { "608" },
            countryCode = getTag("58").ifEmpty { "PH" },
            amount = if (amtNum != null && amtNum > 0.0) PosMath.round2(amtNum) else null,
            channelLabel = detectPhChannel(tags),
            isDynamic = getTag("01") == "12",
            crcValid = crcValid
        )
    }

    fun patchEmvCoQrAmount(rawPayload: String, amountPeso: Double): Result<Pair<String, String?>> {
        val parsed = parseEmvCoQr(rawPayload)
        if (parsed is ParseEmvCoResult.Error) {
            return Result.failure(IllegalArgumentException(parsed.error))
        }
        val ok = parsed as ParseEmvCoResult.Success
        if (!ok.crcValid) {
            return Result.failure(IllegalArgumentException("Stored QR Ph checksum is invalid. Please re-paste or re-scan the merchant QR."))
        }
        val cleanAmt = PosMath.round2(amountPeso.coerceAtLeast(0.0))
        val formattedAmount = if (cleanAmt > 0.0) String.format(Locale.US, "%.2f", cleanAmt) else null

        val nextTags = ok.tags.filter { it.id != "54" && it.id != "63" && it.id != "01" }.toMutableList()
        val initTag = EmvTlvTag(id = "01", length = 2, value = if (formattedAmount != null) "12" else "11")
        val idx00 = nextTags.indexOfFirst { it.id == "00" }
        nextTags.add(if (idx00 >= 0) idx00 + 1 else 0, initTag)

        if (nextTags.none { it.id == "53" }) nextTags.add(EmvTlvTag("53", 3, "608"))
        if (nextTags.none { it.id == "58" }) nextTags.add(EmvTlvTag("58", 2, "PH"))

        if (formattedAmount != null) {
            val amtTag = EmvTlvTag("54", formattedAmount.length, formattedAmount)
            val insertIdx = nextTags.indexOfFirst { (it.id.toIntOrNull() ?: 99) > 54 }
            if (insertIdx >= 0) nextTags.add(insertIdx, amtTag) else nextTags.add(amtTag)
        }

        val bodyPlusCrcPrefix = serializeEmvTlv(nextTags) + "6304"
        val crc = crc16CcittFalse(bodyPlusCrcPrefix)
        return Result.success((bodyPlusCrcPrefix + crc) to formattedAmount)
    }

    fun resolveCheckoutQrState(settings: StoreSettings, amountPeso: Double): ResolvedCheckoutQr {
        val cleanAmt = PosMath.round2(amountPeso.coerceAtLeast(0.0))
        val rawEmv = (settings.qrEmvPayload ?: "").trim()
        val rawImg = (settings.qrImageDataUrl ?: "").trim()
        val acct = (settings.qrAccountNumber ?: "").trim()
        val label = (settings.qrPayLabel ?: "").trim().ifEmpty { "QR Ph / GCash" }
        val fallbackName = (settings.qrMerchantName ?: settings.storeName).trim().ifEmpty { "Store Merchant" }

        if (rawEmv.isNotEmpty()) {
            val parsed = parseEmvCoQr(rawEmv)
            if (parsed is ParseEmvCoResult.Success && parsed.crcValid) {
                val patched = patchEmvCoQrAmount(rawEmv, cleanAmt).getOrNull()
                if (patched != null) {
                    return ResolvedCheckoutQr(
                        mode = CheckoutQrMode.EMVCO,
                        channelLabel = (settings.qrPayLabel ?: "").trim().ifEmpty { parsed.channelLabel },
                        merchantName = (settings.qrMerchantName ?: "").trim().ifEmpty { parsed.merchantName }.ifEmpty { fallbackName },
                        accountNumber = acct,
                        amount = cleanAmt,
                        qrPayload = patched.first,
                        qrImageDataUrl = null,
                        isDynamicAmount = cleanAmt > 0.0
                    )
                }
            }
            if (!rawEmv.startsWith("000201")) {
                return ResolvedCheckoutQr(
                    mode = CheckoutQrMode.EMVCO,
                    channelLabel = label,
                    merchantName = fallbackName,
                    accountNumber = acct,
                    amount = cleanAmt,
                    qrPayload = rawEmv,
                    qrImageDataUrl = null,
                    isDynamicAmount = false
                )
            }
            if (rawImg.isEmpty() && acct.isEmpty()) {
                return ResolvedCheckoutQr(
                    mode = CheckoutQrMode.UNCONFIGURED,
                    channelLabel = label,
                    merchantName = fallbackName,
                    accountNumber = acct,
                    amount = cleanAmt,
                    qrPayload = null,
                    qrImageDataUrl = null,
                    isDynamicAmount = false,
                    error = if (parsed is ParseEmvCoResult.Error) parsed.error else "Invalid QR Ph checksum"
                )
            }
        }

        if (rawImg.isNotEmpty()) {
            return ResolvedCheckoutQr(
                mode = CheckoutQrMode.IMAGE,
                channelLabel = label,
                merchantName = fallbackName,
                accountNumber = acct,
                amount = cleanAmt,
                qrPayload = null,
                qrImageDataUrl = rawImg,
                isDynamicAmount = false
            )
        }

        if (acct.isNotEmpty()) {
            return ResolvedCheckoutQr(
                mode = CheckoutQrMode.MANUAL,
                channelLabel = label,
                merchantName = fallbackName,
                accountNumber = acct,
                amount = cleanAmt,
                qrPayload = null,
                qrImageDataUrl = null,
                isDynamicAmount = false
            )
        }

        return ResolvedCheckoutQr(
            mode = CheckoutQrMode.UNCONFIGURED,
            channelLabel = label,
            merchantName = fallbackName,
            accountNumber = "",
            amount = cleanAmt,
            qrPayload = null,
            qrImageDataUrl = null,
            isDynamicAmount = false
        )
    }

    fun buildMerchantQrPhString(
        merchantName: String,
        merchantCity: String = "MANGATAREM",
        merchantAccount: String = "09170000000",
        amount: Double? = null
    ): String {
        val name = merchantName.trim().ifEmpty { "STORE MERCHANT" }.take(25)
        val city = merchantCity.trim().ifEmpty { "MANGATAREM" }.take(15)
        val acct = merchantAccount.trim().ifEmpty { "09170000000" }.take(32)

        val tag27Val = serializeEmvTlv(
            listOf(
                EmvTlvTag("00", 9, "ph.p2m.01"),
                EmvTlvTag("01", acct.length, acct)
            )
        )
        val root = mutableListOf(
            EmvTlvTag("00", 2, "01"),
            EmvTlvTag("01", 2, if (amount != null && amount > 0.0) "12" else "11"),
            EmvTlvTag("27", tag27Val.length, tag27Val),
            EmvTlvTag("52", 4, "5411"),
            EmvTlvTag("53", 3, "608")
        )
        if (amount != null && amount > 0.0) {
            val amtStr = String.format(Locale.US, "%.2f", PosMath.round2(amount))
            root.add(EmvTlvTag("54", amtStr.length, amtStr))
        }
        root.add(EmvTlvTag("58", 2, "PH"))
        root.add(EmvTlvTag("59", name.length, name))
        root.add(EmvTlvTag("60", city.length, city))

        val bodyPlusCrcPrefix = serializeEmvTlv(root) + "6304"
        return bodyPlusCrcPrefix + crc16CcittFalse(bodyPlusCrcPrefix)
    }
}
