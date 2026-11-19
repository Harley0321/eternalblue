package com.example.domain

import com.example.model.GitHubReleaseInfo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.net.HttpURLConnection
import java.net.URL

object GitHubUpdateChecker {
    private val json = Json { ignoreUnknownKeys = true }

    @Serializable
    private data class GhAsset(
        val name: String = "",
        val browser_download_url: String = ""
    )

    @Serializable
    private data class GhRelease(
        val tag_name: String = "",
        val name: String = "",
        val body: String = "",
        val html_url: String = "",
        val assets: List<GhAsset> = emptyList()
    )

    @Serializable
    private data class ReleaseManifestJson(
        val versionCode: Int = 0,
        val versionName: String = "",
        val apkName: String = "",
        val tag: String = ""
    )

    sealed class Outcome {
        data class UpdateAvailable(val release: GitHubReleaseInfo) : Outcome()
        data class UpToDate(val title: String, val remoteBuild: Int) : Outcome()
        data class Error(val message: String, val releasesPageUrl: String?) : Outcome()
    }

    private data class HttpFetchResult(
        val code: Int,
        val finalUrl: String,
        val body: String?,
        val errorMessage: String? = null
    )

    fun normalizeRepo(raw: String?): String {
        val cleaned = (raw ?: "").trim()
            .removePrefix("https://github.com/")
            .removePrefix("http://github.com/")
            .removePrefix("github.com/")
            .removeSuffix(".git")
            .trim('/')
        val parts = cleaned.split('/').filter { it.isNotBlank() }
        return if (parts.size >= 2) "${parts[0]}/${parts[1]}" else ""
    }

    fun releasesUrlForRepo(repo: String): String {
        val norm = normalizeRepo(repo)
        return if (norm.isNotEmpty()) "https://github.com/$norm/releases" else "https://github.com"
    }

    suspend fun checkLatestRelease(
        repoInput: String,
        currentVersionCode: Int,
        githubToken: String = ""
    ): Outcome = withContext(Dispatchers.IO) {
        val repo = normalizeRepo(repoInput)
        if (repo.isEmpty()) {
            return@withContext Outcome.Error(
                "Enter your GitHub repository as owner/repo first.",
                null
            )
        }
        val cleanToken = githubToken.trim()
        val releasesPage = "https://github.com/$repo/releases"
        val candidates = mutableListOf<GitHubReleaseInfo>()
        var lastHttpCode = 0
        var lastNetError: String? = null

        // Strategy 1 (Public, zero REST API rate-limit): version.json published with release assets
        if (cleanToken.isEmpty()) {
            val manifestUrls = listOf(
                "https://github.com/$repo/releases/latest/download/version.json",
                "https://github.com/$repo/releases/download/latest/version.json"
            )
            for (mUrl in manifestUrls) {
                val res = httpGetFollowingRedirects(mUrl, token = "", accept = "application/json")
                if (res.code in 200..299 && !res.body.isNullOrBlank()) {
                    val m = runCatching { json.decodeFromString(ReleaseManifestJson.serializer(), res.body) }.getOrNull()
                    if (m != null && m.versionCode > 0) {
                        val tag = m.tag.ifBlank { "v${m.versionName}" }.ifBlank { "latest" }
                        val apkName = m.apkName.ifBlank { "EternalBluePOS.apk" }
                        candidates.add(
                            GitHubReleaseInfo(
                                tagName = tag,
                                title = "EternalBlue POS v${m.versionName.ifBlank { m.versionCode.toString() }}",
                                remoteVersionCode = m.versionCode,
                                apkDownloadUrl = "https://github.com/$repo/releases/download/$tag/$apkName",
                                releasePageUrl = "https://github.com/$repo/releases/tag/$tag",
                                notes = "Build #${m.versionCode}"
                            )
                        )
                        break
                    }
                } else {
                    if (res.code > 0) lastHttpCode = res.code
                    if (!res.errorMessage.isNullOrBlank()) lastNetError = res.errorMessage
                }
            }
        }

        // Strategy 2: GitHub REST API (supports private repos via Bearer token + checks both releases/latest and tags/latest)
        val apiUrls = listOf(
            "https://api.github.com/repos/$repo/releases/latest",
            "https://api.github.com/repos/$repo/releases/tags/latest"
        )
        for (endpoint in apiUrls) {
            val res = httpGetFollowingRedirects(
                urlStr = endpoint,
                token = cleanToken,
                accept = "application/vnd.github+json"
            )
            if (res.code in 200..299 && !res.body.isNullOrBlank()) {
                val rel = runCatching { json.decodeFromString(GhRelease.serializer(), res.body) }.getOrNull()
                if (rel != null) {
                    val remoteBuild = parseBuildCode(rel.body, rel.name, rel.tag_name)
                    val versionedApk = rel.assets.firstOrNull {
                        it.name.endsWith(".apk", ignoreCase = true) && !it.name.equals("EternalBluePOS.apk", ignoreCase = true)
                    }
                    val anyApk = versionedApk ?: rel.assets.firstOrNull {
                        it.name.endsWith(".apk", ignoreCase = true)
                    }
                    val tag = rel.tag_name.ifBlank { "latest" }
                    val apkUrl = anyApk?.browser_download_url?.takeIf { it.isNotBlank() }
                        ?: "https://github.com/$repo/releases/download/$tag/EternalBluePOS.apk"
                    val title = rel.name.ifBlank { tag }
                    val htmlUrl = rel.html_url.ifBlank { releasesPage }

                    candidates.add(
                        GitHubReleaseInfo(
                            tagName = tag,
                            title = title,
                            remoteVersionCode = remoteBuild,
                            apkDownloadUrl = apkUrl,
                            releasePageUrl = htmlUrl,
                            notes = rel.body
                        )
                    )
                }
            } else {
                if (res.code > 0) lastHttpCode = res.code
                if (!res.errorMessage.isNullOrBlank()) lastNetError = res.errorMessage
            }
        }

        // Strategy 3: Public Web Release Redirect fallback if REST API hit 403 rate-limit or asset manifest wasn't uploaded yet
        if (candidates.isEmpty() && cleanToken.isEmpty()) {
            val webRes = httpGetFollowingRedirects(
                urlStr = "https://github.com/$repo/releases/latest",
                token = "",
                accept = "text/html"
            )
            if (webRes.code in 200..299 && !webRes.body.isNullOrBlank()) {
                val resolvedTag = webRes.finalUrl.substringAfter("/releases/tag/", "").substringBefore('?').substringBefore('#')
                val parsedBuild = parseBuildCode(webRes.body, webRes.body, resolvedTag)
                val apkMatch = Regex("""href="([^"]*?/releases/download/[^"]+?\.apk)"""").find(webRes.body)?.groupValues?.getOrNull(1)
                val apkUrl = when {
                    apkMatch != null && apkMatch.startsWith("http") -> apkMatch
                    apkMatch != null -> "https://github.com$apkMatch"
                    resolvedTag.isNotEmpty() -> "https://github.com/$repo/releases/download/$resolvedTag/EternalBluePOS-v2.3.$parsedBuild.apk"
                    else -> "https://github.com/$repo/releases/download/latest/EternalBluePOS.apk"
                }
                if (parsedBuild > 0 || resolvedTag.isNotEmpty()) {
                    candidates.add(
                        GitHubReleaseInfo(
                            tagName = resolvedTag.ifBlank { "latest" },
                            title = if (parsedBuild > 0) "EternalBlue POS v2.3.$parsedBuild" else resolvedTag,
                            remoteVersionCode = parsedBuild,
                            apkDownloadUrl = apkUrl,
                            releasePageUrl = webRes.finalUrl.ifBlank { releasesPage }
                        )
                    )
                }
            } else {
                if (webRes.code > 0) lastHttpCode = webRes.code
                if (!webRes.errorMessage.isNullOrBlank()) lastNetError = webRes.errorMessage
            }
        }

        val best = candidates.maxByOrNull { it.remoteVersionCode }
        if (best == null) {
            val msg = when (lastHttpCode) {
                401 -> "GitHub Token rejected (HTTP 401). Check your token permissions."
                404 -> if (cleanToken.isEmpty()) {
                    "No public release found (HTTP 404). If the repo is Private, paste a GitHub Read Token below or tap Open Releases in browser."
                } else {
                    "No published GitHub Release found yet in $repo (HTTP 404)."
                }
                403 -> "GitHub rate limit reached (HTTP 403). Add a GitHub Read Token or open Releases in browser."
                0 -> "Offline or connection error: ${lastNetError ?: "check internet"}"
                else -> "GitHub returned HTTP $lastHttpCode"
            }
            return@withContext Outcome.Error(msg, releasesPage)
        }

        if (best.remoteVersionCode > currentVersionCode) {
            Outcome.UpdateAvailable(best)
        } else {
            Outcome.UpToDate(title = best.title, remoteBuild = best.remoteVersionCode)
        }
    }

    private fun httpGetFollowingRedirects(
        urlStr: String,
        token: String,
        accept: String
    ): HttpFetchResult {
        var currentUrl = urlStr
        var redirects = 0
        val initialHost = runCatching { URL(urlStr).host.lowercase() }.getOrDefault("")
        while (redirects < 6) {
            var conn: HttpURLConnection? = null
            try {
                val parsed = URL(currentUrl)
                conn = (parsed.openConnection() as HttpURLConnection).apply {
                    requestMethod = "GET"
                    instanceFollowRedirects = false
                    useCaches = false
                    connectTimeout = 9000
                    readTimeout = 9000
                    setRequestProperty("Accept", accept)
                    setRequestProperty("Cache-Control", "no-cache, no-store, must-revalidate")
                    setRequestProperty("Pragma", "no-cache")
                    setRequestProperty("User-Agent", "EternalBluePOS-Android")
                    if (token.isNotEmpty() && parsed.host.equals(initialHost, ignoreCase = true)) {
                        setRequestProperty("Authorization", "Bearer $token")
                    }
                }
                val code = conn.responseCode
                if (code in listOf(301, 302, 303, 307, 308)) {
                    val loc = conn.getHeaderField("Location")
                    conn.disconnect()
                    if (loc.isNullOrBlank()) {
                        return HttpFetchResult(code, currentUrl, null, "Empty redirect location")
                    }
                    currentUrl = URL(parsed, loc).toString()
                    redirects++
                    continue
                }
                val body = if (code in 200..299) {
                    conn.inputStream.bufferedReader().use { it.readText() }
                } else {
                    null
                }
                conn.disconnect()
                return HttpFetchResult(code, currentUrl, body)
            } catch (t: Throwable) {
                runCatching { conn?.disconnect() }
                return HttpFetchResult(0, currentUrl, null, t.message ?: "Network error")
            }
        }
        return HttpFetchResult(0, currentUrl, null, "Too many redirects")
    }

    private fun parseBuildCode(body: String, title: String, tagName: String = ""): Int {
        Regex("""\[versionCode:(\d+)]""").find(body)?.groupValues?.getOrNull(1)?.toIntOrNull()?.let { return it }
        Regex("""Build\s*#(\d+)""", RegexOption.IGNORE_CASE).find(body)?.groupValues?.getOrNull(1)?.toIntOrNull()?.let { return it }
        Regex("""v\d+\.\d+\.(\d+)""").find(title)?.groupValues?.getOrNull(1)?.toIntOrNull()?.let { return it }
        Regex("""v\d+\.\d+\.(\d+)""").find(tagName)?.groupValues?.getOrNull(1)?.toIntOrNull()?.let { return it }
        return 0
    }
}
