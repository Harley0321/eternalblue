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

    sealed class Outcome {
        data class UpdateAvailable(val release: GitHubReleaseInfo) : Outcome()
        data class UpToDate(val title: String, val remoteBuild: Int) : Outcome()
        data class Error(val message: String, val releasesPageUrl: String?) : Outcome()
    }

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
        currentVersionCode: Int
    ): Outcome = withContext(Dispatchers.IO) {
        val repo = normalizeRepo(repoInput)
        if (repo.isEmpty()) {
            return@withContext Outcome.Error(
                "Enter your GitHub repository as owner/repo first.",
                null
            )
        }
        val releasesPage = "https://github.com/$repo/releases"
        val urls = listOf(
            "https://api.github.com/repos/$repo/releases/tags/latest",
            "https://api.github.com/repos/$repo/releases/latest"
        )

        var lastCode = 0
        var bodyText: String? = null
        var lastError: String? = null

        for (endpoint in urls) {
            try {
                val conn = (URL(endpoint).openConnection() as HttpURLConnection).apply {
                    requestMethod = "GET"
                    connectTimeout = 8000
                    readTimeout = 8000
                    setRequestProperty("Accept", "application/vnd.github+json")
                    setRequestProperty("User-Agent", "EternalBluePOS-Android")
                }
                lastCode = conn.responseCode
                if (lastCode in 200..299) {
                    bodyText = conn.inputStream.bufferedReader().use { it.readText() }
                    conn.disconnect()
                    break
                }
                conn.disconnect()
            } catch (t: Throwable) {
                lastError = t.message ?: "Network error"
            }
        }

        if (bodyText == null) {
            val msg = when (lastCode) {
                404 -> "No published GitHub Release found yet (or repo is private). Open Releases in browser while signed in."
                403 -> "GitHub API rate limit reached. Open Releases directly in browser."
                0 -> "Offline or connection error: ${lastError ?: "check internet"}"
                else -> "GitHub returned HTTP $lastCode"
            }
            return@withContext Outcome.Error(msg, releasesPage)
        }

        val rel = runCatching { json.decodeFromString(GhRelease.serializer(), bodyText) }.getOrNull()
            ?: return@withContext Outcome.Error("Could not parse GitHub release metadata.", releasesPage)

        val remoteBuild = parseBuildCode(rel.body, rel.name)
        val apkUrl = rel.assets.firstOrNull { it.name.endsWith(".apk", ignoreCase = true) }?.browser_download_url
            ?.takeIf { it.isNotBlank() }
            ?: "https://github.com/$repo/releases/download/${rel.tag_name.ifBlank { "latest" }}/EternalBluePOS.apk"

        val title = rel.name.ifBlank { rel.tag_name.ifBlank { "Latest Build" } }
        val htmlUrl = rel.html_url.ifBlank { releasesPage }

        if (remoteBuild > currentVersionCode) {
            Outcome.UpdateAvailable(
                GitHubReleaseInfo(
                    tagName = rel.tag_name.ifBlank { "latest" },
                    title = title,
                    remoteVersionCode = remoteBuild,
                    apkDownloadUrl = apkUrl,
                    releasePageUrl = htmlUrl,
                    notes = rel.body
                )
            )
        } else {
            Outcome.UpToDate(title = title, remoteBuild = remoteBuild)
        }
    }

    private fun parseBuildCode(body: String, title: String): Int {
        Regex("""\[versionCode:(\d+)]""").find(body)?.groupValues?.getOrNull(1)?.toIntOrNull()?.let { return it }
        Regex("""Build\s*#(\d+)""", RegexOption.IGNORE_CASE).find(body)?.groupValues?.getOrNull(1)?.toIntOrNull()?.let { return it }
        Regex("""v\d+\.\d+\.(\d+)""").find(title)?.groupValues?.getOrNull(1)?.toIntOrNull()?.let { return it }
        return 0
    }
}
