package com.example.domain

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.net.HttpURLConnection
import java.net.URL

object GitHubUpdateChecker {
    data class ReleaseInfo(val tagName: String, val htmlUrl: String, val isNewer: Boolean)

    suspend fun checkLatest(repoSlug: String, currentVersion: String): ReleaseInfo? = withContext(Dispatchers.IO) {
        val clean = repoSlug.trim().trim('/')
        if (!clean.contains('/')) return@withContext null
        try {
            val url = URL("https://api.github.com/repos/$clean/releases/latest")
            val conn = (url.openConnection() as HttpURLConnection).apply {
                connectTimeout = 5000
                readTimeout = 5000
                setRequestProperty("Accept", "application/vnd.github+json")
            }
            if (conn.responseCode != 200) return@withContext null
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            val json = Json.parseToJsonElement(body).jsonObject
            val tag = json["tag_name"]?.jsonPrimitive?.content ?: return@withContext null
            val htmlUrl = json["html_url"]?.jsonPrimitive?.content ?: "https://github.com/$clean/releases"
            val cleanTag = tag.removePrefix("v").substringBefore("-")
            ReleaseInfo(tagName = tag, htmlUrl = htmlUrl, isNewer = cleanTag != currentVersion)
        } catch (_: Exception) {
            null
        }
    }
}
