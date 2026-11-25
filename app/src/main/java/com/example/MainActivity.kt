package com.example

import android.Manifest
import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Message
import android.provider.Settings
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.Executors

class MainActivity : ComponentActivity() {
    private lateinit var webView: WebView
    private var pendingCameraPermissionRequest: PermissionRequest? = null
    private var pendingCameraBridgeCallbackId: String? = null
    private var pendingFilePathCallback: ValueCallback<Array<Uri>>? = null
    private var pendingApkInstallFile: File? = null
    private val ioExecutor = Executors.newSingleThreadExecutor()

    @Volatile
    private var updateDownloading = false

    private val requestCameraPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            val request = pendingCameraPermissionRequest
            pendingCameraPermissionRequest = null
            if (request != null) {
                safeRespondPermissionRequest(request, granted)
            }
            val bridgeCbId = pendingCameraBridgeCallbackId
            pendingCameraBridgeCallbackId = null
            if (bridgeCbId != null) {
                emitCameraPermissionBridgeResult(bridgeCbId, granted)
            }
        }

    private val requestFileChooser =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val callback = pendingFilePathCallback
            pendingFilePathCallback = null
            if (callback != null) {
                val uris = WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
                try {
                    callback.onReceiveValue(uris)
                } catch (_: Throwable) {
                    // ignore stale callback
                }
            }
        }

    private val requestUnknownAppSources =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
            val file = pendingApkInstallFile
            if (file != null && file.exists() && canInstallPackages()) {
                pendingApkInstallFile = null
                launchApkInstaller(file)
            } else if (file != null && !canInstallPackages()) {
                emitUpdateEvent("PERMISSION_NEEDED", 100, "Enable 'Install unknown apps' for EternalBlue POS, then tap Install again.")
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this)
        setContentView(webView)
        setupWebView(webView)

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (webView.canGoBack()) {
                        webView.goBack()
                    } else {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                    }
                }
            }
        )

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl("https://$APP_HOST/index.html")
        }
    }

    override fun onResume() {
        super.onResume()
        val file = pendingApkInstallFile
        if (file != null && file.exists() && canInstallPackages()) {
            pendingApkInstallFile = null
            launchApkInstaller(file)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView(view: WebView) {
        view.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = true
            setSupportMultipleWindows(true)
            javaScriptCanOpenWindowsAutomatically = true
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            useWideViewPort = true
            loadWithOverviewMode = true
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                safeBrowsingEnabled = true
            }
        }

        view.addJavascriptInterface(AndroidPosBridge(), "AndroidPosBridge")

        view.setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            if (url.startsWith("https://") || url.startsWith("http://")) {
                enqueueSystemDownload(url, userAgent, contentDisposition, mimeType)
            } else {
                openExternalUrl(url)
            }
        }

        view.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                val uri = request.url
                if (uri.host != APP_HOST) return null
                val rawPath = uri.path?.trimStart('/').orEmpty()
                val assetSubPath = if (rawPath.isEmpty()) "index.html" else rawPath
                return openAssetResponse("web/$assetSubPath")
                    ?: if (!assetSubPath.contains('.')) openAssetResponse("web/index.html") else null
            }

            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                val uri = request.url
                if (uri.host == APP_HOST) return false
                val urlStr = uri.toString()
                if (urlStr.lowercase().endsWith(".apk")) {
                    enqueueSystemDownload(
                        urlStr,
                        view.settings.userAgentString,
                        null,
                        "application/vnd.android.package-archive"
                    )
                    return true
                }
                openExternalUrl(urlStr)
                return true
            }
        }

        view.webChromeClient = object : WebChromeClient() {
            override fun onCreateWindow(
                view: WebView,
                isDialog: Boolean,
                isUserGesture: Boolean,
                resultMsg: Message?
            ): Boolean {
                val transport = resultMsg?.obj as? WebView.WebViewTransport ?: return false
                val tempWebView = WebView(this@MainActivity)
                tempWebView.webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(
                        subView: WebView,
                        request: WebResourceRequest
                    ): Boolean {
                        val url = request.url.toString()
                        if (url.lowercase().endsWith(".apk")) {
                            enqueueSystemDownload(
                                url,
                                subView.settings.userAgentString,
                                null,
                                "application/vnd.android.package-archive"
                            )
                        } else {
                            openExternalUrl(url)
                        }
                        tempWebView.destroy()
                        return true
                    }
                }
                transport.webView = tempWebView
                resultMsg.sendToTarget()
                return true
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    try {
                        val wantsCamera = request.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)
                        if (!wantsCamera) {
                            safeRespondPermissionRequest(request, false)
                            return@runOnUiThread
                        }
                        val granted = ContextCompat.checkSelfPermission(
                            this@MainActivity,
                            Manifest.permission.CAMERA
                        ) == PackageManager.PERMISSION_GRANTED
                        if (granted) {
                            safeRespondPermissionRequest(request, true)
                        } else {
                            pendingCameraPermissionRequest?.let { stale ->
                                safeRespondPermissionRequest(stale, false)
                            }
                            pendingCameraPermissionRequest = request
                            requestCameraPermission.launch(Manifest.permission.CAMERA)
                        }
                    } catch (_: Throwable) {
                        safeRespondPermissionRequest(request, false)
                    }
                }
            }

            override fun onPermissionRequestCanceled(request: PermissionRequest) {
                runOnUiThread {
                    if (pendingCameraPermissionRequest == request) {
                        pendingCameraPermissionRequest = null
                    }
                }
            }

            override fun onShowFileChooser(
                webView: WebView,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams
            ): Boolean {
                pendingFilePathCallback?.let { old ->
                    try {
                        old.onReceiveValue(null)
                    } catch (_: Throwable) {
                    }
                }
                pendingFilePathCallback = filePathCallback
                return try {
                    val intent = fileChooserParams.createIntent()
                    requestFileChooser.launch(intent)
                    true
                } catch (_: Throwable) {
                    pendingFilePathCallback = null
                    try {
                        filePathCallback.onReceiveValue(null)
                    } catch (_: Throwable) {
                    }
                    false
                }
            }
        }
    }

    private fun safeRespondPermissionRequest(request: PermissionRequest, grantVideo: Boolean) {
        runOnUiThread {
            try {
                if (grantVideo && request.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) {
                    request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
                } else {
                    request.deny()
                }
            } catch (_: Throwable) {
                // Ignore IllegalStateException if WebView already invalidated or canceled the request
            }
        }
    }

    private fun emitCameraPermissionBridgeResult(callbackId: String, granted: Boolean) {
        val safeCb = JSONObject.quote(callbackId)
        runOnUiThread {
            if (this::webView.isInitialized) {
                webView.evaluateJavascript(
                    "window.__onAndroidCameraPermissionResult && window.__onAndroidCameraPermissionResult($safeCb, $granted);",
                    null
                )
            }
        }
    }

    private fun openExternalUrl(rawUrl: String) {
        try {
            val uri = Uri.parse(rawUrl)
            val scheme = uri.scheme?.lowercase()
            if (scheme == "http" || scheme == "https") {
                startActivity(Intent(Intent.ACTION_VIEW, uri))
            }
        } catch (_: Exception) {
            runOnUiThread {
                Toast.makeText(this, "No browser available to open link.", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun enqueueSystemDownload(
        url: String,
        userAgent: String?,
        contentDisposition: String?,
        mimeType: String?
    ) {
        try {
            val request = DownloadManager.Request(Uri.parse(url))
            val fileName = URLUtil.guessFileName(url, contentDisposition, mimeType)
            if (!mimeType.isNullOrBlank()) request.setMimeType(mimeType)
            if (!userAgent.isNullOrBlank()) request.addRequestHeader("User-Agent", userAgent)
            request.setTitle(fileName)
            request.setDescription("Downloading via EternalBlue POS")
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)
            val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            dm.enqueue(request)
            runOnUiThread {
                Toast.makeText(this, "Downloading $fileName...", Toast.LENGTH_SHORT).show()
            }
        } catch (_: Exception) {
            openExternalUrl(url)
        }
    }

    private fun canInstallPackages(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            packageManager.canRequestPackageInstalls()
        } else {
            true
        }
    }

    private fun startApkDownloadAndInstall(
        apkUrl: String,
        fileName: String,
        expectedSha256: String?,
        manifestUrl: String?
    ) {
        if (updateDownloading) {
            emitUpdateEvent("DOWNLOADING", 0, "Update download is already in progress...")
            return
        }
        val cleanUrl = apkUrl.trim()
        if (!isOfficialApkUrl(cleanUrl) || manifestUrl?.trim() != TRUSTED_UPDATE_MANIFEST) {
            emitUpdateEvent("ERROR", 0, "Update must come from the trusted GitHub release.")
            return
        }

        updateDownloading = true
        emitUpdateEvent("DOWNLOADING", 1, "Connecting to GitHub...")

        ioExecutor.execute {
            try {
                val manifestJson = fetchTextFollowingRedirects(TRUSTED_UPDATE_MANIFEST)
                val manifest = JSONObject(manifestJson)
                val resolvedSha = manifest.optString("sha256", "").trim().lowercase()
                val resolvedUrl = manifest.optString("apkUrl", "").trim()
                if (!resolvedSha.matches(Regex("^[a-f0-9]{64}$")) || !isOfficialApkUrl(resolvedUrl)) {
                    throw IOException("The trusted update manifest is invalid.")
                }
                if (resolvedUrl != cleanUrl) {
                    throw IOException("The APK URL does not match the trusted update manifest.")
                }
                val suppliedSha = expectedSha256?.trim()?.lowercase()
                if (!suppliedSha.isNullOrEmpty() && suppliedSha != resolvedSha) {
                    throw IOException("The APK checksum does not match the trusted update manifest.")
                }

                val safeName = fileName.replace(Regex("[^A-Za-z0-9._-]"), "_")
                    .ifBlank { "EternalBlue-POS-update.apk" }
                val updatesDir = File(cacheDir, "updates").apply { mkdirs() }
                updatesDir.listFiles()?.forEach { old ->
                    if (old.isFile && old.name != safeName) old.delete()
                }
                val targetFile = File(updatesDir, safeName)
                val tempFile = File(updatesDir, "$safeName.part")
                if (tempFile.exists()) tempFile.delete()

                val conn = openFollowingRedirects(resolvedUrl)
                val totalBytes = conn.contentLengthLong
                val digest = MessageDigest.getInstance("SHA-256")
                var downloaded = 0L
                var lastPct = -1

                BufferedInputStream(conn.inputStream, 16 * 1024).use { input ->
                    FileOutputStream(tempFile).use { output ->
                        val buffer = ByteArray(16 * 1024)
                        while (true) {
                            val read = input.read(buffer)
                            if (read <= 0) break
                            output.write(buffer, 0, read)
                            digest.update(buffer, 0, read)
                            downloaded += read
                            if (totalBytes > 0) {
                                val pct = ((downloaded * 100L) / totalBytes).toInt().coerceIn(1, 99)
                                if (pct != lastPct && (pct % 5 == 0 || pct >= 98)) {
                                    lastPct = pct
                                    val mbDone = String.format("%.1f", downloaded / (1024.0 * 1024.0))
                                    val mbTotal = String.format("%.1f", totalBytes / (1024.0 * 1024.0))
                                    emitUpdateEvent("DOWNLOADING", pct, "Downloading $mbDone / $mbTotal MB ($pct%)")
                                }
                            } else if (lastPct < 50) {
                                lastPct = 50
                                emitUpdateEvent("DOWNLOADING", 50, "Downloading update package...")
                            }
                        }
                        output.flush()
                    }
                }
                conn.disconnect()

                if (downloaded < 100_000L) {
                    tempFile.delete()
                    throw IOException("Downloaded APK is incomplete ($downloaded bytes).")
                }

                emitUpdateEvent("VERIFYING", 99, "Verifying SHA-256 checksum...")
                val actualSha = digest.digest().joinToString("") { "%02x".format(it) }
                if (!actualSha.equals(resolvedSha, ignoreCase = true)) {
                    tempFile.delete()
                    throw IOException("Checksum mismatch. File may be corrupted.")
                }
                if (targetFile.exists()) targetFile.delete()
                if (!tempFile.renameTo(targetFile)) {
                    tempFile.copyTo(targetFile, overwrite = true)
                    tempFile.delete()
                }

                val verifyError = verifyUpdateApk(targetFile)
                if (verifyError != null) {
                    targetFile.delete()
                    throw IOException(verifyError)
                }

                runOnUiThread {
                    updateDownloading = false
                    if (!canInstallPackages()) {
                        pendingApkInstallFile = targetFile
                        emitUpdateEvent(
                            "PERMISSION_NEEDED",
                            100,
                            "Allow 'Install unknown apps' for EternalBlue POS to finish updating."
                        )
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            val permIntent = Intent(
                                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                Uri.parse("package:$packageName")
                            )
                            requestUnknownAppSources.launch(permIntent)
                        }
                    } else {
                        emitUpdateEvent("READY", 100, "Opening Android installer...")
                        launchApkInstaller(targetFile)
                    }
                }
            } catch (e: Exception) {
                updateDownloading = false
                emitUpdateEvent("ERROR", 0, e.message ?: "Update download failed.")
            }
        }
    }

    private fun launchApkInstaller(apkFile: File) {
        try {
            val contentUri = FileProvider.getUriForFile(
                this,
                "$packageName.fileprovider",
                apkFile
            )
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(contentUri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true)
            }
            try {
                startActivity(intent)
            } catch (_: Exception) {
                @Suppress("DEPRECATION")
                val fallback = Intent(Intent.ACTION_INSTALL_PACKAGE).apply {
                    data = contentUri
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true)
                }
                startActivity(fallback)
            }
        } catch (e: Exception) {
            emitUpdateEvent("ERROR", 0, "Could not launch installer: ${e.message ?: "error"}")
        }
    }

    private fun isOfficialApkUrl(rawUrl: String): Boolean {
        return try {
            val url = URL(rawUrl)
            url.protocol.equals("https", ignoreCase = true) &&
                url.host.equals("github.com", ignoreCase = true) &&
                (url.port == -1 || url.port == 443) &&
                url.userInfo == null &&
                url.query == null &&
                url.ref == null &&
                Regex("^/$TRUSTED_UPDATE_REPO/releases/download/[^/]+/[^/]+\\.apk$")
                    .matches(url.path)
        } catch (_: Exception) {
            false
        }
    }

    @Suppress("DEPRECATION")
    private fun verifyUpdateApk(apkFile: File): String? {
        val signatureFlag = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            PackageManager.GET_SIGNING_CERTIFICATES or PackageManager.GET_SIGNATURES
        } else {
            PackageManager.GET_SIGNATURES
        }
        val archiveInfo = getPackageInfoForArchive(apkFile.absolutePath, signatureFlag)
            ?: return "Downloaded APK file could not be read by Android PackageManager."

        if (archiveInfo.packageName != packageName) {
            return "Package ID mismatch: downloaded '${archiveInfo.packageName}' does not match installed '$packageName'. Export a JSON backup in Settings, uninstall this app, and install the release APK from GitHub."
        }

        val installedInfo = getInstalledPackageInfo(signatureFlag)
        val archiveCode = packageVersionCode(archiveInfo)
        val installedCode = packageVersionCode(installedInfo)
        if (archiveCode < installedCode) {
            return "Downloaded APK build ($archiveCode) is older than installed build ($installedCode)."
        }

        val archiveSigners = packageSignerSet(archiveInfo)
        if (archiveSigners.isEmpty()) {
            return "Downloaded APK has no readable signing certificate."
        }

        val installedSigners = packageSignerSet(installedInfo)
        val archiveHistory = packageSignerHistorySet(archiveInfo)
        val signersMatch = archiveSigners == installedSigners ||
            (installedSigners.isNotEmpty() && archiveHistory.containsAll(installedSigners))

        if (!signersMatch) {
            val installedFp = shortSignerFingerprint(installedSigners)
            val archiveFp = shortSignerFingerprint(archiveSigners)
            return "Signing certificate mismatch (installed $installedFp vs APK $archiveFp). Android cannot update across different signing keys (e.g. debug vs release). Export a JSON backup in Settings, uninstall this build, then install the APK from GitHub Releases."
        }
        return null
    }

    @Suppress("DEPRECATION")
    private fun getPackageInfoForArchive(path: String, flags: Int): PackageInfo? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            packageManager.getPackageArchiveInfo(path, PackageManager.PackageInfoFlags.of(flags.toLong()))
        } else {
            packageManager.getPackageArchiveInfo(path, flags)
        }
    }

    @Suppress("DEPRECATION")
    private fun getInstalledPackageInfo(flags: Int): PackageInfo {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            packageManager.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(flags.toLong()))
        } else {
            packageManager.getPackageInfo(packageName, flags)
        }
    }

    @Suppress("DEPRECATION")
    private fun packageSignerSet(info: PackageInfo): Set<String> {
        val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val signingInfo = info.signingInfo
            val modern = signingInfo?.apkContentsSigners?.takeIf { it.isNotEmpty() }
                ?: signingInfo?.signingCertificateHistory?.takeIf { it.isNotEmpty() }
            modern ?: info.signatures
        } else {
            info.signatures
        } ?: return emptySet()
        return signatures.map { Base64.encodeToString(it.toByteArray(), Base64.NO_WRAP) }.toSet()
    }

    @Suppress("DEPRECATION")
    private fun packageSignerHistorySet(info: PackageInfo): Set<String> {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return packageSignerSet(info)
        val history = info.signingInfo?.signingCertificateHistory
            ?: return packageSignerSet(info)
        return history.map { Base64.encodeToString(it.toByteArray(), Base64.NO_WRAP) }.toSet()
    }

    private fun shortSignerFingerprint(signers: Set<String>): String {
        val first = signers.firstOrNull() ?: return "none"
        return try {
            val raw = Base64.decode(first, Base64.NO_WRAP)
            val hash = MessageDigest.getInstance("SHA-256").digest(raw)
            hash.take(4).joinToString("") { "%02X".format(it) }
        } catch (_: Exception) {
            "unknown"
        }
    }

    @Suppress("DEPRECATION")
    private fun packageVersionCode(info: PackageInfo): Long {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            info.longVersionCode
        } else {
            info.versionCode.toLong()
        }
    }

    private fun isTrustedUpdateHost(host: String?): Boolean {
        if (host.isNullOrBlank()) return false
        return host.equals("github.com", ignoreCase = true) ||
            host.equals("release-assets.githubusercontent.com", ignoreCase = true) ||
            host.equals("objects.githubusercontent.com", ignoreCase = true)
    }

    private fun openFollowingRedirects(startUrl: String): HttpURLConnection {
        var current = startUrl
        for (hop in 0 until 6) {
            val url = URL(current)
            if (!url.protocol.equals("https", ignoreCase = true) ||
                (url.port != -1 && url.port != 443) ||
                url.userInfo != null ||
                !isTrustedUpdateHost(url.host)
            ) {
                throw IOException("Blocked untrusted update redirect.")
            }
            val conn = (url.openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = false
                connectTimeout = 15_000
                readTimeout = 30_000
                setRequestProperty("User-Agent", "EternalBluePOS-Android")
            }
            val code = conn.responseCode
            if (code in 300..399) {
                val loc = conn.getHeaderField("Location")
                conn.disconnect()
                if (loc.isNullOrBlank()) throw IOException("Redirect without Location header.")
                val redirect = URL(url, loc)
                if (!redirect.protocol.equals("https", ignoreCase = true) ||
                    (redirect.port != -1 && redirect.port != 443) ||
                    redirect.userInfo != null ||
                    !isTrustedUpdateHost(redirect.host)
                ) {
                    throw IOException("Blocked untrusted update redirect.")
                }
                current = redirect.toString()
                continue
            }
            if (code !in 200..299) {
                conn.disconnect()
                throw IOException("GitHub download returned HTTP $code.")
            }
            return conn
        }
        throw IOException("Too many redirects while downloading update.")
    }

    private fun fetchTextFollowingRedirects(startUrl: String): String {
        val conn = openFollowingRedirects(startUrl)
        return try {
            conn.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
        } finally {
            conn.disconnect()
        }
    }

    private fun emitUpdateEvent(status: String, progress: Int, message: String) {
        val payload = JSONObject().apply {
            put("status", status)
            put("progress", progress)
            put("message", message)
        }.toString()
        runOnUiThread {
            if (this::webView.isInitialized) {
                webView.evaluateJavascript(
                    "window.__onAndroidUpdateProgress && window.__onAndroidUpdateProgress($payload);",
                    null
                )
            }
        }
    }

    inner class AndroidPosBridge {
        @JavascriptInterface
        fun isAndroidHost(): Boolean = true

        @JavascriptInterface
        fun requestCameraPermission(callbackId: String) {
            runOnUiThread {
                val granted = ContextCompat.checkSelfPermission(
                    this@MainActivity,
                    Manifest.permission.CAMERA
                ) == PackageManager.PERMISSION_GRANTED
                if (granted) {
                    emitCameraPermissionBridgeResult(callbackId, true)
                } else {
                    pendingCameraBridgeCallbackId?.let { staleCb ->
                        emitCameraPermissionBridgeResult(staleCb, false)
                    }
                    pendingCameraBridgeCallbackId = callbackId
                    try {
                        requestCameraPermission.launch(Manifest.permission.CAMERA)
                    } catch (_: Throwable) {
                        pendingCameraBridgeCallbackId = null
                        emitCameraPermissionBridgeResult(callbackId, false)
                    }
                }
            }
        }

        @Suppress("DEPRECATION")
        @JavascriptInterface
        fun getInstalledVersionInfo(): String {
            return try {
                val sigFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    PackageManager.GET_SIGNING_CERTIFICATES or PackageManager.GET_SIGNATURES
                } else {
                    PackageManager.GET_SIGNATURES
                }
                val pInfo = getInstalledPackageInfo(sigFlags)
                val vCode = packageVersionCode(pInfo)
                val certFp = shortSignerFingerprint(packageSignerSet(pInfo))
                JSONObject().apply {
                    put("versionName", pInfo.versionName ?: "2.3.18")
                    put("versionCode", vCode)
                    put("certFingerprint", certFp)
                    put("packageId", packageName)
                }.toString()
            } catch (_: Exception) {
                """{"versionName":"2.3.18","versionCode":18}"""
            }
        }

        @JavascriptInterface
        fun fetchUpdateManifestNative(repoSlug: String, callbackId: String) {
            val clean = repoSlug.trim().removePrefix("https://github.com/").removeSuffix(".git").trim('/')
            val safeCb = JSONObject.quote(callbackId)
            if (clean != TRUSTED_UPDATE_REPO) {
                runOnUiThread {
                    if (this@MainActivity::webView.isInitialized) {
                        webView.evaluateJavascript(
                            "window.__onAndroidManifestResult && window.__onAndroidManifestResult($safeCb, null, 'Invalid repo');",
                            null
                        )
                    }
                }
                return
            }
            ioExecutor.execute {
                try {
                    val json = fetchTextFollowingRedirects(TRUSTED_UPDATE_MANIFEST)
                    val quotedJson = JSONObject.quote(json)
                    runOnUiThread {
                        if (this@MainActivity::webView.isInitialized) {
                            webView.evaluateJavascript(
                                "window.__onAndroidManifestResult && window.__onAndroidManifestResult($safeCb, $quotedJson, null);",
                                null
                            )
                        }
                    }
                } catch (e: Exception) {
                    val err = JSONObject.quote(e.message ?: "Fetch failed")
                    runOnUiThread {
                        if (this@MainActivity::webView.isInitialized) {
                            webView.evaluateJavascript(
                                "window.__onAndroidManifestResult && window.__onAndroidManifestResult($safeCb, null, $err);",
                                null
                            )
                        }
                    }
                }
            }
        }

        @JavascriptInterface
        fun downloadAndInstallApk(
            apkUrl: String,
            fileName: String,
            expectedSha256: String?,
            manifestUrl: String?
        ) {
            startApkDownloadAndInstall(
                apkUrl = apkUrl,
                fileName = fileName.ifBlank { "EternalBlue-POS-update.apk" },
                expectedSha256 = expectedSha256,
                manifestUrl = manifestUrl
            )
        }

        @JavascriptInterface
        fun openExternal(url: String) {
            runOnUiThread { openExternalUrl(url) }
        }

        @JavascriptInterface
        fun saveAndShareFile(fileName: String, content: String, mimeType: String) {
            try {
                val safeName = fileName.replace(Regex("[^A-Za-z0-9._-]"), "_")
                    .ifBlank { "eternalblue_export.txt" }
                val dir = File(cacheDir, "exports").apply { mkdirs() }
                val outFile = File(dir, safeName)
                outFile.writeText(content, Charsets.UTF_8)
                val uri = FileProvider.getUriForFile(
                    this@MainActivity,
                    "$packageName.fileprovider",
                    outFile
                )
                val cleanMime = mimeType.substringBefore(';').ifBlank { "text/plain" }
                val share = Intent(Intent.ACTION_SEND).apply {
                    type = cleanMime
                    putExtra(Intent.EXTRA_STREAM, uri)
                    putExtra(Intent.EXTRA_SUBJECT, safeName)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                runOnUiThread {
                    startActivity(Intent.createChooser(share, "Export $safeName"))
                }
            } catch (e: Exception) {
                runOnUiThread {
                    Toast.makeText(
                        this@MainActivity,
                        "Export failed: ${e.message ?: "error"}",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }
        }
    }

    private fun openAssetResponse(assetPath: String): WebResourceResponse? {
        return try {
            val stream = assets.open(assetPath)
            val mime = guessMimeType(assetPath)
            WebResourceResponse(mime, "UTF-8", stream)
        } catch (_: IOException) {
            null
        }
    }

    private fun guessMimeType(path: String): String {
        return when (path.substringAfterLast('.', "").lowercase()) {
            "html" -> "text/html"
            "js", "mjs" -> "application/javascript"
            "css" -> "text/css"
            "json" -> "application/json"
            "jpg", "jpeg" -> "image/jpeg"
            "png" -> "image/png"
            "svg" -> "image/svg+xml"
            "webp" -> "image/webp"
            "woff2" -> "font/woff2"
            "woff" -> "font/woff"
            else -> "application/octet-stream"
        }
    }

    override fun onDestroy() {
        pendingCameraPermissionRequest?.let { safeRespondPermissionRequest(it, false) }
        pendingCameraPermissionRequest = null
        pendingCameraBridgeCallbackId = null
        pendingFilePathCallback?.let { cb ->
            try {
                cb.onReceiveValue(null)
            } catch (_: Throwable) {
            }
        }
        pendingFilePathCallback = null
        ioExecutor.shutdownNow()
        if (this::webView.isInitialized) {
            webView.destroy()
        }
        super.onDestroy()
    }

    companion object {
        private const val APP_HOST = "appassets.androidplatform.net"
        private const val TRUSTED_UPDATE_REPO = "Harley0321/eternalblue"
        private const val TRUSTED_UPDATE_MANIFEST =
            "https://github.com/$TRUSTED_UPDATE_REPO/releases/latest/download/update-manifest.json"
    }
}
