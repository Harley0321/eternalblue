package com.example.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
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
import com.example.domain.OpsMath
import com.example.domain.PosMath
import com.example.hardware.AndroidDeviceBridge
import com.example.model.SukiCustomer
import com.example.ui.components.KpiCard
import com.example.ui.theme.AmberWarn
import com.example.ui.theme.EmeraldDark
import com.example.ui.theme.EmeraldPrimary
import com.example.ui.theme.IndigoAccent
import com.example.ui.theme.RoseDanger
import com.example.ui.theme.SlateBorder
import com.example.ui.theme.SlateMuted
import com.example.ui.theme.SlateSurface
import com.example.viewmodel.PosUiState
import com.example.viewmodel.PosViewModel

@Composable
fun UtangSubTab(state: PosUiState, vm: PosViewModel) {
    val ctx = LocalContext.current
    var name by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var limit by remember { mutableStateOf("2000") }
    var payingCustomer by remember { mutableStateOf<SukiCustomer?>(null) }
    var payAmount by remember { mutableStateOf("") }

    val totalReceivable = remember(state.sukiCustomers) {
        PosMath.fromCents(state.sukiCustomers.sumOf { PosMath.toCents(it.balance) })
    }
    val overdueCount = remember(state.sukiCustomers) {
        state.sukiCustomers.count { OpsMath.isCustomerOverdue(it) }
    }

    LazyColumn(
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxSize().background(SlateSurface)
    ) {
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                KpiCard("Total Utang", PosMath.formatPeso(totalReceivable), "${state.sukiCustomers.count { it.balance > 0 }} active", valueColor = RoseDanger, modifier = Modifier.weight(1f))
                KpiCard("Overdue", overdueCount.toString(), "Due date passed", valueColor = AmberWarn, modifier = Modifier.weight(1f))
            }
        }
        item {
            Card(shape = RoundedCornerShape(14.dp), colors = CardDefaults.cardColors(containerColor = Color.White), border = BorderStroke(1.dp, SlateBorder)) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(12.dp)) {
                    Text("Add New Suki Account", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Customer Name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(value = phone, onValueChange = { phone = it }, label = { Text("Mobile") }, singleLine = true, modifier = Modifier.weight(1f))
                        OutlinedTextField(value = limit, onValueChange = { limit = it }, label = { Text("Credit Limit (₱)") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true, modifier = Modifier.weight(1f))
                    }
                    Button(
                        onClick = {
                            vm.addSukiCustomer(name, phone, "", limit.toDoubleOrNull() ?: 2000.0)
                            name = ""; phone = ""
                        },
                        enabled = name.isNotBlank(),
                        colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Save Suki Account", fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
        items(state.sukiCustomers, key = { it.id }) { c ->
            Card(shape = RoundedCornerShape(14.dp), colors = CardDefaults.cardColors(containerColor = Color.White), border = BorderStroke(1.dp, SlateBorder)) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Row(horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(c.name, fontWeight = FontWeight.ExtraBold, fontSize = 15.sp)
                            Text("${c.phone ?: "No phone"} • ${c.points} Suki pts • Limit ${PosMath.formatPeso(c.creditLimit)}", fontSize = 11.sp, color = SlateMuted)
                        }
                        Text(
                            PosMath.formatPeso(c.balance),
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 16.sp,
                            color = if (c.balance > 0) RoseDanger else EmeraldDark
                        )
                    }
                    if (c.balance > 0) {
                        Spacer(Modifier.height(8.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(
                                onClick = { payingCustomer = c; payAmount = c.balance.toString() },
                                colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary),
                                modifier = Modifier.weight(1f)
                            ) {
                                Text("Record Payment", fontSize = 12.sp)
                            }
                            OutlinedButton(
                                onClick = {
                                    AndroidDeviceBridge.copyText(ctx, "Utang Statement", OpsMath.buildUtangSmsStatement(c, state.settings.storeName))
                                    vm.toast("Copied SMS reminder for ${c.name}")
                                },
                                modifier = Modifier.weight(1f)
                            ) {
                                Text("Copy SMS Reminder", fontSize = 12.sp)
                            }
                        }
                    }
                    if (payingCustomer?.id == c.id) {
                        Spacer(Modifier.height(8.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                            OutlinedTextField(
                                value = payAmount,
                                onValueChange = { payAmount = it },
                                label = { Text("Bayad Amount (₱)") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                singleLine = true,
                                modifier = Modifier.weight(1f)
                            )
                            Button(onClick = {
                                vm.recordUtangPayment(c.id, payAmount.toDoubleOrNull() ?: 0.0, "Cash", "Bayad Utang")
                                payingCustomer = null
                            }) { Text("Save") }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun RepackSubTab(state: PosUiState, vm: PosViewModel) {
    var unpackQty by remember { mutableStateOf("1") }
    var ruleName by remember { mutableStateOf("") }
    var yieldStr by remember { mutableStateOf("25") }
    var masterIdx by remember { mutableStateOf(0) }
    var targetIdx by remember { mutableStateOf(1.coerceAtMost((state.products.size - 1).coerceAtLeast(0))) }

    LazyColumn(
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxSize().background(SlateSurface)
    ) {
        item {
            Text("Active Bulk → Tingi Repack Rules", fontWeight = FontWeight.ExtraBold, fontSize = 14.sp)
        }
        items(state.repackRules, key = { it.id }) { r ->
            val master = state.productMap[r.masterProductId]
            val target = state.productMap[r.targetProductId]
            Card(shape = RoundedCornerShape(14.dp), colors = CardDefaults.cardColors(containerColor = Color.White), border = BorderStroke(1.dp, SlateBorder)) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(12.dp)) {
                    Text(r.name, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    Text(
                        "1 ${master?.unit ?: "bulk"} ${master?.name ?: r.masterProductId} → ${PosMath.formatQty(r.yieldQty, target?.unit ?: "pcs")} ${target?.name ?: r.targetProductId}",
                        fontSize = 12.sp,
                        color = SlateMuted
                    )
                    Text(
                        "Stock: ${PosMath.formatQty(master?.stock ?: 0.0)} bulk | ${PosMath.formatQty(target?.stock ?: 0.0)} retail",
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace,
                        color = IndigoAccent
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        OutlinedTextField(
                            value = unpackQty,
                            onValueChange = { unpackQty = it },
                            label = { Text("Qty to Unpack") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )
                        Button(
                            onClick = { vm.runRepackRule(r, unpackQty.toDoubleOrNull() ?: 1.0) },
                            colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary)
                        ) {
                            Text("Convert Now", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
        if (state.products.size >= 2) {
            val safeMasterIdx = masterIdx.coerceIn(0, state.products.lastIndex)
            val safeTargetIdx = targetIdx.coerceIn(0, state.products.lastIndex)
            item {
                Card(shape = RoundedCornerShape(14.dp), colors = CardDefaults.cardColors(containerColor = Color.White), border = BorderStroke(1.dp, SlateBorder)) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(12.dp)) {
                        Text("Create New Repack Rule", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        OutlinedTextField(value = ruleName, onValueChange = { ruleName = it }, label = { Text("Rule Label") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                            OutlinedButton(onClick = { masterIdx = (safeMasterIdx + 1) % state.products.size }, modifier = Modifier.weight(1f)) {
                                Text("Bulk: ${state.products[safeMasterIdx].name.take(14)}", fontSize = 11.sp)
                            }
                            OutlinedButton(onClick = { targetIdx = (safeTargetIdx + 1) % state.products.size }, modifier = Modifier.weight(1f)) {
                                Text("Tingi: ${state.products[safeTargetIdx].name.take(14)}", fontSize = 11.sp)
                            }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                            OutlinedTextField(
                                value = yieldStr,
                                onValueChange = { yieldStr = it },
                                label = { Text("Yield Qty per Bulk") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                singleLine = true,
                                modifier = Modifier.weight(1f)
                            )
                            Button(onClick = {
                                vm.addRepackRule(ruleName, state.products[safeMasterIdx].id, state.products[safeTargetIdx].id, yieldStr.toDoubleOrNull() ?: 10.0)
                                ruleName = ""
                            }) { Text("Add Rule") }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ShiftSubTab(state: PosUiState, vm: PosViewModel) {
    val startToday = PosMath.startOfDayMs()
    val endToday = startToday + PosMath.DAY_MS
    val ledger = remember(state.sales, state.drawerEvents, state.utangTransactions, state.digitalServices) {
        OpsMath.summarizeShiftDrawer(state.sales, state.drawerEvents, state.utangTransactions, state.digitalServices, startToday, endToday)
    }
    var evType by remember { mutableStateOf("expense") }
    var evAmt by remember { mutableStateOf("") }
    var evNote by remember { mutableStateOf("") }

    LazyColumn(
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxSize().background(SlateSurface)
    ) {
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                KpiCard("Expected Drawer", PosMath.formatPeso(ledger.expectedDrawerCash), valueColor = EmeraldDark, modifier = Modifier.weight(1f))
                KpiCard("Expenses / Gastos", PosMath.formatPeso(ledger.expenses), valueColor = RoseDanger, modifier = Modifier.weight(1f))
            }
        }
        item {
            Card(shape = RoundedCornerShape(14.dp), colors = CardDefaults.cardColors(containerColor = Color.White), border = BorderStroke(1.dp, SlateBorder)) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(12.dp)) {
                    Text("Switch Active Cashier Shift", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        state.cashiers.forEach { c ->
                            FilterChip(
                                selected = state.activeShift?.cashierId == c.id,
                                onClick = { vm.startShift(c, 1500.0) },
                                label = { Text(c.name, fontSize = 11.sp) }
                            )
                        }
                    }
                    HorizontalDivider(color = SlateBorder)
                    Text("Log Drawer Event (Float / Gastos / Drop)", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf("expense" to "Gastos", "float" to "Float", "drop" to "Vault Drop", "topup" to "Top-up").forEach { (id, lbl) ->
                            FilterChip(selected = evType == id, onClick = { evType = id }, label = { Text(lbl, fontSize = 11.sp) })
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(value = evAmt, onValueChange = { evAmt = it }, label = { Text("Amount (₱)") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true, modifier = Modifier.weight(1f))
                        OutlinedTextField(value = evNote, onValueChange = { evNote = it }, label = { Text("Note") }, singleLine = true, modifier = Modifier.weight(1f))
                    }
                    Button(
                        onClick = {
                            vm.recordDrawerEvent(evType, evType.uppercase(), evAmt.toDoubleOrNull() ?: 0.0, evNote)
                            evAmt = ""; evNote = ""
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary),
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("Record Drawer Entry", fontWeight = FontWeight.Bold) }
                }
            }
        }
        items(state.drawerEvents.take(20), key = { it.id }) { ev ->
            Surface(shape = RoundedCornerShape(10.dp), color = Color.White, border = BorderStroke(1.dp, SlateBorder)) {
                Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth().padding(12.dp)) {
                    Column {
                        Text("${ev.category}${ev.note?.let { " — $it" } ?: ""}", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        Text(PosMath.formatDateTime(ev.dateIso), fontSize = 11.sp, color = SlateMuted)
                    }
                    Text(PosMath.formatPeso(ev.amount), fontFamily = FontFamily.Monospace, fontWeight = FontWeight.ExtraBold)
                }
            }
        }
    }
}

@Composable
fun ServicesSubTab(state: PosUiState, vm: PosViewModel) {
    var kind by remember { mutableStateOf("GCASH_IN") }
    var amount by remember { mutableStateOf("") }
    var fee by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var ref by remember { mutableStateOf("") }

    val totalFees = remember(state.digitalServices) { PosMath.fromCents(state.digitalServices.sumOf { PosMath.toCents(it.fee) }) }

    LazyColumn(
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxSize().background(SlateSurface)
    ) {
        item {
            KpiCard("E-Load & Cash-In/Out Fee Income", PosMath.formatPeso(totalFees), "${state.digitalServices.size} logged transactions", valueColor = IndigoAccent, modifier = Modifier.fillMaxWidth())
        }
        item {
            Card(shape = RoundedCornerShape(14.dp), colors = CardDefaults.cardColors(containerColor = Color.White), border = BorderStroke(1.dp, SlateBorder)) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(12.dp)) {
                    Text("Log GCash / Maya / E-Load / Bills Pay", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf("GCASH_IN" to "GCash In", "GCASH_OUT" to "GCash Out", "ELOAD" to "E-Load", "BILLS_PAY" to "Bills").forEach { (id, lbl) ->
                            FilterChip(selected = kind == id, onClick = { kind = id }, label = { Text(lbl, fontSize = 11.sp) })
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = amount,
                            onValueChange = {
                                amount = it
                                val num = it.toDoubleOrNull() ?: 0.0
                                if (num > 0) fee = OpsMath.suggestServiceFee(kind, num).toString()
                            },
                            label = { Text("Principal (₱)") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )
                        OutlinedTextField(
                            value = fee,
                            onValueChange = { fee = it },
                            label = { Text("Tubó / Fee (₱)") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(value = phone, onValueChange = { phone = it }, label = { Text("Mobile #") }, singleLine = true, modifier = Modifier.weight(1f))
                        OutlinedTextField(value = ref, onValueChange = { ref = it }, label = { Text("Ref #") }, singleLine = true, modifier = Modifier.weight(1f))
                    }
                    Button(
                        onClick = {
                            vm.recordDigitalService(kind, amount.toDoubleOrNull() ?: 0.0, fee.toDoubleOrNull() ?: 0.0, phone, ref)
                            amount = ""; fee = ""; phone = ""; ref = ""
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = IndigoAccent),
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("Log Transaction", fontWeight = FontWeight.Bold) }
                }
            }
        }
        items(state.digitalServices.take(20), key = { it.id }) { d ->
            Surface(shape = RoundedCornerShape(10.dp), color = Color.White, border = BorderStroke(1.dp, SlateBorder)) {
                Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth().padding(12.dp)) {
                    Column {
                        Text("${d.kind} ${d.customerPhone ?: ""}", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        Text(PosMath.formatDateTime(d.dateIso), fontSize = 11.sp, color = SlateMuted)
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text(PosMath.formatPeso(d.amount), fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
                        Text("+${PosMath.formatPeso(d.fee)} fee", fontSize = 11.sp, color = EmeraldDark, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
fun PrintingSubTab(state: PosUiState, vm: PosViewModel) {
    val ctx = LocalContext.current
    Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxSize().background(SlateSurface).padding(12.dp)) {
        Card(shape = RoundedCornerShape(14.dp), colors = CardDefaults.cardColors(containerColor = Color.White), border = BorderStroke(1.dp, SlateBorder)) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(14.dp)) {
                Text("Receipt & Barcode Label Utilities", fontWeight = FontWeight.ExtraBold, fontSize = 15.sp)
                Text("Paper Width: ${state.settings.receiptWidth} • Thermal ESC/POS plain text & CSV shelf label export ready.", fontSize = 12.sp, color = SlateMuted)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        selected = state.settings.receiptWidth == "80mm",
                        onClick = { vm.updateSettings { it.copy(receiptWidth = "80mm") } },
                        label = { Text("80mm Thermal") }
                    )
                    FilterChip(
                        selected = state.settings.receiptWidth == "58mm",
                        onClick = { vm.updateSettings { it.copy(receiptWidth = "58mm") } },
                        label = { Text("58mm Thermal") }
                    )
                }
                Button(
                    onClick = {
                        val csv = buildString {
                            appendLine("Barcode,Name,Category,RetailPrice,WholesalePrice")
                            state.products.forEach {
                                appendLine("${safeCsvCell(it.barcode)},${safeCsvCell(it.name)},${safeCsvCell(it.category)},${it.retailPrice},${it.wholesalePrice}")
                            }
                        }
                        AndroidDeviceBridge.shareTextFile(ctx, "eternalblue_shelf_labels.csv", csv, "text/csv")
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary)
                ) {
                    Text("Export Shelf Price Labels CSV")
                }
            }
        }
    }
}

private fun safeCsvCell(raw: String): String {
    val clean = raw.replace("\r", " ").replace("\n", " ")
    val trimmed = clean.trimStart()
    val neutralized = if (trimmed.startsWith("=") || trimmed.startsWith("+") || trimmed.startsWith("-") || trimmed.startsWith("@")) {
        "'$clean"
    } else clean
    return "\"${neutralized.replace("\"", "\"\"")}\""
}
