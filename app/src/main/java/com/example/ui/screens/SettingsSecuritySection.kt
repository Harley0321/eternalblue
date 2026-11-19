package com.example.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Backup
import androidx.compose.material.icons.rounded.DeleteForever
import androidx.compose.material.icons.rounded.Fingerprint
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.Key
import androidx.compose.material.icons.rounded.OpenInNew
import androidx.compose.material.icons.rounded.Restore
import androidx.compose.material.icons.rounded.Security
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material.icons.rounded.SystemUpdate
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.data.PosRepository
import com.example.domain.GitHubUpdateChecker
import com.example.hardware.AndroidDeviceBridge
import com.example.model.BackupPayload
import com.example.model.EncryptedVaultEnvelope
import com.example.model.ToastType
import com.example.ui.theme.PosColors
import com.example.viewmodel.PosViewModel

@Composable
fun SettingsSecurityAndBackupSection(vm: PosViewModel) {
    val context = LocalContext.current
    val settings by vm.settings.collectAsStateWithLifecycle()
    val securityLog by vm.securityLog.collectAsStateWithLifecycle()
    val configHistory by vm.configHistory.collectAsStateWithLifecycle()
    val updateState by vm.updateState.collectAsStateWithLifecycle()

    val chainReport = remember(securityLog) { vm.security.verifySecurityChain(securityLog) }
    val storageInfo = remember(vm.products.value, vm.sales.value, securityLog) { vm.repo.getStorageBreakdown() }
    val bioReady = remember { AndroidDeviceBridge.isBiometricAvailable(context) }

    var showExportVaultPrompt by remember { mutableStateOf(false) }
    var pendingDecryptEnvelope by remember { mutableStateOf<EncryptedVaultEnvelope?>(null) }
    var pendingRestoreMode by remember { mutableStateOf("merge") }
    var checkpointName by remember { mutableStateOf("") }

    val restoreFileLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        AndroidDeviceBridge.readUriText(context, uri)
            .onSuccess { raw ->
                val env = runCatching { PosRepository.json.decodeFromString(EncryptedVaultEnvelope.serializer(), raw) }.getOrNull()
                if (env != null && env.format == "omnimart-aes256gcm-v2") {
                    pendingDecryptEnvelope = env
                    return@onSuccess
                }
                val plain = runCatching { PosRepository.json.decodeFromString(BackupPayload.serializer(), raw) }.getOrNull()
                if (plain != null) {
                    vm.prepareRestore(plain, pendingRestoreMode)
                } else {
                    vm.toast("File is not a recognized EternalBlue backup", ToastType.ERROR)
                }
            }
            .onFailure { vm.toast(it.message ?: "Could not read file", ToastType.ERROR) }
    }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        // Security Posture Card
        Surface(shape = RoundedCornerShape(14.dp), color = Color.White, border = BorderStroke(1.dp, PosColors.Slate200)) {
            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Rounded.Security, contentDescription = null, tint = PosColors.Indigo600)
                    Text("Security Posture & KeyStore Audit", style = MaterialTheme.typography.titleSmall)
                }

                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = if (chainReport.valid) PosColors.Emerald50 else PosColors.Rose50
                ) {
                    Row(modifier = Modifier.fillMaxWidth().padding(10.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        Column {
                            Text(
                                if (chainReport.valid) "Tamper-Evident SHA-256 Chain Verified" else "Audit Chain Warning",
                                fontWeight = FontWeight.Bold,
                                fontSize = 12.sp,
                                color = if (chainReport.valid) PosColors.Emerald700 else PosColors.Rose700
                            )
                            Text("${chainReport.verifiedCount} entries · ${chainReport.signedCount} Hardware HMAC signed", fontSize = 11.sp, color = PosColors.Slate600)
                        }
                        Icon(Icons.Rounded.Shield, contentDescription = null, tint = if (chainReport.valid) PosColors.Emerald700 else PosColors.Rose700)
                    }
                }

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(
                        onClick = { vm.openChangePinModal() },
                        modifier = Modifier.weight(1f).testTag("settings_change_pin_btn")
                    ) {
                        Icon(Icons.Rounded.Key, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Change PIN", fontSize = 12.sp)
                    }
                }

                if (bioReady) {
                    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Icon(Icons.Rounded.Fingerprint, contentDescription = null, tint = PosColors.Indigo600)
                            Text("Biometric Unlock (Fingerprint/Face)", style = MaterialTheme.typography.bodyMedium)
                        }
                        Switch(
                            checked = settings.biometricEnabled,
                            onCheckedChange = { vm.updateSettings(settings.copy(biometricEnabled = it)) }
                        )
                    }
                }

                if (securityLog.isNotEmpty()) {
                    Text("Latest Security Events", style = MaterialTheme.typography.labelMedium, color = PosColors.Slate600)
                    securityLog.take(4).forEach { entry ->
                        Text("• #${entry.seq} ${entry.event.name}: ${entry.summary}", fontSize = 11.sp, color = PosColors.Slate600)
                    }
                }
            }
        }

        // Config Checkpoints & Rollback
        Surface(shape = RoundedCornerShape(14.dp), color = Color.White, border = BorderStroke(1.dp, PosColors.Slate200)) {
            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Rounded.History, contentDescription = null, tint = PosColors.Slate700)
                    Text("Config Version Checkpoints (${configHistory.size})", style = MaterialTheme.typography.titleSmall)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = checkpointName,
                        onValueChange = { checkpointName = it },
                        placeholder = { Text("Checkpoint label", fontSize = 12.sp) },
                        singleLine = true,
                        modifier = Modifier.weight(1f)
                    )
                    Button(
                        onClick = { vm.createConfigCheckpoint(checkpointName); checkpointName = "" },
                        colors = ButtonDefaults.buttonColors(containerColor = PosColors.Slate900)
                    ) { Text("Save") }
                }
                configHistory.take(4).forEach { snap ->
                    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(snap.label, style = MaterialTheme.typography.labelMedium)
                            Text("${snap.source} · v${snap.version}", fontSize = 10.sp, color = PosColors.Slate500)
                        }
                        TextButton(onClick = { vm.rollbackConfig(snap.id) }) { Text("Rollback", fontSize = 11.sp) }
                    }
                }
            }
        }

        // SQLite Storage & Backups
        Surface(shape = RoundedCornerShape(14.dp), color = Color.White, border = BorderStroke(1.dp, PosColors.Slate200)) {
            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("SQLite Storage & Encrypted Backups", style = MaterialTheme.typography.titleSmall)
                storageInfo.second.take(4).forEach { item ->
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(item.label, fontSize = 11.sp, color = PosColors.Slate700)
                            Text("${(item.bytes / 1024.0).let { String.format("%.1f", it) }} KB (${item.pct}%)", fontSize = 11.sp, color = PosColors.Slate500)
                        }
                        LinearProgressIndicator(progress = { (item.pct / 100f).coerceIn(0.02f, 1f) }, modifier = Modifier.fillMaxWidth().height(5.dp))
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = { showExportVaultPrompt = true },
                        colors = ButtonDefaults.buttonColors(containerColor = PosColors.Indigo600),
                        modifier = Modifier.weight(1f)
                    ) {
                        Icon(Icons.Rounded.Backup, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("AES Vault", fontSize = 11.sp)
                    }
                    OutlinedButton(onClick = { vm.exportPlainJsonBackup() }, modifier = Modifier.weight(1f)) {
                        Text("JSON Backup", fontSize = 11.sp)
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(
                        onClick = { pendingRestoreMode = "merge"; restoreFileLauncher.launch(arrayOf("*/*")) },
                        modifier = Modifier.weight(1f)
                    ) {
                        Icon(Icons.Rounded.Restore, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Merge Restore", fontSize = 11.sp)
                    }
                    OutlinedButton(
                        onClick = { pendingRestoreMode = "replace"; restoreFileLauncher.launch(arrayOf("*/*")) },
                        modifier = Modifier.weight(1f)
                    ) { Text("Replace Restore", fontSize = 11.sp) }
                }
            }
        }

        // App Updates (GitHub Releases)
        Surface(shape = RoundedCornerShape(14.dp), color = Color.White, border = BorderStroke(1.dp, PosColors.Slate200)) {
            var repoInput by remember(updateState.effectiveRepo) { mutableStateOf(updateState.effectiveRepo) }
            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Rounded.SystemUpdate, contentDescription = null, tint = PosColors.Emerald600)
                    Column {
                        Text("App Updates (GitHub Releases)", style = MaterialTheme.typography.titleSmall)
                        Text(
                            "Installed: v${updateState.currentVersionName} (Build #${updateState.currentVersionCode})",
                            fontSize = 11.sp,
                            color = PosColors.Slate500
                        )
                    }
                }

                updateState.availableRelease?.let { rel ->
                    Surface(shape = RoundedCornerShape(10.dp), color = PosColors.Emerald50, border = BorderStroke(1.dp, PosColors.Emerald500)) {
                        Column(modifier = Modifier.fillMaxWidth().padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text("New update ready: ${rel.title}", fontWeight = FontWeight.Bold, fontSize = 12.sp, color = PosColors.Emerald700)
                            Button(
                                onClick = { AndroidDeviceBridge.openUrl(context, rel.apkDownloadUrl) },
                                colors = ButtonDefaults.buttonColors(containerColor = PosColors.Emerald600),
                                modifier = Modifier.fillMaxWidth().testTag("settings_download_update_btn")
                            ) {
                                Text("Download & Install APK", fontSize = 12.sp)
                            }
                        }
                    }
                }

                updateState.upToDateMessage?.let { msg ->
                    Text(msg, fontSize = 11.sp, color = PosColors.Emerald700, fontWeight = FontWeight.SemiBold)
                }
                updateState.errorMessage?.let { err ->
                    Text(err, fontSize = 11.sp, color = PosColors.Rose700)
                }

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = repoInput,
                        onValueChange = { repoInput = it },
                        label = { Text("GitHub Repo (owner/repo)") },
                        placeholder = { Text("username/eternalblue") },
                        singleLine = true,
                        modifier = Modifier.weight(1f).testTag("settings_github_repo_input")
                    )
                    Button(
                        onClick = { vm.saveGithubRepo(repoInput) },
                        colors = ButtonDefaults.buttonColors(containerColor = PosColors.Slate900),
                        modifier = Modifier.testTag("settings_save_repo_btn")
                    ) { Text("Save") }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("Auto-check GitHub on launch", style = MaterialTheme.typography.bodyMedium)
                    Switch(
                        checked = settings.autoCheckUpdates,
                        onCheckedChange = { vm.toggleAutoCheckUpdates(it) }
                    )
                }

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = { vm.checkForAppUpdate(silent = false) },
                        enabled = !updateState.checking,
                        colors = ButtonDefaults.buttonColors(containerColor = PosColors.Indigo600),
                        modifier = Modifier.weight(1f).testTag("settings_check_update_btn")
                    ) {
                        Text(if (updateState.checking) "Checking..." else "Check for Update", fontSize = 11.sp)
                    }
                    OutlinedButton(
                        onClick = {
                            val targetRepo = repoInput.ifBlank { updateState.effectiveRepo }
                            AndroidDeviceBridge.openUrl(context, GitHubUpdateChecker.releasesUrlForRepo(targetRepo))
                        },
                        enabled = repoInput.isNotBlank() || updateState.effectiveRepo.isNotBlank(),
                        modifier = Modifier.weight(1f).testTag("settings_open_releases_btn")
                    ) {
                        Icon(Icons.Rounded.OpenInNew, contentDescription = null, modifier = Modifier.size(14.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Open Releases", fontSize = 11.sp)
                    }
                }
            }
        }

        // Danger Zone
        Surface(shape = RoundedCornerShape(14.dp), color = PosColors.Rose50, border = BorderStroke(1.dp, PosColors.Rose100)) {
            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Danger Zone", style = MaterialTheme.typography.titleSmall, color = PosColors.Rose700)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(
                        onClick = { vm.askClearSales() },
                        border = BorderStroke(1.dp, PosColors.Rose600),
                        modifier = Modifier.weight(1f)
                    ) { Text("Clear Sales", color = PosColors.Rose700, fontSize = 12.sp) }
                    Button(
                        onClick = { vm.askFactoryReset() },
                        colors = ButtonDefaults.buttonColors(containerColor = PosColors.Rose600),
                        modifier = Modifier.weight(1f)
                    ) {
                        Icon(Icons.Rounded.DeleteForever, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Factory Reset", fontSize = 12.sp)
                    }
                }
            }
        }
    }

    if (showExportVaultPrompt) {
        var pass by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showExportVaultPrompt = false },
            title = { Text("Encrypt AES-256-GCM Vault") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Set a strong passphrase (min 6 chars) to encrypt your catalog, sales & settings.", style = MaterialTheme.typography.bodySmall)
                    OutlinedTextField(
                        value = pass,
                        onValueChange = { pass = it },
                        label = { Text("Vault Passphrase") },
                        visualTransformation = PasswordVisualTransformation(),
                        singleLine = true
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (pass.length >= 6) {
                            vm.exportEncryptedVault(pass)
                            showExportVaultPrompt = false
                        } else {
                            vm.toast("Passphrase must be at least 6 characters", ToastType.WARNING)
                        }
                    }
                ) { Text("Export Vault") }
            },
            dismissButton = { TextButton(onClick = { showExportVaultPrompt = false }) { Text("Cancel") } }
        )
    }

    pendingDecryptEnvelope?.let { env ->
        var pass by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { pendingDecryptEnvelope = null },
            title = { Text("Decrypt Encrypted Vault") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("${env.summary.products} SKUs · ${env.summary.sales} receipts · ${env.exportedAt.take(10)}", style = MaterialTheme.typography.bodySmall)
                    OutlinedTextField(
                        value = pass,
                        onValueChange = { pass = it },
                        label = { Text("Vault Passphrase") },
                        visualTransformation = PasswordVisualTransformation(),
                        singleLine = true
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        vm.security.decryptBackupPayload(env, pass)
                            .onSuccess { payload ->
                                pendingDecryptEnvelope = null
                                vm.prepareRestore(payload, pendingRestoreMode)
                            }
                            .onFailure { vm.toast("Incorrect passphrase or corrupted vault", ToastType.ERROR) }
                    }
                ) { Text("Decrypt & Restore") }
            },
            dismissButton = { TextButton(onClick = { pendingDecryptEnvelope = null }) { Text("Cancel") } }
        )
    }
}
