package com.example.ui.modals

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Backspace
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.example.domain.PosMath
import com.example.security.SecurityManager
import com.example.ui.components.GlowingEmeraldStoreName
import com.example.ui.theme.AmberWarn
import com.example.ui.theme.EmeraldDark
import com.example.ui.theme.EmeraldDeepCanvas
import com.example.ui.theme.EmeraldGlowCore
import com.example.ui.theme.EmeraldPrimary
import com.example.ui.theme.RoseDanger
import com.example.ui.theme.SlateBorder
import com.example.ui.theme.SlateMuted
import com.example.ui.theme.SlateText
import com.example.ui.theme.SlateTopBar
import com.example.viewmodel.PosUiState
import com.example.viewmodel.PosViewModel
import kotlinx.coroutines.delay

@Composable
fun SmallModalsHost(state: PosUiState, vm: PosViewModel) {
    if (state.holdCartModalOpen) {
        var label by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { vm.setHoldCartOpen(false) },
            title = { Text("Park / Hold Order", fontWeight = FontWeight.Bold) },
            text = {
                OutlinedTextField(
                    value = label,
                    onValueChange = { label = it },
                    label = { Text("Customer / Table Label") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            },
            confirmButton = {
                Button(onClick = { vm.holdCurrentCart(label) }, colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary)) {
                    Text("Park Order")
                }
            },
            dismissButton = { TextButton(onClick = { vm.setHoldCartOpen(false) }) { Text("Cancel") } }
        )
    }

    if (state.heldOrdersModalOpen) {
        AlertDialog(
            onDismissRequest = { vm.setHeldOrdersOpen(false) },
            title = { Text("Parked Orders (${state.heldOrders.size})", fontWeight = FontWeight.Bold) },
            text = {
                if (state.heldOrders.isEmpty()) {
                    Text("No parked orders.", color = SlateMuted)
                } else {
                    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.height(260.dp)) {
                        items(state.heldOrders, key = { it.id }) { h ->
                            Surface(shape = RoundedCornerShape(10.dp), border = BorderStroke(1.dp, SlateBorder)) {
                                Row(horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(10.dp)) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(h.label ?: h.id, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                        Text("${h.items.size} items • ${PosMath.formatPeso(h.total)}", fontSize = 11.sp, color = EmeraldDark, fontFamily = FontFamily.Monospace)
                                    }
                                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                        Button(onClick = { vm.recallHeldOrder(h) }) { Text("Recall", fontSize = 11.sp) }
                                        TextButton(onClick = { vm.deleteHeldOrder(h.id) }) { Text("×", color = RoseDanger) }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { vm.setHeldOrdersOpen(false) }) { Text("Close") } }
        )
    }

    state.voidSaleTarget?.let { target ->
        var reason by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = vm::closeVoidSale,
            title = { Text("Void Receipt ${target.receiptNo}?", fontWeight = FontWeight.Bold, color = RoseDanger) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Total ${PosMath.formatPeso(target.grandTotal)} will be voided and stock returned to inventory.", fontSize = 12.sp)
                    OutlinedTextField(value = reason, onValueChange = { reason = it }, label = { Text("Void Reason") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                }
            },
            confirmButton = {
                Button(onClick = { vm.confirmVoidSale(reason) }, colors = ButtonDefaults.buttonColors(containerColor = RoseDanger)) {
                    Text("Confirm Void")
                }
            },
            dismissButton = { TextButton(onClick = vm::closeVoidSale) { Text("Cancel") } }
        )
    }

    // Instant tactile PIN modal (no IME keyboard lag or predictive-text snooping)
    state.pinModalMode?.let { mode ->
        var pin by remember(mode) { mutableStateOf("") }
        Dialog(
            onDismissRequest = vm::closePinModal,
            properties = DialogProperties(usePlatformDefaultWidth = false)
        ) {
            Surface(
                shape = RoundedCornerShape(22.dp),
                color = Color.White,
                tonalElevation = 8.dp,
                modifier = Modifier.padding(20.dp).widthIn(max = 360.dp).fillMaxWidth()
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(20.dp)) {
                    Row(horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Icon(Icons.Filled.Lock, contentDescription = null, tint = EmeraldPrimary, modifier = Modifier.size(20.dp))
                            Text(
                                when (mode) {
                                    "setPin" -> "Set Manager PIN"
                                    "unlockVoid" -> "Authorize Void (PIN)"
                                    else -> "Manager PIN"
                                },
                                fontWeight = FontWeight.ExtraBold,
                                fontSize = 17.sp,
                                color = SlateText
                            )
                        }
                        TextButton(onClick = vm::closePinModal) { Text("Cancel") }
                    }
                    Spacer(Modifier.height(6.dp))
                    SecurePinPad(
                        pin = pin,
                        isSettingPin = mode == "setPin",
                        busy = state.pinBusy,
                        error = state.pinError,
                        lockoutUntilMs = state.pinLockoutUntilMs,
                        onDigit = { d ->
                            if (pin.length < 8) {
                                pin += d
                                vm.clearPinError()
                            }
                        },
                        onBackspace = {
                            if (pin.isNotEmpty()) {
                                pin = pin.dropLast(1)
                                vm.clearPinError()
                            }
                        },
                        onClear = {
                            pin = ""
                            vm.clearPinError()
                        },
                        onSubmit = {
                            val entered = pin
                            pin = ""
                            if (mode == "setPin") vm.setAdminPin(entered)
                            else vm.verifyAndUnlock(entered, mode)
                        }
                    )
                }
            }
        }
    }

    state.scannedProductPromptCode?.let { unknownCode ->
        AlertDialog(
            onDismissRequest = vm::dismissScannedPrompt,
            title = { Text("Unknown Barcode", fontWeight = FontWeight.Bold) },
            text = { Text("Barcode \"$unknownCode\" was not found in your catalog. Create a new product with this code?") },
            confirmButton = {
                Button(
                    onClick = {
                        vm.dismissScannedPrompt()
                        vm.openProductModal(null, prefillBarcode = unknownCode)
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary)
                ) { Text("Add New Product") }
            },
            dismissButton = { OutlinedButton(onClick = vm::dismissScannedPrompt) { Text("Dismiss") } }
        )
    }

    if (state.terminalLocked) {
        var pin by remember { mutableStateOf("") }
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .fillMaxSize()
                .background(SlateTopBar.copy(alpha = 0.97f))
                .clickable(enabled = true, onClick = {}) // swallow clicks behind overlay immediately
                .padding(20.dp)
        ) {
            Surface(
                shape = RoundedCornerShape(24.dp),
                color = Color.White,
                modifier = Modifier.widthIn(max = 360.dp).fillMaxWidth()
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(20.dp)) {
                    Box(
                        contentAlignment = Alignment.Center,
                        modifier = Modifier.size(44.dp).clip(CircleShape).background(Color(0xFFECFDF5))
                    ) {
                        Icon(Icons.Filled.Lock, contentDescription = null, tint = EmeraldPrimary)
                    }
                    Spacer(Modifier.height(10.dp))
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = EmeraldDeepCanvas,
                        border = BorderStroke(1.dp, EmeraldGlowCore.copy(alpha = 0.45f))
                    ) {
                        Box(modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp)) {
                            GlowingEmeraldStoreName(
                                text = state.settings.storeName,
                                fontSize = 17.sp
                            )
                        }
                    }
                    Spacer(Modifier.height(6.dp))
                    Text("Terminal Locked", fontWeight = FontWeight.ExtraBold, fontSize = 15.sp, color = SlateText)
                    Text("Tap your 4–8 digit Manager PIN", fontSize = 12.sp, color = SlateMuted)
                    Spacer(Modifier.height(12.dp))
                    SecurePinPad(
                        pin = pin,
                        isSettingPin = false,
                        busy = state.pinBusy,
                        error = state.pinError,
                        lockoutUntilMs = state.pinLockoutUntilMs,
                        onDigit = { d ->
                            if (pin.length < 8) {
                                pin += d
                                vm.clearPinError()
                            }
                        },
                        onBackspace = {
                            if (pin.isNotEmpty()) {
                                pin = pin.dropLast(1)
                                vm.clearPinError()
                            }
                        },
                        onClear = {
                            pin = ""
                            vm.clearPinError()
                        },
                        onSubmit = {
                            val entered = pin
                            pin = ""
                            vm.verifyAndUnlock(entered, "unlockTerminal")
                        }
                    )
                }
            }
        }
    }
}

@Composable
private fun SecurePinPad(
    pin: String,
    isSettingPin: Boolean,
    busy: Boolean,
    error: String?,
    lockoutUntilMs: Long,
    onDigit: (String) -> Unit,
    onBackspace: () -> Unit,
    onClear: () -> Unit,
    onSubmit: () -> Unit
) {
    var nowMs by remember(lockoutUntilMs) { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(lockoutUntilMs) {
        while (System.currentTimeMillis() < lockoutUntilMs) {
            nowMs = System.currentTimeMillis()
            delay(500)
        }
        nowMs = System.currentTimeMillis()
    }
    val remainingMs = (lockoutUntilMs - nowMs).coerceAtLeast(0L)
    val lockoutSecs = if (remainingMs > 0L) (remainingMs + 999L) / 1000L else 0L
    val lockedOut = lockoutSecs > 0L

    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
        // Masked PIN Dots (zero character flash)
        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .background(Color(0xFFF8FAFC), RoundedCornerShape(14.dp))
                .border(1.dp, if (error != null) RoseDanger else SlateBorder, RoundedCornerShape(14.dp))
                .padding(vertical = 14.dp, horizontal = 12.dp)
        ) {
            Row(
                horizontalArrangement = Arrangement.Center,
                modifier = Modifier.weight(1f)
            ) {
                val slots = maxOf(4, pin.length).coerceAtMost(8)
                for (i in 0 until slots) {
                    val filled = i < pin.length
                    Box(
                        modifier = Modifier
                            .padding(horizontal = 5.dp)
                            .size(13.dp)
                            .clip(CircleShape)
                            .background(if (filled) EmeraldPrimary else Color(0xFFCBD5E1))
                    )
                }
            }
            if (pin.isNotEmpty() && !busy) {
                Text(
                    "Clear",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = SlateMuted,
                    modifier = Modifier.clickable { onClear() }.padding(horizontal = 4.dp)
                )
            }
        }

        Spacer(Modifier.height(6.dp))

        if (lockedOut) {
            Text(
                "Locked for ${lockoutSecs}s after repeated wrong PINs",
                color = RoseDanger,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center
            )
        } else if (!error.isNullOrBlank()) {
            Text(error, color = RoseDanger, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
        } else if (isSettingPin && pin.length >= 4 && SecurityManager.isPinWeak(pin)) {
            Text("Weak PIN pattern — consider a less common code", color = AmberWarn, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
        } else {
            Text(
                if (isSettingPin) "Enter 4–8 digits (${pin.length}/8)" else "Screen capture blocked during PIN entry",
                color = SlateMuted,
                fontSize = 11.sp
            )
        }

        Spacer(Modifier.height(10.dp))

        val rows = listOf(
            listOf("1", "2", "3"),
            listOf("4", "5", "6"),
            listOf("7", "8", "9")
        )
        rows.forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                row.forEach { digit ->
                    PinKeyButton(
                        label = digit,
                        enabled = !busy && !lockedOut && pin.length < 8,
                        modifier = Modifier.weight(1f),
                        onClick = { onDigit(digit) }
                    )
                }
            }
        }

        // Bottom row: Backspace, 0, Unlock/Confirm
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
            OutlinedButton(
                onClick = onBackspace,
                enabled = !busy && pin.isNotEmpty(),
                shape = RoundedCornerShape(14.dp),
                contentPadding = PaddingValues(0.dp),
                modifier = Modifier.weight(1f).height(52.dp)
            ) {
                Icon(Icons.AutoMirrored.Filled.Backspace, contentDescription = "Backspace", tint = SlateText, modifier = Modifier.size(20.dp))
            }
            PinKeyButton(
                label = "0",
                enabled = !busy && !lockedOut && pin.length < 8,
                modifier = Modifier.weight(1f),
                onClick = { onDigit("0") }
            )
            Button(
                onClick = onSubmit,
                enabled = !busy && !lockedOut && pin.length >= 4,
                colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary),
                shape = RoundedCornerShape(14.dp),
                contentPadding = PaddingValues(0.dp),
                modifier = Modifier.weight(1f).height(52.dp)
            ) {
                if (busy) {
                    CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
                } else {
                    Icon(Icons.Filled.Check, contentDescription = "Submit PIN", modifier = Modifier.size(22.dp))
                }
            }
        }
    }
}

@Composable
private fun PinKeyButton(
    label: String,
    enabled: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = if (enabled) Color(0xFFF1F5F9) else Color(0xFFF8FAFC),
        border = BorderStroke(1.dp, SlateBorder),
        modifier = modifier
            .height(52.dp)
            .clip(RoundedCornerShape(14.dp))
            .clickable(enabled = enabled) { onClick() }
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(
                label,
                fontSize = 20.sp,
                fontWeight = FontWeight.ExtraBold,
                fontFamily = FontFamily.Monospace,
                color = if (enabled) SlateText else SlateMuted
            )
        }
    }
}
