package com.example.hardware

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.media.ToneGenerator
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

object AndroidDeviceBridge {
    fun playBeep() {
        runCatching {
            val tg = ToneGenerator(AudioManager.STREAM_NOTIFICATION, 75)
            tg.startTone(ToneGenerator.TONE_PROP_BEEP, 120)
        }
    }

    fun copyText(context: Context, label: String, text: String) {
        val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return
        cm.setPrimaryClip(ClipData.newPlainText(label, text))
    }

    fun shareTextFile(context: Context, fileName: String, content: String, mimeType: String = "text/plain") {
        runCatching {
            val file = File(context.cacheDir, fileName)
            file.writeText(content)
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = mimeType
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            context.startActivity(Intent.createChooser(intent, "Share $fileName"))
        }
    }

    fun openUrl(context: Context, url: String) {
        runCatching {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        }
    }

    sealed class ApkInstallOutcome {
        data object InstallerLaunched : ApkInstallOutcome()
        data object NeedsInstallPermission : ApkInstallOutcome()
        data class Failed(val reason: String) : ApkInstallOutcome()
    }

    suspend fun downloadAndInstallApk(
        context: Context,
        apkUrl: String,
        expectedFileName: String?,
        onProgress: (Int) -> Unit
    ): ApkInstallOutcome = withContext(Dispatchers.IO) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                !context.packageManager.canRequestPackageInstalls()
            ) {
                withContext(Dispatchers.Main) {
                    val permIntent = Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:${context.packageName}")
                    ).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(permIntent)
                }
                return@withContext ApkInstallOutcome.NeedsInstallPermission
            }

            val updatesDir = File(context.cacheDir, "updates").apply { mkdirs() }
            val safeName = (expectedFileName ?: "eternalblue-update.apk").replace(Regex("[^a-zA-Z0-9._-]"), "_")
            val apkFile = File(updatesDir, safeName)

            val conn = (URL(apkUrl).openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = true
                connectTimeout = 10_000
                readTimeout = 20_000
                setRequestProperty("User-Agent", "EternalBluePOS-Android")
                setRequestProperty("Accept", "application/octet-stream")
            }
            val code = conn.responseCode
            if (code !in 200..299) {
                conn.disconnect()
                return@withContext ApkInstallOutcome.Failed("Download failed (HTTP $code)")
            }

            val totalBytes = conn.contentLengthLong.takeIf { it > 0L } ?: -1L
            var downloaded = 0L
            var lastPct = -1
            conn.inputStream.use { input ->
                FileOutputStream(apkFile).use { output ->
                    val buf = ByteArray(16 * 1024)
                    while (true) {
                        val read = input.read(buf)
                        if (read <= 0) break
                        output.write(buf, 0, read)
                        downloaded += read
                        if (totalBytes > 0L) {
                            val pct = ((downloaded * 100L) / totalBytes).toInt().coerceIn(0, 100)
                            if (pct != lastPct) {
                                lastPct = pct
                                withContext(Dispatchers.Main) { onProgress(pct) }
                            }
                        }
                    }
                }
            }
            conn.disconnect()
            withContext(Dispatchers.Main) { onProgress(100) }

            val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", apkFile)
            withContext(Dispatchers.Main) {
                val installIntent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                context.startActivity(installIntent)
            }
            ApkInstallOutcome.InstallerLaunched
        } catch (e: Exception) {
            ApkInstallOutcome.Failed(e.message ?: "Unable to download APK")
        }
    }
}
