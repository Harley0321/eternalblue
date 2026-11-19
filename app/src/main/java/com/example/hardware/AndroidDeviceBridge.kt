package com.example.hardware

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.AudioManager
import android.media.ToneGenerator
import android.net.Uri
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.print.PrintAttributes
import android.print.PrintManager
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.fragment.app.FragmentActivity
import com.example.R
import com.example.domain.StockAlertNotificationPayload
import com.google.mlkit.vision.common.InputImage
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.RGBLuminanceSource
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.multi.GenericMultipleBarcodeReader
import com.google.zxing.qrcode.QRCodeWriter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.File
import kotlin.coroutines.resume

object AndroidDeviceBridge {
    private const val STOCK_CHANNEL_ID = "eternalblue_stock_alerts"
    private var lastBeepMs = 0L
    private var lastVibrateMs = 0L
    private val toneGenerator by lazy {
        runCatching { ToneGenerator(AudioManager.STREAM_NOTIFICATION, 75) }.getOrNull()
    }

    fun playBeep() {
        val now = System.currentTimeMillis()
        if (now - lastBeepMs < 95L) return
        lastBeepMs = now
        runCatching {
            toneGenerator?.startTone(ToneGenerator.TONE_PROP_BEEP, 85)
        }
    }

    fun vibrateShort(context: Context) {
        val now = System.currentTimeMillis()
        if (now - lastVibrateMs < 95L) return
        lastVibrateMs = now
        runCatching {
            val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            }
            vibrator?.vibrate(VibrationEffect.createOneShot(45L, VibrationEffect.DEFAULT_AMPLITUDE))
        }
    }

    fun copyToClipboard(context: Context, label: String, text: String) {
        val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return
        cm.setPrimaryClip(ClipData.newPlainText(label, text))
    }

    fun showStockAlertNotification(context: Context, payload: StockAlertNotificationPayload) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                return
            }
        }
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
        val channel = NotificationChannel(STOCK_CHANNEL_ID, "Stock Alerts", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Notifications when products fall below low-stock thresholds"
        }
        nm.createNotificationChannel(channel)
        val notification = NotificationCompat.Builder(context, STOCK_CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(payload.title)
            .setContentText(payload.body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(payload.body))
            .setAutoCancel(true)
            .build()
        nm.notify(1042, notification)
    }

    fun shareTextFile(context: Context, fileName: String, content: String, mimeType: String = "application/json") {
        runCatching {
            val dir = File(context.cacheDir, "exports").apply { mkdirs() }
            val file = File(dir, fileName)
            file.writeText(content, Charsets.UTF_8)
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = mimeType
                putExtra(Intent.EXTRA_STREAM, uri)
                putExtra(Intent.EXTRA_SUBJECT, fileName)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            context.startActivity(Intent.createChooser(intent, "Export $fileName"))
        }.onFailure {
            Toast.makeText(context, "Could not share file: ${it.message}", Toast.LENGTH_SHORT).show()
        }
    }

    fun readUriText(context: Context, uri: Uri): Result<String> = runCatching {
        context.contentResolver.openInputStream(uri)?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }
            ?: error("Unable to open selected file")
    }

    fun printHtmlReceipt(context: Context, title: String, htmlBody: String) {
        val activity = context as? FragmentActivity ?: return
        val webView = WebView(activity)
        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                val printMgr = activity.getSystemService(Context.PRINT_SERVICE) as? PrintManager ?: return
                val adapter = webView.createPrintDocumentAdapter(title)
                printMgr.print(title, adapter, PrintAttributes.Builder().build())
            }
        }
        webView.loadDataWithBaseURL(null, htmlBody, "text/html", "UTF-8", null)
    }

    fun generateQrBitmap(content: String, sizePx: Int = 512): Bitmap? = runCatching {
        val bitMatrix = QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, sizePx, sizePx)
        val w = bitMatrix.width
        val h = bitMatrix.height
        val pixels = IntArray(w * h)
        for (y in 0 until h) {
            val offset = y * w
            for (x in 0 until w) {
                pixels[offset + x] = if (bitMatrix[x, y]) 0xFF0F172A.toInt() else 0xFFFFFFFF.toInt()
            }
        }
        Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888).apply {
            setPixels(pixels, 0, w, 0, 0, w, h)
        }
    }.getOrNull()

    fun decodeImageFromUriToBase64AndQr(context: Context, uri: Uri): Pair<String?, String?> {
        val stream = context.contentResolver.openInputStream(uri) ?: return null to null
        val bmp = stream.use { BitmapFactory.decodeStream(it) } ?: return null to null
        val scaled = scaleDownBitmap(bmp, 640)
        val baos = ByteArrayOutputStream()
        scaled.compress(Bitmap.CompressFormat.PNG, 90, baos)
        val b64 = "data:image/png;base64," + android.util.Base64.encodeToString(baos.toByteArray(), android.util.Base64.NO_WRAP)
        val decodedCode = decodeQrOrBarcodeFromBitmap(bmp)
        return b64 to decodedCode
    }

    fun decodeQrOrBarcodeFromBitmap(bitmap: Bitmap): String? = runCatching {
        val scaled = scaleDownBitmap(bitmap, 1280)
        val w = scaled.width
        val h = scaled.height
        val pixels = IntArray(w * h)
        scaled.getPixels(pixels, 0, w, 0, 0, w, h)
        val source = RGBLuminanceSource(w, h, pixels)
        val binaryBitmap = BinaryBitmap(HybridBinarizer(source))
        val hints = mapOf(DecodeHintType.TRY_HARDER to true)
        MultiFormatReader().decode(binaryBitmap, hints).text
    }.getOrNull()

    fun decodeQrOrBarcodeFromUri(context: Context, uri: Uri): String? {
        val stream = context.contentResolver.openInputStream(uri) ?: return null
        val bmp = stream.use { BitmapFactory.decodeStream(it) } ?: return null
        return decodeQrOrBarcodeFromBitmap(bmp)
    }

    suspend fun decodeAllBarcodesFromUri(
        context: Context,
        uri: Uri,
        symbologies: Set<BarcodeSymbology> = BarcodeSymbology.ALL_10
    ): List<Pair<String, String>> = withContext(Dispatchers.IO) {
        val mlKitResults: List<Pair<String, String>> = runCatching {
            val image = InputImage.fromFilePath(context, uri)
            val scanner = BarcodeScannerEngine.buildClient(
                symbologies = symbologies,
                enableAutoZoom = false
            )
            try {
                suspendCancellableCoroutine { cont ->
                    scanner.process(image)
                        .addOnSuccessListener { list ->
                            val found = list.mapNotNull { b ->
                                val raw = b.rawValue?.trim()?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
                                raw to BarcodeSymbology.labelForMlKitFormat(b.format)
                            }
                            if (cont.isActive) cont.resume(found)
                        }
                        .addOnFailureListener {
                            if (cont.isActive) cont.resume(emptyList())
                        }
                }
            } finally {
                runCatching { scanner.close() }
            }
        }.getOrDefault(emptyList())

        if (mlKitResults.isNotEmpty()) return@withContext mlKitResults.distinctBy { it.first }

        // ZXing GenericMultipleBarcodeReader fallback
        runCatching {
            val stream = context.contentResolver.openInputStream(uri) ?: return@runCatching emptyList()
            val bmp = stream.use { BitmapFactory.decodeStream(it) } ?: return@runCatching emptyList()
            val scaled = scaleDownBitmap(bmp, 1600)
            val w = scaled.width
            val h = scaled.height
            val pixels = IntArray(w * h)
            scaled.getPixels(pixels, 0, w, 0, 0, w, h)
            val source = RGBLuminanceSource(w, h, pixels)
            val binaryBitmap = BinaryBitmap(HybridBinarizer(source))
            val hints = mapOf(DecodeHintType.TRY_HARDER to true)
            GenericMultipleBarcodeReader(MultiFormatReader()).decodeMultiple(binaryBitmap, hints)
                .mapNotNull { res ->
                    res.text?.trim()?.takeIf { it.isNotEmpty() }?.let { txt ->
                        txt to res.barcodeFormat.name.replace('_', '-')
                    }
                }
                .distinctBy { it.first }
        }.getOrDefault(emptyList())
    }

    private fun scaleDownBitmap(src: Bitmap, maxDim: Int): Bitmap {
        val w = src.width
        val h = src.height
        if (w <= maxDim && h <= maxDim) return src
        val ratio = maxDim.toFloat() / maxOf(w, h).toFloat()
        return Bitmap.createScaledBitmap(src, (w * ratio).toInt().coerceAtLeast(1), (h * ratio).toInt().coerceAtLeast(1), true)
    }

    fun isBiometricAvailable(context: Context): Boolean {
        val mgr = BiometricManager.from(context)
        return mgr.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.BIOMETRIC_WEAK) == BiometricManager.BIOMETRIC_SUCCESS
    }

    fun authenticateBiometric(
        activity: FragmentActivity,
        title: String = "Unlock Store Manager Access",
        subtitle: String = "Verify using device fingerprint or face biometrics",
        onSuccess: () -> Unit,
        onError: (String) -> Unit
    ) {
        val executor = ContextCompat.getMainExecutor(activity)
        val prompt = BiometricPrompt(activity, executor, object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                super.onAuthenticationSucceeded(result)
                onSuccess()
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                super.onAuthenticationError(errorCode, errString)
                onError(errString.toString())
            }
        })
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle(subtitle)
            .setNegativeButtonText("Use PIN Instead")
            .build()
        prompt.authenticate(info)
    }

    private const val UPDATE_PREFS = "eternalblue_update_auth"
    private const val KEY_GH_TOKEN = "github_read_token"

    fun getSavedGithubToken(context: Context): String {
        return context.getSharedPreferences(UPDATE_PREFS, Context.MODE_PRIVATE)
            .getString(KEY_GH_TOKEN, "")
            .orEmpty()
            .trim()
    }

    fun saveGithubToken(context: Context, token: String) {
        val cleaned = token.trim()
        context.getSharedPreferences(UPDATE_PREFS, Context.MODE_PRIVATE)
            .edit()
            .apply {
                if (cleaned.isEmpty()) remove(KEY_GH_TOKEN) else putString(KEY_GH_TOKEN, cleaned)
            }
            .apply()
    }

    fun openUrl(context: Context, url: String) {
        runCatching {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                if (context !is FragmentActivity) {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            }
            context.startActivity(intent)
        }.onFailure {
            Toast.makeText(context, "Could not open link: ${it.message}", Toast.LENGTH_SHORT).show()
        }
    }

    /**
     * Opens direct GitHub .apk release asset URLs in a web browser rather than letting the GitHub
     * Android app intercept github.com links (the GitHub app often fails to download .apk assets).
     */
    fun openApkDownloadInBrowser(context: Context, apkUrl: String, fallbackReleasePageUrl: String? = null) {
        val targetUri = Uri.parse(apkUrl)
        val launchedInBrowser = runCatching {
            val probeIntent = Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com"))
            val browsers = context.packageManager.queryIntentActivities(probeIntent, 0)
                .mapNotNull { it.activityInfo?.packageName }
                .filter { pkg ->
                    !pkg.contains("github", ignoreCase = true) &&
                        !pkg.contains("resolver", ignoreCase = true)
                }
                .distinct()

            val preferredPkg = browsers.firstOrNull { it.contains("chrome", ignoreCase = true) }
                ?: browsers.firstOrNull()

            if (preferredPkg != null) {
                val browserIntent = Intent(Intent.ACTION_VIEW, targetUri).apply {
                    `package` = preferredPkg
                    addCategory(Intent.CATEGORY_BROWSABLE)
                    if (context !is FragmentActivity) {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                }
                context.startActivity(browserIntent)
                true
            } else {
                false
            }
        }.getOrDefault(false)

        if (!launchedInBrowser) {
            runCatching {
                val fallbackIntent = Intent(Intent.ACTION_VIEW, targetUri).apply {
                    if (context !is FragmentActivity) addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(fallbackIntent)
            }.onFailure {
                val pageUrl = fallbackReleasePageUrl?.takeIf { u -> u.isNotBlank() }
                if (pageUrl != null) {
                    openUrl(context, pageUrl)
                } else {
                    Toast.makeText(context, "Could not start APK download: ${it.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }
}
