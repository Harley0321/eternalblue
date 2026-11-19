package com.example.domain

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import java.net.HttpURLConnection
import java.net.URL

object GitHubUpdateChecker {
    private val jsonParser = Json { ignoreUnknownKeys = true }

    enum class SyncStatus {
        UPDATE_AVAILABLE,
        UP_TO_DATE,
        NO_RELEASE_APK_YET,
        ERROR
    }

    data class ReleaseInfo(
        val repoSlug: String,
        val status: SyncStatus,
        val tagName: String,
        val releaseNotes: String? = null,
        val htmlUrl: String,
        val apkDownloadUrl: String? = null,
        val apkFileName: String? = null,
        val apkSizeBytes: Long? = null,
        val latestCommitSha: String? = null,
        val latestCommitMessage: String? = null,
        val message: String
    ) {
        val isNewer: Boolean get() = status == SyncStatus.UPDATE_AVAILABLE
    }

    fun normalizeRepoSlug(raw: String): String {
        val trimmed = raw.trim()
            .removePrefix("https://github.com/")
            .removePrefix("http://github.com/")
            .removeSuffix(".git")
            .trim('/')
        val parts = trimmed.split('/').filter { it.isNotBlank() }
        return if (parts.size >= 2) "${parts[0]}/${parts[1]}" else trimmed
    }

    fun isVersionNewer(remoteRaw: String, currentRaw: String): Boolean {
        val rParts = parseVersionParts(remoteRaw)
        val cParts = parseVersionParts(currentRaw)
        if (rParts.isEmpty() || cParts.isEmpty()) {
            val cleanR = remoteRaw.trim().removePrefix("v").removePrefix("V")
            val cleanC = currentRaw.trim().removePrefix("v").removePrefix("V")
            return cleanR.isNotEmpty() && cleanR != cleanC
        }
        val maxLen = maxOf(rParts.size, cParts.size)
        for (i in 0 until maxLen) {
            val rv = rParts.getOrElse(i) { 0 }
            val cv = cParts.getOrElse(i) { 0 }
            if (rv != cv) return rv > cv
        }
        return false
    }

    private fun parseVersionParts(raw: String): List<Int> {
        val core = raw.trim()
            .removePrefix("v")
            .removePrefix("V")
            .substringBefore("-")
            .substringBefore("+")
        return core.split('.').mapNotNull { it.trim().toIntOrNull() }
    }

    private data class HttpReply(val code: Int, val body: String)

    private fun fetchJson(urlStr: String): HttpReply {
        val conn = (URL(urlStr).openConnection() as HttpURLConnection).apply {
            instanceFollowRedirects = true
            connectTimeout = 8000
            readTimeout = 8000
            requestMethod = "GET"
            setRequestProperty("User-Agent", "EternalBluePOS-Android")
            setRequestProperty("Accept", "application/vnd.github+json")
            setRequestProperty("X-GitHub-Api-Version", "2022-11-28")
        }
        val code = conn.responseCode
        val stream = if (code in 200..299) conn.inputStream else conn.errorStream
        val body = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
        conn.disconnect()
        return HttpReply(code, body)
    }

    private fun extractApkAsset(releaseObj: JsonObject): Triple<String?, String?, Long?> {
        val assets = releaseObj["assets"]?.jsonArray ?: return Triple(null, null, null)
        for (item in assets) {
            val obj = item.jsonObject
            val name = obj["name"]?.jsonPrimitive?.content ?: continue
            if (name.endsWith(".apk", ignoreCase = true)) {
                val url = obj["browser_download_url"]?.jsonPrimitive?.content
                val size = obj["size"]?.jsonPrimitive?.longOrNull
                return Triple(url, name, size)
            }
        }
        return Triple(null, null, null)
    }

    suspend fun checkLatest(repoSlug: String, currentVersion: String): ReleaseInfo = withContext(Dispatchers.IO) {
        val clean = normalizeRepoSlug(repoSlug)
        if (!clean.contains('/')) {
            return@withContext ReleaseInfo(
                repoSlug = clean,
                status = SyncStatus.ERROR,
                tagName = "",
                htmlUrl = "https://github.com",
                message = "Invalid GitHub repo format. Use owner/repo (e.g. Harley0321/eternalblue)."
            )
        }
        val releasesPageUrl = "https://github.com/$clean/releases"

        try {
            // 1. Check latest official release
            val latestReply = fetchJson("https://api.github.com/repos/$clean/releases/latest")
            var releaseObj: JsonObject? = null
            if (latestReply.code == 200) {
                releaseObj = jsonParser.parseToJsonElement(latestReply.body).jsonObject
            } else if (latestReply.code == 404) {
                // 2. Fallback to all releases (includes pre-releases)
                val listReply = fetchJson("https://api.github.com/repos/$clean/releases?per_page=5")
                if (listReply.code == 200) {
                    val arr = jsonParser.parseToJsonElement(listReply.body).jsonArray
                    releaseObj = arr.firstOrNull {
                        it.jsonObject["draft"]?.jsonPrimitive?.content != "true"
                    }?.jsonObject
                } else if (listReply.code == 404) {
                    return@withContext ReleaseInfo(
                        repoSlug = clean,
                        status = SyncStatus.ERROR,
                        tagName = "",
                        htmlUrl = "https://github.com/$clean",
                        message = "Repository \"$clean\" not found or is private (GitHub HTTP 404)."
                    )
                }
            } else if (latestReply.code == 403) {
                return@withContext ReleaseInfo(
                    repoSlug = clean,
                    status = SyncStatus.ERROR,
                    tagName = "",
                    htmlUrl = releasesPageUrl,
                    message = "GitHub API rate limit reached (HTTP 403). Try again in a few minutes."
                )
            } else if (latestReply.code !in 200..299) {
                return@withContext ReleaseInfo(
                    repoSlug = clean,
                    status = SyncStatus.ERROR,
                    tagName = "",
                    htmlUrl = releasesPageUrl,
                    message = "GitHub returned HTTP ${latestReply.code}."
                )
            }

            if (releaseObj != null) {
                val tag = releaseObj["tag_name"]?.jsonPrimitive?.content ?: "v$currentVersion"
                val htmlUrl = releaseObj["html_url"]?.jsonPrimitive?.content ?: releasesPageUrl
                val notes = releaseObj["body"]?.jsonPrimitive?.content?.takeIf { it.isNotBlank() }
                val (apkUrl, apkName, apkSize) = extractApkAsset(releaseObj)
                val newer = isVersionNewer(tag, currentVersion)
                val status = if (newer) SyncStatus.UPDATE_AVAILABLE else SyncStatus.UP_TO_DATE
                val msg = when {
                    newer -> "Update $tag is available."
                    else -> "App is up to date (installed v$currentVersion, latest $tag)."
                }
                return@withContext ReleaseInfo(
                    repoSlug = clean,
                    status = status,
                    tagName = tag,
                    releaseNotes = notes,
                    htmlUrl = htmlUrl,
                    apkDownloadUrl = apkUrl,
                    apkFileName = apkName,
                    apkSizeBytes = apkSize,
                    message = msg
                )
            }

            // 3. No GitHub Releases published yet — inspect tags & latest commit so user knows why!
            var latestTag: String? = null
            val tagsReply = fetchJson("https://api.github.com/repos/$clean/tags?per_page=1")
            if (tagsReply.code == 200) {
                val arr = jsonParser.parseToJsonElement(tagsReply.body).jsonArray
                latestTag = arr.firstOrNull()?.jsonObject?.get("name")?.jsonPrimitive?.content
            }

            var commitSha: String? = null
            var commitMsg: String? = null
            val commitsReply = fetchJson("https://api.github.com/repos/$clean/commits?per_page=1")
            if (commitsReply.code == 200) {
                val arr = jsonParser.parseToJsonElement(commitsReply.body).jsonArray
                val cObj = arr.firstOrNull()?.jsonObject
                commitSha = cObj?.get("sha")?.jsonPrimitive?.content?.take(7)
                commitMsg = cObj?.get("commit")?.jsonObject?.get("message")?.jsonPrimitive?.content
                    ?.lineSequence()?.firstOrNull()?.take(70)
            }

            val commitInfo = if (commitSha != null) "Latest commit $commitSha (${commitMsg ?: ""}). " else ""
            ReleaseInfo(
                repoSlug = clean,
                status = SyncStatus.NO_RELEASE_APK_YET,
                tagName = latestTag ?: "",
                htmlUrl = "https://github.com/$clean/actions",
                latestCommitSha = commitSha,
                latestCommitMessage = commitMsg,
                message = "${commitInfo}No published update release yet — run the GitHub release workflow."
            )
        } catch (e: Exception) {
            ReleaseInfo(
                repoSlug = clean,
                status = SyncStatus.ERROR,
                tagName = "",
                htmlUrl = releasesPageUrl,
                message = "Cannot reach GitHub (${e.javaClass.simpleName}: ${e.message ?: "offline"})."
            )
        }
    }
}
