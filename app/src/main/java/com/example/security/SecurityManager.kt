package com.example.security

import android.util.Base64
import com.example.model.SecurityLogEntry
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.Instant
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

object SecurityManager {
    const val DEFAULT_PBKDF2_ITER = 12_000
    private val WEAK_PINS = setOf("0000", "1111", "1234", "4321", "123456", "000000", "111111")

    fun isPinWeak(pin: String): Boolean = pin.trim() in WEAK_PINS

    fun hashPin(pin: String): Pair<String, String> {
        val salt = ByteArray(16)
        SecureRandom().nextBytes(salt)
        val hash = pbkdf2(pin, salt, DEFAULT_PBKDF2_ITER)
        return Base64.encodeToString(hash, Base64.NO_WRAP) to Base64.encodeToString(salt, Base64.NO_WRAP)
    }

    fun verifyPin(pin: String, storedHash: String?, storedSalt: String?, iterations: Int = DEFAULT_PBKDF2_ITER): Boolean {
        if (storedHash.isNullOrBlank() || storedSalt.isNullOrBlank()) return false
        return try {
            val salt = Base64.decode(storedSalt, Base64.NO_WRAP)
            val expected = Base64.decode(storedHash, Base64.NO_WRAP)
            val actual = pbkdf2(pin, salt, if (iterations > 0) iterations else DEFAULT_PBKDF2_ITER)
            MessageDigest.isEqual(expected, actual)
        } catch (_: Exception) {
            false
        }
    }

    private fun pbkdf2(pin: String, salt: ByteArray, iter: Int): ByteArray {
        val chars = pin.toCharArray()
        val spec = PBEKeySpec(chars, salt, iter, 256)
        return try {
            SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
        } finally {
            chars.fill('\u0000')
            spec.clearPassword()
        }
    }

    fun sha256Hex(input: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(input.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }

    fun appendSecurityEvent(
        existing: List<SecurityLogEntry>,
        event: String,
        severity: String,
        summary: String
    ): List<SecurityLogEntry> {
        val last = existing.firstOrNull()
        val seq = (last?.seq ?: 0) + 1
        val prevHash = last?.entryHash ?: "GENESIS"
        val ts = Instant.now().toString()
        val entryHash = sha256Hex("$seq|$ts|$event|$severity|$summary|$prevHash")
        val entry = SecurityLogEntry(
            id = "SEC-$seq-${System.currentTimeMillis()}",
            seq = seq,
            timestamp = ts,
            event = event,
            severity = severity,
            summary = summary,
            prevHash = prevHash,
            entryHash = entryHash
        )
        return (listOf(entry) + existing).take(100)
    }
}
