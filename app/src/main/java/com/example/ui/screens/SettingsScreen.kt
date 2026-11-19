package com.example.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Surface
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.BuildConfig
import com.example.domain.GitHubUpdateChecker
import com.example.hardware.AndroidDeviceBridge
import com.example.ui.components.GlowingEmeraldStoreName
import com.example.ui.components.StoreEmblem
import com.example.ui.theme.AmberWarn
import com.example.ui.theme.EmeraldDark
import com.example.ui.theme.EmeraldDeepCanvas
import com.example.ui.theme.EmeraldGlowCore
import com.example.ui.theme.EmeraldLightBg
import com.example.ui.theme.EmeraldPrimary
import com.example.ui.theme.IndigoAccent
import com.example.ui.theme.RoseDanger
import com.example.ui.theme.SlateBorder
import com.example.ui.theme.SlateMuted
import com.example.ui.theme.SlateSurface
import com.example.viewmodel.PosUiState
import com.example.viewmodel.PosViewModel

@Composable
fun SettingsScreen(state: PosUiState, vm: PosViewModel) {
    if (state.pinConfigured && !state.settingsUnlocked) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize().background(SlateSurface).padding(24.dp)) {
            Card(shape = RoundedCornerShape(16.dp), colors = CardDefaults.cardColors(containerColor = Color.White), border = BorderStroke(1.dp, SlateBorder)) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(24.dp)) {
                    Icon(Icons.Filled.Lock, contentDescription = null, tint = EmeraldPrimary)
                    Spacer(Modifier.height(8.dp))
                    Text("Settings Locked", fontWeight = FontWeight.ExtraBold, fontSize = 18.sp)
                    Text("Enter Manager PIN to edit store profile, QR Ph, and security.", fontSize = 12.sp, color = SlateMuted)
                    Spacer(Modifier.height(14.dp))
                    Button(onClick = { vm.openPinModal("unlockSettings") }, colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary)) {
                        Text("Unlock Settings", fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
        return
    }

    var storeName by remember(state.settings.storeName) { mutableStateOf(state.settings.storeName) }
    var storeAddr by remember(state.settings.storeAddress) { mutableStateOf(state.settings.storeAddress) }
    var storeFooter by remember(state.settings.receiptFooter) { mutableStateOf(state.settings.receiptFooter) }
    var scCap by remember(state.settings.scDiscountCap) { mutableStateOf(state.settings.scDiscountCap.toString()) }
    var lowThresh by remember(state.settings.lowStockThreshold) { mutableStateOf(state.settings.lowStockThreshold.toString()) }
    var qrLabel by remember(state.settings.qrPayLabel) { mutableStateOf(state.settings.qrPayLabel.orEmpty()) }
    var qrAcct by remember(state.settings.qrAccountNumber) { mutableStateOf(state.settings.qrAccountNumber.orEmpty()) }
    var qrEmv by remember(state.settings.qrEmvPayload) { mutableStateOf(state.settings.qrEmvPayload.orEmpty()) }
    var githubRepoInput by remember(state.settings.githubRepo) { mutableStateOf(state.settings.githubRepo) }
    val ctx = LocalContext.current

    LazyColumn(
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxSize().background(SlateSurface)
    ) {
        item {
            Card(shape = RoundedCornerShape(14.dp), colors = CardDefaults.cardColors(containerColor = Color.White), border = BorderStroke(1.dp, SlateBorder)) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(14.dp)) {
                    Text("Store Profile & Emblem", fontWeight = FontWeight.ExtraBold, fontSize = 15.sp)
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = EmeraldDeepCanvas,
                        border = BorderStroke(1.dp, EmeraldGlowCore.copy(alpha = 0.35f)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp)
                        ) {
                            StoreEmblem(iconKey = state.settings.storeIcon, size = 32.dp)
                            Spacer(Modifier.width(10.dp))
                            GlowingEmeraldStoreName(
                                text = storeName.trim().ifEmpty { "EternalBlue Mart" },
                                fontSize = 16.sp,
                                modifier = Modifier.weight(1f, fill = false)
                            )
                        }
                    }
                    OutlinedTextField(value = storeName, onValueChange = { storeName = it }, label = { Text("Store Name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = storeAddr, onValueChange = { storeAddr = it }, label = { Text("Address") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = storeFooter, onValueChange = { storeFooter = it }, label = { Text("Receipt Footer") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf("basket" to "Basket", "brand" to "Logo", "store" to "Store", "bag" to "Bag").forEach { (id, lbl) ->
                            FilterChip(
                                selected = state.settings.storeIcon == id,
                                onClick = { vm.updateSettings { it.copy(storeIcon = id) } },
                                label = { Text(lbl, fontSize = 11.sp) }
                            )
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(value = scCap, onValueChange = { scCap = it }, label = { Text("SC/PWD Cap (₱)") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true, modifier = Modifier.weight(1f))
                        OutlinedTextField(value = lowThresh, onValueChange = { lowThresh = it }, label = { Text("Low Stock Alert") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true, modifier = Modifier.weight(1f))
                    }
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                        Text("Scanner Beep Sound", fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        Switch(checked = state.settings.beep, onCheckedChange = { b -> vm.updateSettings { it.copy(beep = b) } })
                    }
                    Button(
                        onClick = {
                            vm.updateSettings {
                                it.copy(
                                    storeName = storeName.trim().ifEmpty { "EternalBlue Mart" },
                                    storeAddress = storeAddr.trim(),
                                    receiptFooter = storeFooter.trim(),
                                    scDiscountCap = scCap.toDoubleOrNull() ?: 125.0,
                                    lowStockThreshold = lowThresh.toDoubleOrNull() ?: 10.0
                                )
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary),
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("Save Store Profile", fontWeight = FontWeight.Bold) }
                }
            }
        }

        item {
            Card(shape = RoundedCornerShape(14.dp), colors = CardDefaults.cardColors(containerColor = Color.White), border = BorderStroke(1.dp, SlateBorder)) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(14.dp)) {
                    Text("Payment QR Ph / GCash / Maya", fontWeight = FontWeight.ExtraBold, fontSize = 15.sp)
                    OutlinedTextField(value = qrLabel, onValueChange = { qrLabel = it }, label = { Text("Channel Label (e.g. GCash / QR Ph)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = qrAcct, onValueChange = { qrAcct = it }, label = { Text("Mobile / Account Number") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = qrEmv, onValueChange = { qrEmv = it }, label = { Text("EMVCo Static QR Ph Payload (optional)") }, maxLines = 3, modifier = Modifier.fillMaxWidth())
                    Button(
                        onClick = {
                            vm.updateSettings {
                                it.copy(
                                    qrPayLabel = qrLabel.trim().takeIf { s -> s.isNotEmpty() },
                                    qrAccountNumber = qrAcct.trim().takeIf { s -> s.isNotEmpty() },
                                    qrEmvPayload = qrEmv.trim().takeIf { s -> s.isNotEmpty() }
                                )
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary),
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("Save Payment QR", fontWeight = FontWeight.Bold) }
                }
            }
        }

        item { SettingsSecuritySection(state, vm) }

        item {
            val info = state.updateInfo
            Card(shape = RoundedCornerShape(14.dp), colors = CardDefaults.cardColors(containerColor = Color.White), border = BorderStroke(1.dp, SlateBorder)) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(14.dp)) {
                    Row(horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                        Text("GitHub App Updates (Mobile & Tablet)", fontWeight = FontWeight.ExtraBold, fontSize = 15.sp)
                        val badgeBg = when (info?.status) {
                            GitHubUpdateChecker.SyncStatus.UPDATE_AVAILABLE -> EmeraldLightBg
                            GitHubUpdateChecker.SyncStatus.NO_RELEASE_APK_YET -> Color(0xFFFFFBEB)
                            GitHubUpdateChecker.SyncStatus.ERROR -> Color(0xFFFFF1F2)
                            else -> Color(0xFFF1F5F9)
                        }
                        val badgeFg = when (info?.status) {
                            GitHubUpdateChecker.SyncStatus.UPDATE_AVAILABLE -> EmeraldDark
                            GitHubUpdateChecker.SyncStatus.NO_RELEASE_APK_YET -> AmberWarn
                            GitHubUpdateChecker.SyncStatus.ERROR -> RoseDanger
                            else -> SlateMuted
                        }
                        val badgeText = when {
                            state.updateChecking -> "Checking..."
                            info?.status == GitHubUpdateChecker.SyncStatus.UPDATE_AVAILABLE -> "Update ${info.tagName}"
                            info?.status == GitHubUpdateChecker.SyncStatus.UP_TO_DATE -> "Up to Date"
                            info?.status == GitHubUpdateChecker.SyncStatus.NO_RELEASE_APK_YET -> "Release Needed"
                            info?.status == GitHubUpdateChecker.SyncStatus.ERROR -> "Sync Issue"
                            else -> "Not Checked"
                        }
                        Surface(color = badgeBg, shape = RoundedCornerShape(6.dp)) {
                            Text(badgeText, color = badgeFg, fontSize = 10.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp))
                        }
                    }

                    Text(
                        "Installed: v${BuildConfig.VERSION_NAME} (Build ${BuildConfig.VERSION_CODE})",
                        fontSize = 12.sp,
                        fontFamily = FontFamily.Monospace,
                        color = SlateMuted
                    )

                    OutlinedTextField(
                        value = githubRepoInput,
                        onValueChange = { githubRepoInput = it },
                        label = { Text("GitHub Repository (owner/repo)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )

                    if (info != null) {
                        Text(info.message, fontSize = 12.sp, color = if (info.status == GitHubUpdateChecker.SyncStatus.ERROR) RoseDanger else SlateMuted)
                    }
                    if (!state.updateCheckedAt.isNullOrBlank()) {
                        Text("Last checked: ${state.updateCheckedAt}", fontSize = 11.sp, color = SlateMuted)
                    }

                    if (state.apkDownloading) {
                        LinearProgressIndicator(
                            progress = { (state.apkDownloadProgress / 100f).coerceIn(0f, 1f) },
                            modifier = Modifier.fillMaxWidth()
                        )
                        Text("Downloading APK update... ${state.apkDownloadProgress}%", fontSize = 11.sp, color = EmeraldDark, fontWeight = FontWeight.Bold)
                    }

                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        Button(
                            onClick = { vm.checkForGitHubUpdates(silent = false, repoOverride = githubRepoInput) },
                            enabled = !state.updateChecking && !state.apkDownloading,
                            colors = ButtonDefaults.buttonColors(containerColor = IndigoAccent),
                            modifier = Modifier.weight(1f)
                        ) {
                            Text(if (state.updateChecking) "Checking..." else "Check GitHub Now", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                        if (info?.isNewer == true) {
                            Button(
                                onClick = { vm.downloadAndInstallGitHubUpdate(ctx) },
                                enabled = !state.apkDownloading,
                                colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary),
                                modifier = Modifier.weight(1f)
                            ) {
                                Text(if (info.apkDownloadUrl != null) "Install ${info.tagName}" else "Open Release", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            }
                        } else if (info != null) {
                            OutlinedButton(
                                onClick = { AndroidDeviceBridge.openUrl(ctx, info.htmlUrl) },
                                modifier = Modifier.weight(1f)
                            ) {
                                Text("Open GitHub", fontSize = 12.sp)
                            }
                        }
                    }
                }
            }
        }

        item {
            Text(
                "EternalBlue POS v${BuildConfig.VERSION_NAME} (Build ${BuildConfig.VERSION_CODE}) • Offline SQLite Engine",
                fontSize = 11.sp,
                color = SlateMuted,
                modifier = Modifier.padding(4.dp)
            )
        }
    }
}
