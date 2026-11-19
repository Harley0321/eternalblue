package com.example.security

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.example.domain.PosMath
import com.example.model.BackupPayload
import com.example.model.CashierAccount
import com.example.model.EncryptedVaultEnvelope
import com.example.model.HeldOrder
import com.example.model.Product
import com.example.model.SaleRecord
import com.example.model.SecurityEventType
import com.example.model.SecurityLogEntry
import com.example.model.SecuritySeverity
import com.example.model.StoreSettings
import com.example.model.VaultSummary
import kotlinx.serialization.json.Json
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.Instant
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.Mac
import javax.crypto.SecretKey
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

class SecurityManager(context: Context) {

    companion object {
        const val PIN_ALGO_LATEST = "PBKDF2-SHA512"
        const val PIN_ITER_LATEST = 310_000
        const val PIN_ITER_LEGACY = 100_000
        private const val VAULT_KDF_ITER = 310_000
        private const val VAULT_FORMAT = "omnimart-aes256gcm-v2"
        private const val KEYSTORE_ALIAS = "eternalblue_pos_ledger_hmac_v1"
        private const val PREF_NAME = "eternalblue_pin_locks"
        private const val KEY_ADMIN_FAILS = "admin_fails"
        private const val KEY_ADMIN_UNTIL = "admin_until"

        private val json = Json {
            ignoreUnknownKeys = true
            encodeDefaults = true
        }
    }

    private val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
    private val rng = SecureRandom()

    fun pinIsSet(settings: StoreSettings): Boolean =
        !settings.adminPinHash.isNullOrBlank() || !settings.adminPin.isNullOrBlank()

    fun cashierHasPin(cashier: CashierAccount?): Boolean =
        cashier != null && (!cashier.pinHash.isNullOrBlank() || !cashier.pin.isNullOrBlank())

    fun isWeakPin(pin: String): Boolean {
        val clean = pin.trim()
        if (clean.length < 4) return true
        val weakSet = setOf("0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999", "1234", "4321", "123456", "654321", "000000", "111111", "1212", "1313", "2024", "2025", "2026")
        if (clean in weakSet) return true
        return clean.toSet().size == 1
    }

    fun fmtWait(sec: Long): String = if (sec >= 60) "${ceil(sec / 60.0).toLong()} min" else "$sec sec"

    fun pinLockedFor(): Long {
        val until = prefs.getLong(KEY_ADMIN_UNTIL, 0L)
        return max(0L, ceil((until - System.currentTimeMillis()) / 1000.0).toLong())
    }

    private fun registerAdminFail(): Pair<Int, Long> {
        val fails = prefs.getInt(KEY_ADMIN_FAILS, 0) + 1
        var until = prefs.getLong(KEY_ADMIN_UNTIL, 0L)
        if (fails % 5 == 0) {
            val sec = min(15 * 60.0, 30.0 * 2.0.pow((fails / 5 - 1).toDouble()))
            until = System.currentTimeMillis() + (sec * 1000.0).toLong()
        }
        prefs.edit().putInt(KEY_ADMIN_FAILS, fails).putLong(KEY_ADMIN_UNTIL, until).apply()
        return fails to until
    }

    private fun resetAdminFail() {
        prefs.edit().putInt(KEY_ADMIN_FAILS, 0).putLong(KEY_ADMIN_UNTIL, 0L).apply()
    }

    private fun derivePinHash(pin: String, saltB64: String, iterations: Int, algo: String): String {
        val salt = Base64.decode(saltB64, Base64.NO_WRAP)
        val factoryName = if (algo == "PBKDF2-SHA256") "PBKDF2WithHmacSHA256" else "PBKDF2WithHmacSHA512"
        val factory = SecretKeyFactory.getInstance(factoryName)
        val spec = PBEKeySpec(pin.toCharArray(), salt, iterations, 256)
        val bytes = factory.generateSecret(spec).encoded
        return Base64.encodeToString(bytes, Base64.NO_WRAP)
    }

    fun storePinInSettings(settings: StoreSettings, pin: String, weakFlag: Boolean): StoreSettings {
        val salt = ByteArray(16).also { rng.nextBytes(it) }
        val saltB64 = Base64.encodeToString(salt, Base64.NO_WRAP)
        val hash = derivePinHash(pin, saltB64, PIN_ITER_LATEST, PIN_ALGO_LATEST)
        return settings.copy(
            adminPin = null,
            adminPinHash = hash,
            adminPinSalt = saltB64,
            adminPinIter = PIN_ITER_LATEST,
            adminPinAlgo = PIN_ALGO_LATEST,
            adminPinWeak = if (weakFlag) true else null
        )
    }

    data class PinVerifyResult(
        val ok: Boolean,
        val error: String? = null,
        val upgradedSettings: StoreSettings? = null,
        val upgradedAlgo: Boolean = false,
        val lockedOutNow: Boolean = false
    )

    fun verifyPinWithSettings(entered: String, settings: StoreSettings): PinVerifyResult {
        val wait = pinLockedFor()
        if (wait > 0L) {
            return PinVerifyResult(ok = false, error = "Too many wrong PINs. Try again in ${fmtWait(wait)}", lockedOutNow = true)
        }
        val clean = entered.trim()
        var ok = false
        var upgraded: StoreSettings? = null
        var upgradedAlgo = false

        if (!settings.adminPinHash.isNullOrBlank()) {
            val algo = if (settings.adminPinAlgo == PIN_ALGO_LATEST) PIN_ALGO_LATEST else "PBKDF2-SHA256"
            val iter = settings.adminPinIter ?: PIN_ITER_LEGACY
            val h = runCatching { derivePinHash(clean, settings.adminPinSalt ?: "", iter, algo) }.getOrNull()
            ok = h != null && MessageDigest.isEqual(h.toByteArray(), settings.adminPinHash.toByteArray())
            if (ok && (algo != PIN_ALGO_LATEST || iter < PIN_ITER_LATEST)) {
                upgraded = storePinInSettings(settings, clean, isWeakPin(clean))
                upgradedAlgo = true
            }
        } else if (!settings.adminPin.isNullOrBlank()) {
            ok = MessageDigest.isEqual(clean.toByteArray(), settings.adminPin.toByteArray())
            if (ok) {
                upgraded = storePinInSettings(settings, clean, isWeakPin(clean))
                upgradedAlgo = true
            }
        }

        if (ok) {
            resetAdminFail()
            return PinVerifyResult(ok = true, upgradedSettings = upgraded, upgradedAlgo = upgradedAlgo)
        }
        val (fails, _) = registerAdminFail()
        val w2 = pinLockedFor()
        val rem = 5 - (if (fails % 5 == 0) 5 else fails % 5)
        return PinVerifyResult(
            ok = false,
            lockedOutNow = w2 > 0L,
            error = if (w2 > 0L) "Too many wrong PINs. Locked for ${fmtWait(w2)}"
            else "Incorrect Manager PIN ($rem tries left before lock)"
        )
    }

    fun setCashierPinFields(cashier: CashierAccount, rawPin: String?): CashierAccount {
        val clean = (rawPin ?: "").trim()
        if (clean.isEmpty()) {
            return cashier.copy(pin = null, pinHash = null, pinSalt = null, pinIter = null, pinAlgo = null)
        }
        val salt = ByteArray(16).also { rng.nextBytes(it) }
        val saltB64 = Base64.encodeToString(salt, Base64.NO_WRAP)
        val hash = derivePinHash(clean, saltB64, PIN_ITER_LATEST, PIN_ALGO_LATEST)
        return cashier.copy(pin = null, pinHash = hash, pinSalt = saltB64, pinIter = PIN_ITER_LATEST, pinAlgo = PIN_ALGO_LATEST)
    }

    data class CashierPinVerifyResult(
        val ok: Boolean,
        val error: String? = null,
        val upgradedCashier: CashierAccount? = null,
        val lockedOutNow: Boolean = false
    )

    fun verifyCashierPin(entered: String, cashier: CashierAccount): CashierPinVerifyResult {
        if (!cashierHasPin(cashier)) return CashierPinVerifyResult(ok = true)
        val fKey = "c_fails_${cashier.id}"
        val uKey = "c_until_${cashier.id}"
        val until = prefs.getLong(uKey, 0L)
        val wait = max(0L, ceil((until - System.currentTimeMillis()) / 1000.0).toLong())
        if (wait > 0L) {
            return CashierPinVerifyResult(ok = false, lockedOutNow = true, error = "Too many wrong PINs for ${cashier.name}. Try again in ${fmtWait(wait)}")
        }
        val clean = entered.trim()
        var ok = false
        var upgraded: CashierAccount? = null
        if (!cashier.pinHash.isNullOrBlank()) {
            val algo = if (cashier.pinAlgo == PIN_ALGO_LATEST) PIN_ALGO_LATEST else "PBKDF2-SHA256"
            val iter = cashier.pinIter ?: PIN_ITER_LEGACY
            val h = runCatching { derivePinHash(clean, cashier.pinSalt ?: "", iter, algo) }.getOrNull()
            ok = h != null && MessageDigest.isEqual(h.toByteArray(), cashier.pinHash.toByteArray())
            if (ok && (algo != PIN_ALGO_LATEST || iter < PIN_ITER_LATEST)) {
                upgraded = setCashierPinFields(cashier, clean)
            }
        } else if (!cashier.pin.isNullOrBlank()) {
            ok = MessageDigest.isEqual(clean.toByteArray(), cashier.pin.toByteArray())
            if (ok) upgraded = setCashierPinFields(cashier, clean)
        }
        if (ok) {
            prefs.edit().putInt(fKey, 0).putLong(uKey, 0L).apply()
            return CashierPinVerifyResult(ok = true, upgradedCashier = upgraded)
        }
        val fails = prefs.getInt(fKey, 0) + 1
        var nextUntil = until
        if (fails % 5 == 0) {
            val sec = min(15 * 60.0, 30.0 * 2.0.pow((fails / 5 - 1).toDouble()))
            nextUntil = System.currentTimeMillis() + (sec * 1000.0).toLong()
        }
        prefs.edit().putInt(fKey, fails).putLong(uKey, nextUntil).apply()
        val w2 = max(0L, ceil((nextUntil - System.currentTimeMillis()) / 1000.0).toLong())
        val rem = 5 - (if (fails % 5 == 0) 5 else fails % 5)
        return CashierPinVerifyResult(
            ok = false,
            lockedOutNow = w2 > 0L,
            error = if (w2 > 0L) "Locked for ${fmtWait(w2)}" else "Incorrect cashier PIN ($rem tries left)"
        )
    }

    // AndroidKeyStore HMAC-SHA256 for Security Audit Ledger
    private fun getOrCreateHmacKey(): SecretKey? = runCatching {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(KEYSTORE_ALIAS, null) as? SecretKey) ?: run {
            val kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_HMAC_SHA256, "AndroidKeyStore")
            kg.init(
                KeyGenParameterSpec.Builder(KEYSTORE_ALIAS, KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY)
                    .setDigests(KeyProperties.DIGEST_SHA256)
                    .build()
            )
            kg.generateKey()
        }
    }.getOrNull()

    fun isDeviceKeyReady(): Boolean = getOrCreateHmacKey() != null

    private fun signHmac(data: String): String? = runCatching {
        val key = getOrCreateHmacKey() ?: return@runCatching null
        val mac = Mac.getInstance("HmacSHA256").apply { init(key) }
        Base64.encodeToString(mac.doFinal(data.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
    }.getOrNull()

    private fun verifyHmac(data: String, sigB64: String): Boolean? = runCatching {
        val expected = signHmac(data) ?: return@runCatching null
        MessageDigest.isEqual(expected.toByteArray(), sigB64.toByteArray())
    }.getOrNull()

    fun sha256Hex(text: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(text.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }

    private fun canonicalSecurityRecord(
        seq: Int,
        id: String,
        timestamp: String,
        event: SecurityEventType,
        severity: SecuritySeverity,
        summary: String,
        prevHash: String
    ): String = json.encodeToString(
        listOf(seq.toString(), id, timestamp, event.name, severity.name, summary, prevHash)
    )

    fun createSecurityLogEntry(
        existingNewestFirst: List<SecurityLogEntry>,
        event: SecurityEventType,
        severity: SecuritySeverity = SecuritySeverity.info,
        summary: String
    ): SecurityLogEntry {
        val latest = existingNewestFirst.firstOrNull()
        val seq = (existingNewestFirst.maxOfOrNull { it.seq } ?: 0) + 1
        val prevHash = latest?.entryHash ?: "GENESIS"
        val ts = Instant.now().toString()
        val id = "SEC-$seq-${System.currentTimeMillis().toString(36)}"
        val entryHash = sha256Hex(canonicalSecurityRecord(seq, id, ts, event, severity, summary, prevHash))
        val hmacSig = signHmac(entryHash)
        return SecurityLogEntry(
            id = id,
            seq = seq,
            timestamp = ts,
            event = event,
            severity = severity,
            summary = summary,
            prevHash = prevHash,
            entryHash = entryHash,
            hmacSig = hmacSig
        )
    }

    data class SecurityChainReport(
        val valid: Boolean,
        val verifiedCount: Int,
        val signedCount: Int,
        val brokenSeqs: List<Int>,
        val hmacMismatches: List<Int>
    )

    fun verifySecurityChain(entries: List<SecurityLogEntry>): SecurityChainReport {
        if (entries.isEmpty()) return SecurityChainReport(true, 0, 0, emptyList(), emptyList())
        val sorted = entries.sortedBy { it.seq }
        val broken = mutableListOf<Int>()
        val hmacBad = mutableListOf<Int>()
        var signed = 0
        for (i in sorted.indices) {
            val cur = sorted[i]
            val expected = sha256Hex(canonicalSecurityRecord(cur.seq, cur.id, cur.timestamp, cur.event, cur.severity, cur.summary, cur.prevHash))
            val linkExpected = if (i == 0) {
                if (cur.seq == 1) "GENESIS" else cur.prevHash
            } else {
                sorted[i - 1].entryHash
            }
            if (cur.entryHash != expected || cur.prevHash != linkExpected || (i > 0 && cur.seq != sorted[i - 1].seq + 1)) {
                broken.add(cur.seq)
            }
            if (!cur.hmacSig.isNullOrBlank()) {
                signed++
                if (verifyHmac(cur.entryHash, cur.hmacSig) == false) hmacBad.add(cur.seq)
            }
        }
        return SecurityChainReport(broken.isEmpty() && hmacBad.isEmpty(), sorted.size, signed, broken, hmacBad)
    }

    // AES-256-GCM Encrypted Vault Export / Import (PBKDF2-SHA512 + HKDF-SHA256)
    private fun hkdfSha256Expand(ikm: ByteArray, salt: ByteArray, info: ByteArray, length: Int = 32): ByteArray {
        val extractMac = Mac.getInstance("HmacSHA256")
        extractMac.init(SecretKeySpec(salt, "HmacSHA256"))
        val prk = extractMac.doFinal(ikm)
        val expandMac = Mac.getInstance("HmacSHA256")
        expandMac.init(SecretKeySpec(prk, "HmacSHA256"))
        expandMac.update(info)
        expandMac.update(byteArrayOf(1))
        return expandMac.doFinal().copyOf(length)
    }

    private fun deriveVaultKey(passphrase: String, salt: ByteArray, hkdfSalt: ByteArray, iterations: Int): SecretKeySpec {
        val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA512")
        val spec = PBEKeySpec(passphrase.toCharArray(), salt, iterations, 256)
        val ikm = factory.generateSecret(spec).encoded
        val aesBytes = hkdfSha256Expand(ikm, hkdfSalt, "omnimart-vault-v2-aes256gcm".toByteArray(Charsets.UTF_8), 32)
        return SecretKeySpec(aesBytes, "AES")
    }

    fun encryptBackupPayload(
        products: List<Product>,
        sales: List<SaleRecord>,
        heldOrders: List<HeldOrder>,
        settings: StoreSettings,
        passphrase: String
    ): EncryptedVaultEnvelope {
        val exportedAt = Instant.now().toString()
        val sanitizedSettings = settings.copy(
            adminPin = null, adminPinHash = null, adminPinSalt = null, adminPinIter = null, adminPinAlgo = null, adminPinWeak = null
        )
        val payload = BackupPayload(
            app = "omnimart-ph-pos",
            version = 1,
            exportedAt = exportedAt,
            products = products,
            sales = sales,
            heldOrders = heldOrders,
            settings = sanitizedSettings
        )
        val salt = ByteArray(16).also { rng.nextBytes(it) }
        val hkdfSalt = ByteArray(16).also { rng.nextBytes(it) }
        val iv = ByteArray(12).also { rng.nextBytes(it) }
        val aesKey = deriveVaultKey(passphrase, salt, hkdfSalt, VAULT_KDF_ITER)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, aesKey, GCMParameterSpec(128, iv))
        cipher.updateAAD("omnimart-ph-pos:$VAULT_FORMAT:$exportedAt".toByteArray(Charsets.UTF_8))
        val plaintext = json.encodeToString(BackupPayload.serializer(), payload).toByteArray(Charsets.UTF_8)
        val ct = cipher.doFinal(plaintext)

        return EncryptedVaultEnvelope(
            app = "omnimart-ph-pos",
            format = VAULT_FORMAT,
            iterations = VAULT_KDF_ITER,
            salt = Base64.encodeToString(salt, Base64.NO_WRAP),
            hkdfSalt = Base64.encodeToString(hkdfSalt, Base64.NO_WRAP),
            iv = Base64.encodeToString(iv, Base64.NO_WRAP),
            ciphertext = Base64.encodeToString(ct, Base64.NO_WRAP),
            exportedAt = exportedAt,
            summary = VaultSummary(products.size, sales.size, heldOrders.size)
        )
    }

    fun decryptBackupPayload(envelope: EncryptedVaultEnvelope, passphrase: String): Result<BackupPayload> = runCatching {
        require(envelope.app == "omnimart-ph-pos" && envelope.format == VAULT_FORMAT) {
            "File is not a valid EternalBlue AES-256-GCM encrypted vault."
        }
        val salt = Base64.decode(envelope.salt, Base64.NO_WRAP)
        val hkdfSalt = Base64.decode(envelope.hkdfSalt, Base64.NO_WRAP)
        val iv = Base64.decode(envelope.iv, Base64.NO_WRAP)
        val ct = Base64.decode(envelope.ciphertext, Base64.NO_WRAP)
        val aesKey = deriveVaultKey(passphrase, salt, hkdfSalt, envelope.iterations.coerceAtLeast(100_000))
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, aesKey, GCMParameterSpec(128, iv))
        cipher.updateAAD("omnimart-ph-pos:$VAULT_FORMAT:${envelope.exportedAt}".toByteArray(Charsets.UTF_8))
        val plain = cipher.doFinal(ct)
        json.decodeFromString(BackupPayload.serializer(), String(plain, Charsets.UTF_8))
    }
}
