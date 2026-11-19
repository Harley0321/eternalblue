package com.example.ui.modals

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Backspace
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Fingerprint
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.domain.PosMath
import com.example.hardware.AndroidDeviceBridge
import com.example.model.SecurityEventType
import com.example.model.SecuritySeverity
import com.example.model.ToastType
import com.example.ui.components.getCategoryIcon
import com.example.ui.theme.PosColors
import com.example.viewmodel.PinModalMode
import com.example.viewmodel.PosViewModel
import kotlinx.coroutines.delay

@Composable
fun WeightDialog(vm: PosViewModel) {
    val prod by vm.weightProduct.collectAsStateWithLifecycle()
    val p = prod ?: return
    var kgStr by remember(p.id) { mutableStateOf("1") }
    val kg = (kgStr.toDoubleOrNull() ?: 0.0).coerceAtLeast(0.0)

    Dialog(onDismissRequest = { vm.closeWeightModal() }) {
        BackHandler { vm.closeWeightModal() }
        Surface(shape = RoundedCornerShape(20.dp), color = Color.White, modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(p.name, style = MaterialTheme.typography.titleMedium)
                Text("${PosMath.formatPeso(p.retailPrice)} / kg · Stock ${PosMath.formatQty(p.stock, p.unit)}", style = MaterialTheme.typography.bodySmall, color = PosColors.Slate600)

                OutlinedTextField(
                    value = kgStr,
                    onValueChange = { kgStr = it },
                    label = { Text("Weight in kilograms (kg)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().testTag("weight_kg_input")
                )

                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                    listOf("0.25", "0.5", "1", "2", "5").forEach { preset ->
                        FilterChip(
                            selected = kgStr == preset,
                            onClick = { kgStr = preset },
                            label = { Text("${preset}kg", fontSize = 11.sp) },
                            modifier = Modifier.weight(1f)
                        )
                    }
                }

                Surface(shape = RoundedCornerShape(12.dp), color = PosColors.Emerald50) {
                    Row(modifier = Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Line Total", color = PosColors.Emerald700, fontWeight = FontWeight.Bold)
                        Text(PosMath.formatPeso(PosMath.lineTotalPeso(p.retailPrice, kg)), color = PosColors.Emerald700, fontWeight = FontWeight.ExtraBold)
                    }
                }

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    OutlinedButton(onClick = { vm.closeWeightModal() }, modifier = Modifier.weight(0.4f)) { Text("Cancel") }
                    Button(
                        onClick = {
                            if (kg > 0.0) {
                                vm.addQtyToCart(p, kg)
                                vm.closeWeightModal()
                            } else {
                                vm.toast("Enter weight > 0 kg", ToastType.WARNING)
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = PosColors.Emerald600),
                        modifier = Modifier.weight(0.6f)
                    ) { Text("Add Weight") }
                }
            }
        }
    }
}

@Composable
fun HoldCartDialog(vm: PosViewModel) {
    val open by vm.holdModalOpen.collectAsStateWithLifecycle()
    if (!open) return

    var note by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = { vm.closeHoldModal() },
        title = { Text("Park / Hold Order") },
        text = {
            OutlinedTextField(
                value = note,
                onValueChange = { note = it },
                label = { Text("Customer / Basket Note (Optional)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
        },
        confirmButton = {
            Button(
                onClick = { vm.confirmHoldOrder(note) },
                colors = ButtonDefaults.buttonColors(containerColor = PosColors.Emerald600)
            ) { Text("Park Order") }
        },
        dismissButton = { TextButton(onClick = { vm.closeHoldModal() }) { Text("Cancel") } }
    )
}

@Composable
fun HeldOrdersDialog(vm: PosViewModel) {
    val open by vm.heldModalOpen.collectAsStateWithLifecycle()
    if (!open) return

    val held by vm.heldOrders.collectAsStateWithLifecycle()
    Dialog(onDismissRequest = { vm.closeHeldModal() }) {
        BackHandler { vm.closeHeldModal() }
        Surface(shape = RoundedCornerShape(20.dp), color = Color.White, modifier = Modifier.fillMaxWidth().heightIn(max = 560.dp)) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text("Parked / Held Orders (${held.size})", style = MaterialTheme.typography.titleMedium)
                    IconButton(onClick = { vm.closeHeldModal() }) { Icon(Icons.Rounded.Close, contentDescription = "Close") }
                }
                if (held.isEmpty()) {
                    Text("No parked orders.", color = PosColors.Slate500, modifier = Modifier.padding(vertical = 20.dp))
                } else {
                    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(held, key = { it.id }) { h ->
                            Surface(shape = RoundedCornerShape(12.dp), color = PosColors.Slate50, border = BorderStroke(1.dp, PosColors.Slate200)) {
                                Row(modifier = Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(h.label ?: h.id, style = MaterialTheme.typography.labelMedium)
                                        Text("${h.time} · ${h.items.size} items · ${PosMath.formatPeso(h.total)}", fontSize = 11.sp, color = PosColors.Slate600)
                                    }
                                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                        Button(
                                            onClick = { vm.recallHeldOrder(h.id) },
                                            colors = ButtonDefaults.buttonColors(containerColor = PosColors.Emerald600),
                                            modifier = Modifier.height(36.dp)
                                        ) { Text("Recall", fontSize = 11.sp) }
                                        IconButton(onClick = { vm.deleteHeldOrder(h.id) }) {
                                            Icon(Icons.Rounded.DeleteOutline, contentDescription = "Delete", tint = PosColors.Rose600)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun CategorySheetDialog(vm: PosViewModel) {
    val open by vm.categorySheetOpen.collectAsStateWithLifecycle()
    if (!open) return

    val products by vm.products.collectAsStateWithLifecycle()
    val counts = remember(products) { products.groupingBy { it.category }.eachCount() }
    val cats = remember(products) { listOf("All") + products.map { it.category }.filter { it.isNotBlank() }.distinct() }

    Dialog(onDismissRequest = { vm.closeCategorySheet() }) {
        BackHandler { vm.closeCategorySheet() }
        Surface(shape = RoundedCornerShape(20.dp), color = Color.White, modifier = Modifier.fillMaxWidth().heightIn(max = 560.dp)) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text("All Categories", style = MaterialTheme.typography.titleMedium)
                    IconButton(onClick = { vm.closeCategorySheet() }) { Icon(Icons.Rounded.Close, contentDescription = "Close") }
                }
                LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(cats) { cat ->
                        val c = if (cat == "All") products.size else (counts[cat] ?: 0)
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = PosColors.Slate50,
                            border = BorderStroke(1.dp, PosColors.Slate200),
                            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable {
                                vm.setPosCategory(cat)
                                vm.closeCategorySheet()
                            }
                        ) {
                            Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Icon(getCategoryIcon(cat), contentDescription = null, tint = PosColors.Emerald700)
                                    Text(cat, style = MaterialTheme.typography.titleSmall)
                                }
                                Text("$c SKU(s)", fontSize = 11.sp, color = PosColors.Slate500)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun VoidSaleDialog(vm: PosViewModel) {
    val sale by vm.voidTargetSale.collectAsStateWithLifecycle()
    val target = sale ?: return

    val settings by vm.settings.collectAsStateWithLifecycle()
    val hasPin = vm.security.pinIsSet(settings)
    var reason by remember(target.receiptNo) { mutableStateOf("Customer Cancelled") }
    var pinInput by remember(target.receiptNo) { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = { vm.closeVoidSale() },
        title = { Text("Void Receipt ${target.receiptNo}?") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Amount: ${PosMath.formatPeso(target.grandTotal)} · Items will be restored to stock.", style = MaterialTheme.typography.bodySmall)
                OutlinedTextField(value = reason, onValueChange = { reason = it }, label = { Text("Void Reason") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                if (hasPin) {
                    OutlinedTextField(
                        value = pinInput,
                        onValueChange = { pinInput = it },
                        label = { Text("Manager PIN") },
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (hasPin) {
                        val res = vm.security.verifyPinWithSettings(pinInput, settings)
                        if (!res.ok) {
                            vm.toast(res.error ?: "Invalid PIN", ToastType.ERROR)
                            return@Button
                        }
                        vm.confirmVoidSale(target.receiptNo, reason.ifBlank { "Voided" }, res.upgradedSettings)
                    } else {
                        vm.confirmVoidSale(target.receiptNo, reason.ifBlank { "Voided" }, null)
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = PosColors.Rose600)
            ) { Text("Void & Restore Stock") }
        },
        dismissButton = { TextButton(onClick = { vm.closeVoidSale() }) { Text("Cancel") } }
    )
}

@Composable
fun ConfirmDialog(vm: PosViewModel) {
    val state by vm.confirmState.collectAsStateWithLifecycle()
    val s = state ?: return
    val settings by vm.settings.collectAsStateWithLifecycle()
    val needPin = s.requirePin && vm.security.pinIsSet(settings)
    var pin by remember(s) { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = { vm.closeConfirm() },
        title = { Text(s.title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(s.message, style = MaterialTheme.typography.bodyMedium)
                if (needPin) {
                    OutlinedTextField(
                        value = pin,
                        onValueChange = { pin = it },
                        label = { Text("Manager PIN Required") },
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (needPin) {
                        val check = vm.security.verifyPinWithSettings(pin, settings)
                        if (!check.ok) {
                            vm.toast(check.error ?: "Invalid PIN", ToastType.ERROR)
                            return@Button
                        }
                        vm.executeConfirmAction(check.upgradedSettings)
                    } else {
                        vm.executeConfirmAction(null)
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = if (s.danger) PosColors.Rose600 else PosColors.Emerald600)
            ) { Text(s.confirmLabel) }
        },
        dismissButton = { TextButton(onClick = { vm.closeConfirm() }) { Text("Cancel") } }
    )
}

@Composable
fun PinDialog(vm: PosViewModel) {
    val state by vm.pinModal.collectAsStateWithLifecycle()
    if (!state.open) return

    val context = LocalContext.current
    val settings by vm.settings.collectAsStateWithLifecycle()
    var step by remember(state.mode, state.open) { mutableStateOf(0) } // 0 = old/unlock, 1 = new, 2 = confirm
    var firstPin by remember(state.mode, state.open) { mutableStateOf("") }
    var currentInput by remember(state.mode, state.open) { mutableStateOf("") }
    var errorMsg by remember(state.mode, state.open) { mutableStateOf<String?>(null) }
    var lockoutSec by remember { mutableLongStateOf(vm.security.pinLockedFor()) }

    LaunchedEffect(state.open, errorMsg) {
        lockoutSec = vm.security.pinLockedFor()
        while (lockoutSec > 0L) {
            delay(1000L)
            lockoutSec = vm.security.pinLockedFor()
        }
    }

    val title = when (state.mode) {
        PinModalMode.setup -> if (step == 0) "Create Manager PIN" else "Confirm Manager PIN"
        PinModalMode.change -> when (step) {
            0 -> "Enter Current Manager PIN"
            1 -> "Enter New Manager PIN"
            else -> "Confirm New Manager PIN"
        }
        PinModalMode.unlock -> "Unlock Store Settings"
    }

    Dialog(onDismissRequest = { vm.closePinModal() }) {
        BackHandler { vm.closePinModal() }
        Surface(shape = RoundedCornerShape(22.dp), color = Color.White, modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(18.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(title, style = MaterialTheme.typography.titleMedium)
                if (lockoutSec > 0L) {
                    Text("Locked for ${vm.security.fmtWait(lockoutSec)}", color = PosColors.Rose700, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                } else if (errorMsg != null) {
                    Text(errorMsg!!, color = PosColors.Rose700, fontSize = 12.sp)
                }

                // Masked Pin Display
                Text(
                    text = if (currentInput.isEmpty()) "••••" else "•".repeat(currentInput.length),
                    fontSize = 28.sp,
                    letterSpacing = 6.sp,
                    color = PosColors.Slate900,
                    fontWeight = FontWeight.ExtraBold
                )

                PinPadGrid(
                    onDigit = { d -> if (currentInput.length < 8) { currentInput += d; errorMsg = null } },
                    onBackspace = { if (currentInput.isNotEmpty()) currentInput = currentInput.dropLast(1) },
                    onClear = { currentInput = "" }
                )

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    if (state.mode == PinModalMode.unlock && settings.biometricEnabled && AndroidDeviceBridge.isBiometricAvailable(context)) {
                        OutlinedButton(
                            onClick = {
                                val act = context as? FragmentActivity ?: return@OutlinedButton
                                AndroidDeviceBridge.authenticateBiometric(
                                    activity = act,
                                    onSuccess = { vm.onPinVerifiedForSettings(null, viaBiometric = true) },
                                    onError = { errorMsg = it }
                                )
                            },
                            modifier = Modifier.weight(0.45f)
                        ) {
                            Icon(Icons.Rounded.Fingerprint, contentDescription = "Biometric unlock", modifier = Modifier.size(18.dp))
                        }
                    } else {
                        OutlinedButton(onClick = { vm.closePinModal() }, modifier = Modifier.weight(0.4f)) { Text("Cancel") }
                    }

                    Button(
                        onClick = {
                            if (currentInput.length < 4) {
                                errorMsg = "Enter at least 4 digits"
                                return@Button
                            }
                            when (state.mode) {
                                PinModalMode.setup -> {
                                    if (step == 0) {
                                        firstPin = currentInput; currentInput = ""; step = 1
                                    } else if (currentInput == firstPin) {
                                        val next = vm.security.storePinInSettings(settings, currentInput, vm.security.isWeakPin(currentInput))
                                        vm.onPinVerifiedForSettings(next)
                                    } else {
                                        errorMsg = "PINs do not match"; currentInput = ""; step = 0
                                    }
                                }
                                PinModalMode.unlock -> {
                                    val res = vm.security.verifyPinWithSettings(currentInput, settings)
                                    if (res.ok) vm.onPinVerifiedForSettings(res.upgradedSettings)
                                    else {
                                        errorMsg = res.error; currentInput = ""
                                        vm.logSecurityEvent(if (res.lockedOutNow) SecurityEventType.PIN_LOCKOUT else SecurityEventType.PIN_FAIL, res.error ?: "PIN failed", SecuritySeverity.warning)
                                    }
                                }
                                PinModalMode.change -> {
                                    when (step) {
                                        0 -> {
                                            val res = vm.security.verifyPinWithSettings(currentInput, settings)
                                            if (res.ok) { currentInput = ""; step = 1 }
                                            else { errorMsg = res.error; currentInput = "" }
                                        }
                                        1 -> { firstPin = currentInput; currentInput = ""; step = 2 }
                                        else -> {
                                            if (currentInput == firstPin) {
                                                val next = vm.security.storePinInSettings(settings, currentInput, vm.security.isWeakPin(currentInput))
                                                vm.updateSettings(next)
                                                vm.logSecurityEvent(SecurityEventType.PIN_SET, "Manager changed Store PIN")
                                                vm.closePinModal()
                                                vm.toast("Manager PIN updated")
                                            } else {
                                                errorMsg = "PINs do not match"; currentInput = ""; step = 1
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = PosColors.Emerald600),
                        modifier = Modifier.weight(0.6f).testTag("pin_submit_button")
                    ) { Text("Continue") }
                }
            }
        }
    }
}

@Composable
fun TerminalLockOverlay(vm: PosViewModel) {
    val locked by vm.terminalLocked.collectAsStateWithLifecycle()
    if (!locked) return

    val context = LocalContext.current
    val settings by vm.settings.collectAsStateWithLifecycle()
    var pinInput by remember { mutableStateOf("") }
    var err by remember { mutableStateOf<String?>(null) }

    BackHandler { /* Trap back button on lockscreen */ }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(PosColors.Slate950)
            .systemBarsPadding()
            .padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Surface(shape = RoundedCornerShape(24.dp), color = Color.White, modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(22.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Icon(Icons.Rounded.Lock, contentDescription = null, tint = PosColors.Emerald600, modifier = Modifier.size(36.dp))
                Text("${settings.storeName} Locked", style = MaterialTheme.typography.titleLarge)
                Text("Enter Manager PIN to resume terminal", style = MaterialTheme.typography.bodySmall, color = PosColors.Slate500)
                if (err != null) Text(err!!, color = PosColors.Rose700, fontSize = 12.sp)

                Text(
                    text = if (pinInput.isEmpty()) "••••" else "•".repeat(pinInput.length),
                    fontSize = 28.sp,
                    letterSpacing = 6.sp,
                    fontWeight = FontWeight.ExtraBold
                )

                PinPadGrid(
                    onDigit = { if (pinInput.length < 8) { pinInput += it; err = null } },
                    onBackspace = { if (pinInput.isNotEmpty()) pinInput = pinInput.dropLast(1) },
                    onClear = { pinInput = "" }
                )

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    if (settings.biometricEnabled && AndroidDeviceBridge.isBiometricAvailable(context)) {
                        OutlinedButton(
                            onClick = {
                                val act = context as? FragmentActivity ?: return@OutlinedButton
                                AndroidDeviceBridge.authenticateBiometric(
                                    activity = act,
                                    title = "Unlock POS Terminal",
                                    onSuccess = { vm.unlockTerminal(null, viaBiometric = true) },
                                    onError = { err = it }
                                )
                            },
                            modifier = Modifier.weight(0.45f)
                        ) { Icon(Icons.Rounded.Fingerprint, contentDescription = "Biometric unlock") }
                    }
                    Button(
                        onClick = {
                            val res = vm.security.verifyPinWithSettings(pinInput, settings)
                            if (res.ok) {
                                vm.unlockTerminal(res.upgradedSettings)
                            } else {
                                err = res.error; pinInput = ""
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = PosColors.Emerald600),
                        modifier = Modifier.weight(1f).testTag("lockscreen_unlock_btn")
                    ) { Text("Unlock Terminal") }
                }
            }
        }
    }
}

@Composable
private fun PinPadGrid(onDigit: (String) -> Unit, onBackspace: () -> Unit, onClear: () -> Unit) {
    val rows = listOf(
        listOf("1", "2", "3"),
        listOf("4", "5", "6"),
        listOf("7", "8", "9"),
        listOf("CLR", "0", "DEL")
    )
    Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
        rows.forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                row.forEach { key ->
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = PosColors.Slate100,
                        modifier = Modifier
                            .weight(1f)
                            .height(50.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .clickable {
                                when (key) {
                                    "CLR" -> onClear()
                                    "DEL" -> onBackspace()
                                    else -> onDigit(key)
                                }
                            }
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            if (key == "DEL") {
                                Icon(Icons.Rounded.Backspace, contentDescription = "Backspace", modifier = Modifier.size(20.dp))
                            } else {
                                Text(key, fontWeight = FontWeight.Bold, fontSize = if (key == "CLR") 12.sp else 18.sp)
                            }
                        }
                    }
                }
            }
        }
    }
}
