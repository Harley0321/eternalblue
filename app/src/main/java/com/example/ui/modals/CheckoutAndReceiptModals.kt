package com.example.ui.modals

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.domain.PaymentQr
import com.example.domain.PosMath
import com.example.hardware.AndroidDeviceBridge
import com.example.hardware.EscPosPrinter
import com.example.ui.components.QrBitmapCard
import com.example.ui.theme.EmeraldDark
import com.example.ui.theme.EmeraldPrimary
import com.example.ui.theme.IndigoAccent
import com.example.ui.theme.RoseDanger
import com.example.ui.theme.SlateBorder
import com.example.ui.theme.SlateMuted
import com.example.viewmodel.PosUiState
import com.example.viewmodel.PosViewModel
import java.time.LocalDate

@Composable
fun CheckoutModal(state: PosUiState, vm: PosViewModel) {
    if (!state.checkoutOpen) return
    val totals = state.cartTotals

    var method by remember { mutableStateOf("Cash") }
    var tenderedStr by remember(totals.grandTotal) { mutableStateOf(totals.grandTotal.toString()) }
    var refNo by remember { mutableStateOf("") }
    var splitCashStr by remember(totals.grandTotal) { mutableStateOf((totals.grandTotal / 2.0).toString()) }
    var selectedSukiIdx by remember { mutableStateOf(0) }
    var dueDate by remember { mutableStateOf(LocalDate.now().plusDays(7).toString()) }

    val selectedSuki = state.sukiCustomers.getOrNull(selectedSukiIdx)
    val tendered = tenderedStr.toDoubleOrNull() ?: 0.0
    val change = (tendered - totals.grandTotal).coerceAtLeast(0.0)
    val splitCashParsed = splitCashStr.toDoubleOrNull()
    val splitValid = splitCashParsed != null && splitCashParsed.isFinite() &&
        splitCashParsed >= 0.0 && splitCashParsed <= totals.grandTotal + 0.001
    val cashValid = tendered.isFinite() && tendered + 0.001 >= totals.grandTotal
    val resolvedQr = remember(state.settings, totals.grandTotal) {
        PaymentQr.resolveCheckoutQr(state.settings, totals.grandTotal)
    }

    AlertDialog(
        onDismissRequest = vm::closeCheckout,
        title = { Text("Checkout • ${PosMath.formatPeso(totals.grandTotal)}", fontWeight = FontWeight.ExtraBold) },
        text = {
            Column(
                verticalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.verticalScroll(rememberScrollState())
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) {
                    listOf("Cash", "GCash", "Card", "Split", "Utang").forEach { m ->
                        FilterChip(selected = method == m, onClick = { method = m }, label = { Text(m, fontSize = 12.sp) })
                    }
                }

                when (method) {
                    "Cash" -> {
                        OutlinedTextField(
                            value = tenderedStr,
                            onValueChange = { tenderedStr = it },
                            label = { Text("Cash Tendered (₱)") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) {
                            listOf(totals.grandTotal to "Exact", 100.0 to "₱100", 500.0 to "₱500", 1000.0 to "₱1,000").forEach { (amt, lbl) ->
                                OutlinedButton(onClick = { tenderedStr = amt.toString() }) { Text(lbl, fontSize = 11.sp) }
                            }
                        }
                        Surface(color = Color(0xFFECFDF5), shape = RoundedCornerShape(10.dp), modifier = Modifier.fillMaxWidth()) {
                            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.padding(12.dp)) {
                                Text("Change", fontWeight = FontWeight.Bold, color = EmeraldDark)
                                Text(PosMath.formatPeso(change), fontWeight = FontWeight.ExtraBold, fontFamily = FontFamily.Monospace, color = EmeraldDark)
                            }
                        }
                        if (!cashValid) {
                            Text("Cash tendered must be at least ${PosMath.formatPeso(totals.grandTotal)}", color = RoseDanger, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                    "GCash" -> {
                        QrBitmapCard(qr = resolvedQr)
                        OutlinedTextField(
                            value = refNo,
                            onValueChange = { refNo = it },
                            label = { Text("GCash / QR Ph Reference #") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                    "Card" -> {
                        OutlinedTextField(
                            value = refNo,
                            onValueChange = { refNo = it },
                            label = { Text("Terminal Approval / Reference #") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                    "Split" -> {
                        val sCash = (splitCashParsed ?: 0.0).coerceIn(0.0, totals.grandTotal)
                        val sDig = (totals.grandTotal - sCash).coerceAtLeast(0.0)
                        OutlinedTextField(
                            value = splitCashStr,
                            onValueChange = { splitCashStr = it },
                            label = { Text("Cash Portion (₱)") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            singleLine = true,
                            isError = !splitValid,
                            modifier = Modifier.fillMaxWidth()
                        )
                        if (!splitValid) {
                            Text("Cash portion must be between ₱0.00 and ${PosMath.formatPeso(totals.grandTotal)}", color = RoseDanger, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                        }
                        Text("Remaining Digital (GCash): ${PosMath.formatPeso(sDig)}", fontWeight = FontWeight.Bold, color = IndigoAccent, fontSize = 13.sp)
                        OutlinedTextField(
                            value = refNo,
                            onValueChange = { refNo = it },
                            label = { Text("Digital Ref #") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                    "Utang" -> {
                        if (state.sukiCustomers.isEmpty()) {
                            Text("No Suki customers yet. Add one under Ops & Suki.", color = RoseDanger, fontSize = 12.sp)
                        } else {
                            Text("Select Suki Customer:", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) {
                                state.sukiCustomers.forEachIndexed { idx, c ->
                                    FilterChip(
                                        selected = selectedSukiIdx == idx,
                                        onClick = { selectedSukiIdx = idx },
                                        label = { Text("${c.name} (${PosMath.formatPeso(c.balance)})", fontSize = 11.sp) }
                                    )
                                }
                            }
                            OutlinedTextField(
                                value = dueDate,
                                onValueChange = { dueDate = it },
                                label = { Text("Due Date (YYYY-MM-DD)") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth()
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            val canConfirm = when (method) {
                "Cash" -> cashValid
                "Split" -> splitValid
                "Utang" -> selectedSuki != null
                else -> true
            }
            Button(
                onClick = {
                    val sCash = (splitCashParsed ?: 0.0).coerceIn(0.0, totals.grandTotal)
                    val sDig = (totals.grandTotal - sCash).coerceAtLeast(0.0)
                    vm.completeCheckout(
                        paymentMethod = method,
                        tendered = tendered,
                        refNo = refNo,
                        splitCash = sCash,
                        splitDigital = sDig,
                        customerId = if (method == "Utang") selectedSuki?.id else null,
                        utangDueDate = dueDate
                    )
                },
                enabled = canConfirm,
                colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary)
            ) {
                Text("Complete Sale", fontWeight = FontWeight.ExtraBold)
            }
        },
        dismissButton = {
            TextButton(onClick = vm::closeCheckout) { Text("Cancel") }
        }
    )
}

@Composable
fun ReceiptModal(state: PosUiState, vm: PosViewModel) {
    val sale = state.receiptModalSale ?: return
    val ctx = LocalContext.current
    val receiptText = remember(sale, state.settings) { EscPosPrinter.formatReceiptText(sale, state.settings) }

    AlertDialog(
        onDismissRequest = vm::closeReceipt,
        title = {
            Row(horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Text("Receipt ${sale.receiptNo}", fontWeight = FontWeight.ExtraBold)
                if (sale.voided == true) {
                    Surface(color = Color(0xFFFFF1F2), shape = RoundedCornerShape(6.dp)) {
                        Text("VOIDED", color = RoseDanger, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp))
                    }
                }
            }
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.verticalScroll(rememberScrollState())) {
                Surface(color = Color(0xFFF8FAFC), shape = RoundedCornerShape(10.dp), border = BorderStroke(1.dp, SlateBorder)) {
                    Text(receiptText, fontFamily = FontFamily.Monospace, fontSize = 11.sp, modifier = Modifier.padding(10.dp))
                }
                HorizontalDivider(color = SlateBorder)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    OutlinedButton(
                        onClick = {
                            AndroidDeviceBridge.copyText(ctx, sale.receiptNo, receiptText)
                            vm.toast("Receipt copied to clipboard")
                        },
                        modifier = Modifier.weight(1f)
                    ) { Text("Copy Text", fontSize = 12.sp) }
                    OutlinedButton(
                        onClick = { AndroidDeviceBridge.shareTextFile(ctx, "${sale.receiptNo}.txt", receiptText) },
                        modifier = Modifier.weight(1f)
                    ) { Text("Share / Print", fontSize = 12.sp) }
                }
                if (sale.voided != true) {
                    TextButton(
                        onClick = { vm.requestVoidSale(sale) },
                        modifier = Modifier.align(Alignment.End)
                    ) {
                        Text("Void Receipt & Restore Stock", color = RoseDanger, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = vm::closeReceipt, colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary)) {
                Text("Done")
            }
        }
    )
}
