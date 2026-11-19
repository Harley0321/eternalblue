package com.example.hardware

import android.graphics.Rect
import com.google.mlkit.vision.barcode.BarcodeScanner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.ZoomSuggestionOptions
import com.google.mlkit.vision.barcode.common.Barcode

/**
 * 10 core retail, grocery, warehouse, and 2D barcode formats supported for fast simultaneous scanning.
 */
enum class BarcodeSymbology(
    val mlKitFormat: Int,
    val label: String,
    val shortTag: String,
    val is2D: Boolean = false
) {
    EAN_13(Barcode.FORMAT_EAN_13, "EAN-13 (Retail)", "EAN-13"),
    EAN_8(Barcode.FORMAT_EAN_8, "EAN-8 (Compact)", "EAN-8"),
    UPC_A(Barcode.FORMAT_UPC_A, "UPC-A (US/Import)", "UPC-A"),
    UPC_E(Barcode.FORMAT_UPC_E, "UPC-E (Can/Mini)", "UPC-E"),
    CODE_128(Barcode.FORMAT_CODE_128, "Code 128 (GS1)", "C128"),
    CODE_39(Barcode.FORMAT_CODE_39, "Code 39 (SKU Tag)", "C39"),
    CODE_93(Barcode.FORMAT_CODE_93, "Code 93 (Logistics)", "C93"),
    ITF(Barcode.FORMAT_ITF, "ITF-14 (Cartons)", "ITF-14"),
    QR_CODE(Barcode.FORMAT_QR_CODE, "QR Code (2D/GS1)", "QR", is2D = true),
    DATA_MATRIX(Barcode.FORMAT_DATA_MATRIX, "Data Matrix (2D)", "DMX", is2D = true);

    companion object {
        val ALL_10: Set<BarcodeSymbology> = entries.toSet()
        val RETAIL_1D: Set<BarcodeSymbology> = setOf(EAN_13, EAN_8, UPC_A, UPC_E, CODE_128, ITF)
        val WAREHOUSE_2D: Set<BarcodeSymbology> = setOf(CODE_128, CODE_39, CODE_93, ITF, QR_CODE, DATA_MATRIX)

        fun labelForMlKitFormat(format: Int): String = when (format) {
            Barcode.FORMAT_EAN_13 -> "EAN-13"
            Barcode.FORMAT_EAN_8 -> "EAN-8"
            Barcode.FORMAT_UPC_A -> "UPC-A"
            Barcode.FORMAT_UPC_E -> "UPC-E"
            Barcode.FORMAT_CODE_128 -> "Code 128"
            Barcode.FORMAT_CODE_39 -> "Code 39"
            Barcode.FORMAT_CODE_93 -> "Code 93"
            Barcode.FORMAT_ITF -> "ITF-14"
            Barcode.FORMAT_QR_CODE -> "QR"
            Barcode.FORMAT_DATA_MATRIX -> "Data Matrix"
            Barcode.FORMAT_AZTEC -> "Aztec"
            Barcode.FORMAT_PDF417 -> "PDF417"
            Barcode.FORMAT_CODABAR -> "Codabar"
            else -> "Barcode"
        }
    }
}

data class DetectedOverlayBarcode(
    val key: String,
    val rawValue: String?,
    val cleanCode: String,
    val formatLabel: String,
    val boundingBox: Rect,
    val matchedProductName: String? = null,
    val matchedPrice: Double? = null,
    val isPotentialOnly: Boolean = false
)

data class ScanFeedEntry(
    val id: Long,
    val code: String,
    val formatLabel: String,
    val productId: String? = null,
    val productName: String? = null,
    val qtyAdded: Double = 1.0,
    val unit: String = "pc",
    val unitPrice: Double? = null,
    val isUnknown: Boolean = false,
    val timestampMs: Long = System.currentTimeMillis()
)

object BarcodeScannerEngine {

    fun buildClient(
        symbologies: Set<BarcodeSymbology>,
        enableAutoZoom: Boolean = true,
        maxZoomRatio: Float = 4.0f,
        onZoomSuggested: ((Float) -> Boolean)? = null
    ): BarcodeScanner {
        val active = symbologies.ifEmpty { BarcodeSymbology.ALL_10 }.toList()
        val first = active.first().mlKitFormat
        val rest = active.drop(1).map { it.mlKitFormat }.toIntArray()

        val builder = BarcodeScannerOptions.Builder()
            .setBarcodeFormats(first, *rest)
            .enableAllPotentialBarcodes()

        if (enableAutoZoom && onZoomSuggested != null) {
            val zoomOptions = ZoomSuggestionOptions.Builder { ratio ->
                onZoomSuggested(ratio)
            }
                .setMaxSupportedZoomRatio(maxZoomRatio.coerceIn(1.5f, 6.0f))
                .build()
            builder.setZoomSuggestionOptions(zoomOptions)
        }

        return BarcodeScanning.getClient(builder.build())
    }
}
