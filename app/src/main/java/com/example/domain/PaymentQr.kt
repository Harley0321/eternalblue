package com.example.domain

import android.graphics.Bitmap
import android.graphics.Color
import com.example.model.StoreSettings
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import java.util.Locale
import kotlin.math.max

object PaymentQr {
    data class EmvTag(val id: String, val value: String)

    data class ResolvedQr(
        val mode: String, // EMVCO | MANUAL | UNCONFIGURED
        val channelLabel: String,
        val merchantName: String,
        val accountNumber: String,
        val amount: Double,
        val qrPayload: String? = null,
        val isDynamicAmount: Boolean = false
    )

    fun crc16CcittFalse(input: String): String {
        var crc = 0xFFFF
        for (ch in input) {
            crc = crc xor ((ch.code and 0xFF) shl 8)
            for (b in 0 until 8) {
                crc = if ((crc and 0x8000) != 0) ((crc shl 1) xor 0x1021) and 0xFFFF else (crc shl 1) and 0xFFFF
            }
        }
        return String.format(Locale.US, "%04X", crc)
    }

    fun parseEmvTlv(raw: String): List<EmvTag>? {
        val clean = raw.trim()
        if (clean.length < 12) return null
        val tags = mutableListOf<EmvTag>()
        var cursor = 0
        while (cursor < clean.length) {
            if (cursor + 4 > clean.length) return null
            val id = clean.substring(cursor, cursor + 2)
            val len = clean.substring(cursor + 2, cursor + 4).toIntOrNull() ?: return null
            val start = cursor + 4
            val end = start + len
            if (end > clean.length) return null
            tags.add(EmvTag(id, clean.substring(start, end)))
            cursor = end
        }
        return tags
    }

    fun patchEmvAmount(rawPayload: String, amountPeso: Double): String? {
        val clean = rawPayload.trim()
        if (!clean.startsWith("000201")) return null
        val tags = parseEmvTlv(clean) ?: return null
        val crcTag = tags.lastOrNull() ?: return null
        if (crcTag.id != "63" || crcTag.value.length != 4) return null
        val bodyWithoutCrc = clean.dropLast(4)
        if (!crc16CcittFalse(bodyWithoutCrc).equals(crcTag.value, ignoreCase = true)) return null

        val amt = PosMath.round2(max(0.0, amountPeso))
        val formattedAmt = if (amt > 0.0) String.format(Locale.US, "%.2f", amt) else null

        val nextTags = tags.filterNot { it.id == "54" || it.id == "63" || it.id == "01" }.toMutableList()
        val initTag = EmvTag("01", if (formattedAmt != null) "12" else "11")
        val idx00 = nextTags.indexOfFirst { it.id == "00" }
        nextTags.add(if (idx00 >= 0) idx00 + 1 else 0, initTag)
        if (nextTags.none { it.id == "53" }) nextTags.add(EmvTag("53", "608"))
        if (nextTags.none { it.id == "58" }) nextTags.add(EmvTag("58", "PH"))

        if (formattedAmt != null) {
            val amtTag = EmvTag("54", formattedAmt)
            val idx = nextTags.indexOfFirst { (it.id.toIntOrNull() ?: 99) > 54 }
            if (idx >= 0) nextTags.add(idx, amtTag) else nextTags.add(amtTag)
        }

        val serialized = nextTags.joinToString("") { "${it.id}${String.format(Locale.US, "%02d", it.value.length)}${it.value}" } + "6304"
        return serialized + crc16CcittFalse(serialized)
    }

    fun resolveCheckoutQr(settings: StoreSettings, amountPeso: Double): ResolvedQr {
        val amt = PosMath.round2(max(0.0, amountPeso))
        val emv = settings.qrEmvPayload?.trim().orEmpty()
        val acct = settings.qrAccountNumber?.trim().orEmpty()
        val label = settings.qrPayLabel?.trim().takeIf { !it.isNullOrEmpty() } ?: "QR Ph / GCash"
        val merchant = settings.qrMerchantName?.trim().takeIf { !it.isNullOrEmpty() } ?: settings.storeName

        if (emv.isNotEmpty()) {
            val patched = patchEmvAmount(emv, amt)
            return ResolvedQr(
                mode = "EMVCO",
                channelLabel = label,
                merchantName = merchant,
                accountNumber = acct,
                amount = amt,
                qrPayload = patched ?: emv,
                isDynamicAmount = patched != null && amt > 0.0
            )
        }
        if (acct.isNotEmpty()) {
            return ResolvedQr(
                mode = "MANUAL",
                channelLabel = label,
                merchantName = merchant,
                accountNumber = acct,
                amount = amt
            )
        }
        return ResolvedQr(
            mode = "UNCONFIGURED",
            channelLabel = label,
            merchantName = merchant,
            accountNumber = "",
            amount = amt
        )
    }

    fun renderQrBitmap(payload: String, sizePx: Int = 512): Bitmap? {
        if (payload.isBlank()) return null
        return try {
            val hints = mapOf(EncodeHintType.MARGIN to 1)
            val matrix = QRCodeWriter().encode(payload, BarcodeFormat.QR_CODE, sizePx, sizePx, hints)
            val bmp = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
            for (x in 0 until sizePx) {
                for (y in 0 until sizePx) {
                    bmp.setPixel(x, y, if (matrix.get(x, y)) Color.BLACK else Color.WHITE)
                }
            }
            bmp
        } catch (_: Exception) {
            null
        }
    }
}
