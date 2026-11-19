package com.example.hardware

import android.app.PendingIntent
import android.app.admin.DevicePolicyManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.media.AudioManager
import android.media.ToneGenerator
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

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

    fun isDeviceOwnerSilentCapable(context: Context): Boolean = runCatching {
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager
        dpm?.isDeviceOwnerApp(context.packageName) == true
    }.getOrDefault(false)

    sealed class UpdateCommitOutcome {
        data object SessionCommitted : UpdateCommitOutcome()
        data object NeedsInstallPermission : UpdateCommitOutcome()
        data class Failed(val reason: String) : UpdateCommitOutcome()
    }

    suspend fun streamAndCommitPackageUpdate(
        context: Context,
        packageUrl: String,
        expectedSha256: String? = null,
        promptPermissionIfMissing: Boolean = true,
        onProgress: (Int) -> Unit
    ): UpdateCommitOutcome = withContext(Dispatchers.IO) {
        val appCtx = context.applicationContext
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !appCtx.packageManager.canRequestPackageInstalls()
        ) {
            if (promptPermissionIfMissing) {
                withContext(Dispatchers.Main) {
                    val permIntent = Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:${appCtx.packageName}")
                    ).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    runCatching { appCtx.startActivity(permIntent) }
                }
            }
            return@withContext UpdateCommitOutcome.NeedsInstallPermission
        }

        val installer = appCtx.packageManager.packageInstaller
        var session: PackageInstaller.Session? = null
        var sessionId = -1

        try {
            val conn = (URL(packageUrl).openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = true
                connectTimeout = 10_000
                readTimeout = 25_000
                setRequestProperty("User-Agent", "EternalBluePOS-Android")
                setRequestProperty("Accept", "application/octet-stream")
            }
            val code = conn.responseCode
            if (code !in 200..299) {
                conn.disconnect()
                return@withContext UpdateCommitOutcome.Failed("Update failed (HTTP $code)")
            }

            val totalBytes = conn.contentLengthLong.takeIf { it > 0L } ?: -1L
            val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
                if (totalBytes > 0L) setSize(totalBytes)
                setAppPackageName(appCtx.packageName)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                    setRequestUpdateOwnership(true)
                }
            }

            sessionId = installer.createSession(params)
            session = installer.openSession(sessionId)

            val digest = if (!expectedSha256.isNullOrBlank()) MessageDigest.getInstance("SHA-256") else null
            var written = 0L
            var lastPct = -1

            conn.inputStream.use { input ->
                session.openWrite("base.apk", 0L, totalBytes).use { out ->
                    val buf = ByteArray(32 * 1024)
                    while (true) {
                        val read = input.read(buf)
                        if (read <= 0) break
                        out.write(buf, 0, read)
                        digest?.update(buf, 0, read)
                        written += read
                        if (totalBytes > 0L) {
                            val pct = ((written * 100L) / totalBytes).toInt().coerceIn(0, 99)
                            if (pct != lastPct) {
                                lastPct = pct
                                withContext(Dispatchers.Main) { onProgress(pct) }
                            }
                        }
                    }
                    session.fsync(out)
                }
            }
            conn.disconnect()

            if (digest != null && !expectedSha256.isNullOrBlank()) {
                val actualHex = digest.digest().joinToString("") { "%02x".format(it) }
                if (!actualHex.equals(expectedSha256.trim(), ignoreCase = true)) {
                    runCatching { session.abandon() }
                    return@withContext UpdateCommitOutcome.Failed("Update integrity check failed (SHA-256 mismatch)")
                }
            }

            withContext(Dispatchers.Main) { onProgress(100) }

            val callbackIntent = Intent(appCtx, UpdateResultReceiver::class.java)
            val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
            } else {
                PendingIntent.FLAG_UPDATE_CURRENT
            }
            val statusIntent = PendingIntent.getBroadcast(appCtx, sessionId, callbackIntent, flags)
            session.commit(statusIntent.intentSender)
            UpdateCommitOutcome.SessionCommitted
        } catch (e: Exception) {
            if (sessionId != -1) {
                runCatching { installer.abandonSession(sessionId) }
            } else {
                runCatching { session?.abandon() }
            }
            UpdateCommitOutcome.Failed(e.message ?: "Unable to apply update")
        }
    }
}
