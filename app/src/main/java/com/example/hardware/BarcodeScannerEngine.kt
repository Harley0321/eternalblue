package com.example.hardware

import android.graphics.Bitmap
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.common.InputImage

object BarcodeScannerEngine {
    fun decodeBitmap(bitmap: Bitmap, onDetected: (String) -> Unit, onEmpty: () -> Unit) {
        val scanner = BarcodeScanning.getClient()
        val image = InputImage.fromBitmap(bitmap, 0)
        scanner.process(image)
            .addOnSuccessListener { list ->
                val raw = list.firstOrNull()?.rawValue?.trim()
                if (!raw.isNullOrEmpty()) onDetected(raw) else onEmpty()
            }
            .addOnFailureListener { onEmpty() }
    }
}
