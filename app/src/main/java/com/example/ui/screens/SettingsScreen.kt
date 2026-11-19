package com.example.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.QrCode2
import androidx.compose.material.icons.rounded.Save
import androidx.compose.material.icons.rounded.UploadFile
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.domain.PaymentQr
import com.example.hardware.AndroidDeviceBridge
import com.example.model.ToastType
import com.example.ui.components.MerchantQrCard
import com.example.ui.theme.PosColors
import com.example.viewmodel.PosViewModel

@Composable
fun SettingsScreen(vm: PosViewModel) {
    val context = LocalContext.current
    val settings by vm.settings.collectAsStateWithLifecycle()

    var storeName by remember(settings.storeName) { mutableStateOf(settings.storeName) }
    var storeTagline by remember(settings.storeTagline) { mutableStateOf(settings.storeTagline ?: "") }
    var storeAddress by remember(settings.storeAddress) { mutableStateOf(settings.storeAddress) }
    var storeTin by remember(settings.storeTin) { mutableStateOf(settings.storeTin) }
    var storePhone by remember(settings.storePhone) { mutableStateOf(settings.storePhone) }
    var receiptFooter by remember(settings.receiptFooter) { mutableStateOf(settings.receiptFooter) }
    var customerGreeting by remember(settings.customerDisplayGreeting) { mutableStateOf(settings.customerDisplayGreeting ?: "") }

    var lowStockTh by remember(settings.lowStockThreshold) { mutableStateOf(settings.lowStockThreshold.toString()) }
    var expiryWarnDays by remember(settings.expiryWarnDays) { mutableStateOf(settings.expiryWarnDays.toString()) }
    var leadDays by remember(settings.reorderLeadDays) { mutableStateOf(settings.reorderLeadDays.toString()) }
    var safetyDays by remember(settings.reorderSafetyDays) { mutableStateOf(settings.reorderSafetyDays.toString()) }
    var scCap by remember(settings.scDiscountCap) { mutableStateOf(settings.scDiscountCap.toString()) }

    var qrPayLabel by remember(settings.qrPayLabel) { mutableStateOf(settings.qrPayLabel ?: "QR Ph / GCash") }
    var qrMerchantName by remember(settings.qrMerchantName) { mutableStateOf(settings.qrMerchantName ?: settings.storeName) }
    var qrAccount by remember(settings.qrAccountNumber) { mutableStateOf(settings.qrAccountNumber ?: "") }
    var qrEmv by remember(settings.qrEmvPayload) { mutableStateOf(settings.qrEmvPayload ?: "") }

    val notifPermLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        vm.updateSettings(settings.copy(stockAlertNotifications = granted))
        if (!granted) vm.toast("Notification permission denied", ToastType.WARNING)
    }

    val qrPhotoPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) {
            val (b64, decodedEmv) = AndroidDeviceBridge.decodeImageFromUriToBase64AndQr(context, uri)
            val nextEmv = decodedEmv ?: qrEmv
            if (decodedEmv != null) qrEmv = decodedEmv
            vm.updateSettings(
                settings.copy(
                    qrImageDataUrl = b64,
                    qrEmvPayload = nextEmv.ifBlank { null }
                ),
                "Uploaded Merchant QR image"
            )
            vm.toast(if (decodedEmv != null) "Decoded EMVCo QR Ph from photo!" else "Saved Merchant QR photo")
        }
    }

    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
        LazyColumn(
            modifier = Modifier.widthIn(max = 780.dp).fillMaxSize(),
            contentPadding = PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
        item {
            Surface(shape = RoundedCornerShape(14.dp), color = PosColors.Slate900) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Store Settings", color = Color.White, style = MaterialTheme.typography.titleMedium)
                        Text("Unlocked Manager View", color = PosColors.Emerald500, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        OutlinedButton(onClick = { vm.lockSettings() }, modifier = Modifier.testTag("settings_lock_btn")) {
                            Text("Lock Settings", color = Color.White, fontSize = 11.sp)
                        }
                        Button(
                            onClick = { vm.lockTerminal() },
                            colors = ButtonDefaults.buttonColors(containerColor = PosColors.Rose600),
                            modifier = Modifier.testTag("settings_lock_terminal_btn")
                        ) {
                            Icon(Icons.Rounded.Lock, contentDescription = null, modifier = Modifier.size(14.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Lock POS", fontSize = 11.sp)
                        }
                    }
                }
            }
        }

        // Store Profile Form
        item {
            Surface(shape = RoundedCornerShape(14.dp), color = Color.White, border = BorderStroke(1.dp, PosColors.Slate200)) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Store Profile & Receipt Header", style = MaterialTheme.typography.titleSmall)
                    OutlinedTextField(value = storeName, onValueChange = { storeName = it }, label = { Text("Store Name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = storeTagline, onValueChange = { storeTagline = it }, label = { Text("Tagline") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = storeAddress, onValueChange = { storeAddress = it }, label = { Text("Address") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = storeTin, onValueChange = { storeTin = it }, label = { Text("TIN / BIR Notice") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = storePhone, onValueChange = { storePhone = it }, label = { Text("Phone / Viber") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = receiptFooter, onValueChange = { receiptFooter = it }, label = { Text("Receipt Footer") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = customerGreeting, onValueChange = { customerGreeting = it }, label = { Text("Customer Display Greeting") }, singleLine = true, modifier = Modifier.fillMaxWidth())

                    Row(modifier = Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf("basket" to "Basket", "store" to "Store", "bag" to "Bag", "scanner" to "Scanner", "receipt" to "Receipt").forEach { (id, lbl) ->
                            FilterChip(
                                selected = (settings.storeIcon ?: "basket") == id,
                                onClick = { vm.updateSettings(settings.copy(storeIcon = id), "Store emblem $lbl") },
                                label = { Text(lbl, fontSize = 11.sp) }
                            )
                        }
                    }

                    Text("Stock & SC/PWD Rules", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 4.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(value = lowStockTh, onValueChange = { lowStockTh = it }, label = { Text("Low Stock Min") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true, modifier = Modifier.weight(1f))
                        OutlinedTextField(value = expiryWarnDays, onValueChange = { expiryWarnDays = it }, label = { Text("Expiry Warn (d)") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true, modifier = Modifier.weight(1f))
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(value = leadDays, onValueChange = { leadDays = it }, label = { Text("Lead Days") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true, modifier = Modifier.weight(1f))
                        OutlinedTextField(value = safetyDays, onValueChange = { safetyDays = it }, label = { Text("Safety Days") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true, modifier = Modifier.weight(1f))
                        OutlinedTextField(value = scCap, onValueChange = { scCap = it }, label = { Text("SC Cap (₱)") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true, modifier = Modifier.weight(1f))
                    }

                    Button(
                        onClick = {
                            vm.updateSettings(
                                settings.copy(
                                    storeName = storeName.trim().ifEmpty { "EternalBlue Mart" },
                                    storeTagline = storeTagline.trim().ifEmpty { null },
                                    storeAddress = storeAddress.trim(),
                                    storeTin = storeTin.trim(),
                                    storePhone = storePhone.trim(),
                                    receiptFooter = receiptFooter.trim(),
                                    customerDisplayGreeting = customerGreeting.trim().ifEmpty { null },
                                    lowStockThreshold = (lowStockTh.toDoubleOrNull() ?: 10.0).coerceAtLeast(0.0),
                                    expiryWarnDays = (expiryWarnDays.toIntOrNull() ?: 30).coerceAtLeast(1),
                                    reorderLeadDays = (leadDays.toIntOrNull() ?: 3).coerceAtLeast(0),
                                    reorderSafetyDays = (safetyDays.toIntOrNull() ?: 2).coerceAtLeast(0),
                                    scDiscountCap = (scCap.toDoubleOrNull() ?: 125.0).coerceAtLeast(0.0)
                                ),
                                "Updated store profile & thresholds"
                            )
                            vm.toast("Store settings saved")
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = PosColors.Emerald600),
                        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("settings_save_profile_btn")
                    ) {
                        Icon(Icons.Rounded.Save, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Save Store Profile")
                    }
                }
            }
        }

        // Hardware & Alert Toggles
        item {
            Surface(shape = RoundedCornerShape(14.dp), color = Color.White, border = BorderStroke(1.dp, PosColors.Slate200)) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("POS Behavior & Alerts", style = MaterialTheme.typography.titleSmall)
                    SettingsToggleRow("Scan & Tap Beep", settings.beep) { vm.updateSettings(settings.copy(beep = it)) }
                    SettingsToggleRow("Haptic Vibration", settings.vibrate) { vm.updateSettings(settings.copy(vibrate = it)) }
                    SettingsToggleRow("Low-Stock System Notifications", settings.stockAlertNotifications) { enabled ->
                        if (enabled && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                        ) {
                            notifPermLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                        } else {
                            vm.updateSettings(settings.copy(stockAlertNotifications = enabled))
                        }
                    }
                    SettingsToggleRow("Lock Whole POS on Launch", settings.lockWholePos) { vm.updateSettings(settings.copy(lockWholePos = it)) }
                }
            }
        }

        // Merchant QR Ph Config
        item {
            val previewSettings = remember(settings, qrPayLabel, qrMerchantName, qrAccount, qrEmv) {
                settings.copy(
                    qrPayLabel = qrPayLabel,
                    qrMerchantName = qrMerchantName,
                    qrAccountNumber = qrAccount,
                    qrEmvPayload = qrEmv
                )
            }
            val resolvedQr = remember(previewSettings) { PaymentQr.resolveCheckoutQrState(previewSettings, 100.0) }
            Surface(shape = RoundedCornerShape(14.dp), color = Color.White, border = BorderStroke(1.dp, PosColors.Slate200)) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Merchant QR Ph / GCash / Maya Config", style = MaterialTheme.typography.titleSmall)
                    OutlinedTextField(value = qrPayLabel, onValueChange = { qrPayLabel = it }, label = { Text("Channel Label") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(value = qrMerchantName, onValueChange = { qrMerchantName = it }, label = { Text("Merchant Name") }, singleLine = true, modifier = Modifier.weight(1f))
                        OutlinedTextField(value = qrAccount, onValueChange = { qrAccount = it }, label = { Text("Account / GCash #") }, singleLine = true, modifier = Modifier.weight(1f))
                    }
                    OutlinedTextField(value = qrEmv, onValueChange = { qrEmv = it }, label = { Text("EMVCo QR Ph Payload (000201...)") }, maxLines = 3, modifier = Modifier.fillMaxWidth())

                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(
                            onClick = {
                                qrEmv = PaymentQr.buildMerchantQrPhString(
                                    merchantName = qrMerchantName.ifBlank { storeName },
                                    merchantAccount = qrAccount.ifBlank { "09170000000" }
                                )
                                vm.toast("Generated valid CRC-16 EMVCo QR Ph string")
                            },
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(Icons.Rounded.QrCode2, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Generate QR Ph", fontSize = 11.sp)
                        }
                        OutlinedButton(
                            onClick = {
                                qrPhotoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                            },
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(Icons.Rounded.UploadFile, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Upload Photo", fontSize = 11.sp)
                        }
                    }

                    Button(
                        onClick = {
                            vm.updateSettings(
                                settings.copy(
                                    qrPayLabel = qrPayLabel.trim().ifEmpty { null },
                                    qrMerchantName = qrMerchantName.trim().ifEmpty { null },
                                    qrAccountNumber = qrAccount.trim().ifEmpty { null },
                                    qrEmvPayload = qrEmv.trim().ifEmpty { null }
                                ),
                                "Updated Payment QR configuration"
                            )
                            vm.toast("Merchant Payment QR saved")
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = PosColors.Indigo600),
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("Save Payment QR") }

                    MerchantQrCard(qrState = resolvedQr, compact = true)
                }
            }
        }

        // Security, Audit Ledger, Config History, Backups & Danger Zone
        item {
            SettingsSecurityAndBackupSection(vm)
        }
        }
    }
}

@Composable
private fun SettingsToggleRow(label: String, checked: Boolean, onChanged: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium)
        Switch(checked = checked, onCheckedChange = onChanged)
    }
}
