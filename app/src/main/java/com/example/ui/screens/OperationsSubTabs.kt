package com.example.ui.screens

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Bluetooth
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Payments
import androidx.compose.material.icons.rounded.PersonAdd
import androidx.compose.material.icons.rounded.Print
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.domain.OpsMath
import com.example.domain.PosMath
import com.example.hardware.AndroidDeviceBridge
import com.example.hardware.EscPosPrinter
import com.example.hardware.PairedPrinterDevice
import com.example.model.DigitalServiceKind
import com.example.model.DrawerEventType
import com.example.model.SukiCustomer
import com.example.model.ToastType
import com.example.ui.components.BarcodeCanvas
import com.example.ui.theme.PosColors
import com.example.viewmodel.PosViewModel
import kotlinx.coroutines.launch

@Composable
fun UtangSukiTab(vm: PosViewModel) {
    val context = LocalContext.current
    val customers by vm.customers.collectAsStateWithLifecycle()
    val utangTxs by vm.utangTxs.collectAsStateWithLifecycle()
    val settings by vm.settings.collectAsStateWithLifecycle()

    val summary = remember(customers, utangTxs) { OpsMath.summarizeUtangLedger(customers, utangTxs) }
    var search by remember { mutableStateOf("") }
    var showAddCustomer by remember { mutableStateOf(false) }
    var bayadCustomer by remember { mutableStateOf<SukiCustomer?>(null) }
    var chargeCustomer by remember { mutableStateOf<SukiCustomer?>(null) }

    val filtered = remember(customers, search) {
        val q = search.trim().lowercase()
        if (q.isEmpty()) customers else customers.filter {
            it.name.lowercase().contains(q) || (it.phone ?: "").contains(q)
        }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                OpsKpiBox("Receivable", PosMath.formatPeso(summary.totalReceivable), "${summary.activeDebtors} active", PosColors.Rose700, Modifier.weight(1f))
                OpsKpiBox("Overdue", "${summary.overdueCount}", PosMath.formatPeso(summary.overdueAmount), PosColors.Amber700, Modifier.weight(1f))
                OpsKpiBox("Collected Today", PosMath.formatPeso(summary.collectedToday), "${summary.totalPoints} total pts", PosColors.Emerald700, Modifier.weight(1f))
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = search,
                    onValueChange = { search = it },
                    placeholder = { Text("Search Suki customer or phone...", fontSize = 13.sp) },
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.weight(1f)
                )
                Button(
                    onClick = { showAddCustomer = true },
                    colors = ButtonDefaults.buttonColors(containerColor = PosColors.Emerald600),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier
                        .heightIn(min = 48.dp)
                        .testTag("ops_add_suki_btn")
                ) {
                    Icon(Icons.Rounded.PersonAdd, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Add Suki")
                }
            }
        }
        items(filtered, key = { it.id }) { c ->
            val overdue = OpsMath.isCustomerOverdue(c)
            Surface(
                shape = RoundedCornerShape(14.dp),
                color = Color.White,
                border = BorderStroke(1.dp, if (overdue) PosColors.Rose600 else PosColors.Slate200)
            ) {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
                        Column(modifier = Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(c.name, style = MaterialTheme.typography.titleSmall)
                                if (overdue) {
                                    Surface(shape = RoundedCornerShape(6.dp), color = PosColors.Rose100) {
                                        Text("OVERDUE", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = PosColors.Rose700, modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp))
                                    }
                                }
                            }
                            Text(
                                "${c.phone ?: "No phone"} · Limit ${PosMath.formatPeso(c.creditLimit)} · ${c.points} pts",
                                style = MaterialTheme.typography.bodySmall,
                                color = PosColors.Slate500
                            )
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text(
                                PosMath.formatPeso(c.balance),
                                style = MaterialTheme.typography.titleMedium,
                                color = if (c.balance > 0) PosColors.Rose700 else PosColors.Emerald700
                            )
                            if (!c.dueDate.isNullOrBlank()) {
                                Text("Due ${c.dueDate}", fontSize = 10.sp, color = PosColors.Slate500)
                            }
                        }
                    }

                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Button(
                            onClick = { bayadCustomer = c },
                            enabled = c.balance > 0.0,
                            colors = ButtonDefaults.buttonColors(containerColor = PosColors.Emerald600),
                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(Icons.Rounded.Payments, contentDescription = null, modifier = Modifier.size(15.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Bayad", fontSize = 12.sp)
                        }
                        OutlinedButton(
                            onClick = { chargeCustomer = c },
                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("+ Charge", fontSize = 12.sp)
                        }
                        OutlinedButton(
                            onClick = {
                                val msg = OpsMath.buildUtangSmsStatement(c, settings.storeName)
                                AndroidDeviceBridge.copyToClipboard(context, "Utang Statement", msg)
                                vm.toast("Copied SMS reminder for ${c.name}")
                            },
                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                            shape = RoundedCornerShape(10.dp)
                        ) {
                            Icon(Icons.Rounded.ContentCopy, contentDescription = "Copy reminder", modifier = Modifier.size(15.dp))
                        }
                    }
                }
            }
        }

        if (utangTxs.isNotEmpty()) {
            item { Text("Recent Utang Transactions", style = MaterialTheme.typography.titleSmall, color = PosColors.Slate700) }
            items(utangTxs.take(15), key = { it.id }) { tx ->
                Surface(shape = RoundedCornerShape(12.dp), color = Color.White, border = BorderStroke(1.dp, PosColors.Slate200)) {
                    Row(modifier = Modifier.fillMaxWidth().padding(10.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("${tx.customerName} · ${tx.type.uppercase()}", style = MaterialTheme.typography.labelMedium)
                            Text(tx.note ?: "", style = MaterialTheme.typography.bodySmall, color = PosColors.Slate500)
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text(
                                (if (tx.type == "payment") "-" else "+") + PosMath.formatPeso(tx.amount),
                                fontWeight = FontWeight.Bold,
                                color = if (tx.type == "payment") PosColors.Emerald700 else PosColors.Rose700
                            )
                            Text("Bal ${PosMath.formatPeso(tx.balanceAfter)}", fontSize = 10.sp, color = PosColors.Slate500)
                        }
                    }
                }
            }
        }
    }

    if (showAddCustomer) {
        var name by remember { mutableStateOf("") }
        var phone by remember { mutableStateOf("") }
        var limit by remember { mutableStateOf("1000") }
        AlertDialog(
            onDismissRequest = { showAddCustomer = false },
            title = { Text("Add Suki Customer") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Full Name *") }, singleLine = true)
                    OutlinedTextField(value = phone, onValueChange = { phone = it }, label = { Text("Mobile Number") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone), singleLine = true)
                    OutlinedTextField(value = limit, onValueChange = { limit = it }, label = { Text("Credit Limit (₱)") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true)
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (name.isNotBlank()) {
                            vm.addCustomer(name, phone, null, limit.toDoubleOrNull() ?: 1000.0, null)
                            showAddCustomer = false
                        }
                    }
                ) { Text("Save Suki") }
            },
            dismissButton = { TextButton(onClick = { showAddCustomer = false }) { Text("Cancel") } }
        )
    }

    bayadCustomer?.let { cust ->
        var amt by remember(cust.id) { mutableStateOf(cust.balance.toString()) }
        var method by remember { mutableStateOf("Cash") }
        AlertDialog(
            onDismissRequest = { bayadCustomer = null },
            title = { Text("Record Bayad — ${cust.name}") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Current Balance: ${PosMath.formatPeso(cust.balance)}", style = MaterialTheme.typography.titleSmall, color = PosColors.Rose700)
                    OutlinedTextField(value = amt, onValueChange = { amt = it }, label = { Text("Payment Amount (₱)") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true)
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf("Cash", "GCash", "Card").forEach { m ->
                            FilterChip(selected = method == m, onClick = { method = m }, label = { Text(m) })
                        }
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val v = amt.toDoubleOrNull() ?: 0.0
                        vm.postUtangPayment(cust.id, v, method, null)
                        bayadCustomer = null
                    }
                ) { Text("Post Payment") }
            },
            dismissButton = { TextButton(onClick = { bayadCustomer = null }) { Text("Cancel") } }
        )
    }

    chargeCustomer?.let { cust ->
        var amt by remember { mutableStateOf("") }
        var due by remember { mutableStateOf(cust.dueDate ?: "") }
        var note by remember { mutableStateOf("") }
        var over by remember { mutableStateOf(false) }
        AlertDialog(
            onDismissRequest = { chargeCustomer = null },
            title = { Text("Manual Utang Charge — ${cust.name}") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = amt, onValueChange = { amt = it }, label = { Text("Amount (₱)") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true)
                    OutlinedTextField(value = due, onValueChange = { due = it }, label = { Text("Due Date (YYYY-MM-DD)") }, singleLine = true)
                    OutlinedTextField(value = note, onValueChange = { note = it }, label = { Text("Note") }, singleLine = true)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = over, onCheckedChange = { over = it })
                        Text("Allow over credit limit", fontSize = 12.sp)
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        vm.postUtangManualCharge(cust.id, amt.toDoubleOrNull() ?: 0.0, due.ifBlank { null }, note.ifBlank { null }, over)
                        chargeCustomer = null
                    }
                ) { Text("Add Charge") }
            },
            dismissButton = { TextButton(onClick = { chargeCustomer = null }) { Text("Cancel") } }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RepackTingiTab(vm: PosViewModel) {
    val products by vm.products.collectAsStateWithLifecycle()
    val rules by vm.repackRules.collectAsStateWithLifecycle()
    val repackLogs by vm.repackLogs.collectAsStateWithLifecycle()
    val prodMap = remember(products) { PosMath.buildProductMap(products) }

    var ruleName by remember { mutableStateOf("") }
    var masterId by remember(products) { mutableStateOf(products.firstOrNull()?.id ?: "") }
    var targetId by remember(products) { mutableStateOf(products.getOrNull(1)?.id ?: "") }
    var yieldStr by remember { mutableStateOf("25") }
    var autoCost by remember { mutableStateOf(true) }
    var masterExpand by remember { mutableStateOf(false) }
    var targetExpand by remember { mutableStateOf(false) }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        item {
            Surface(shape = RoundedCornerShape(14.dp), color = Color.White, border = BorderStroke(1.dp, PosColors.Slate200)) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Create Bulk → Tingi Repack Rule", style = MaterialTheme.typography.titleMedium)
                    OutlinedTextField(value = ruleName, onValueChange = { ruleName = it }, label = { Text("Rule Name (e.g. 25kg Sack → 1kg Packs)") }, singleLine = true, modifier = Modifier.fillMaxWidth())

                    ExposedDropdownMenuBox(expanded = masterExpand, onExpandedChange = { masterExpand = it }) {
                        OutlinedTextField(
                            value = prodMap[masterId]?.name ?: "Select Bulk SKU",
                            onValueChange = {},
                            readOnly = true,
                            label = { Text("Master Bulk SKU") },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = masterExpand) },
                            modifier = Modifier.fillMaxWidth().menuAnchor(MenuAnchorType.PrimaryNotEditable)
                        )
                        ExposedDropdownMenu(expanded = masterExpand, onDismissRequest = { masterExpand = false }) {
                            products.forEach { p ->
                                DropdownMenuItem(text = { Text("${p.name} (${PosMath.formatQty(p.stock, p.unit)})") }, onClick = { masterId = p.id; masterExpand = false })
                            }
                        }
                    }

                    ExposedDropdownMenuBox(expanded = targetExpand, onExpandedChange = { targetExpand = it }) {
                        OutlinedTextField(
                            value = prodMap[targetId]?.name ?: "Select Tingi SKU",
                            onValueChange = {},
                            readOnly = true,
                            label = { Text("Target Retail / Tingi SKU") },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = targetExpand) },
                            modifier = Modifier.fillMaxWidth().menuAnchor(MenuAnchorType.PrimaryNotEditable)
                        )
                        ExposedDropdownMenu(expanded = targetExpand, onDismissRequest = { targetExpand = false }) {
                            products.forEach { p ->
                                DropdownMenuItem(text = { Text("${p.name} (${PosMath.formatQty(p.stock, p.unit)})") }, onClick = { targetId = p.id; targetExpand = false })
                            }
                        }
                    }

                    OutlinedTextField(
                        value = yieldStr,
                        onValueChange = { yieldStr = it },
                        label = { Text("Yield Qty per 1 Bulk Unit") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = autoCost, onCheckedChange = { autoCost = it })
                        Text("Auto-derive weighted capital cost per tingi unit", fontSize = 12.sp)
                    }
                    Button(
                        onClick = {
                            val y = yieldStr.toDoubleOrNull() ?: 0.0
                            if (y > 0 && masterId != targetId && masterId.isNotEmpty() && targetId.isNotEmpty()) {
                                val label = ruleName.ifBlank { "${prodMap[masterId]?.name ?: "Bulk"} → $y×" }
                                vm.createRepackRule(label, masterId, targetId, y, autoCost)
                                ruleName = ""
                            } else {
                                vm.toast("Choose two distinct products and yield > 0", ToastType.WARNING)
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = PosColors.Emerald600),
                        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
                    ) { Text("Save Repack Rule") }
                }
            }
        }

        items(rules, key = { it.id }) { rule ->
            val m = prodMap[rule.masterProductId]
            val t = prodMap[rule.targetProductId]
            var unpackQty by remember(rule.id) { mutableStateOf("1") }
            Surface(shape = RoundedCornerShape(14.dp), color = Color.White, border = BorderStroke(1.dp, PosColors.Slate200)) {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(rule.name, style = MaterialTheme.typography.titleSmall)
                            Text("1 ${m?.unit ?: "unit"} ${m?.name ?: "?"} → +${PosMath.formatQty(rule.yieldQty)} ${t?.name ?: "?"}", style = MaterialTheme.typography.bodySmall, color = PosColors.Slate600)
                        }
                        IconButton(onClick = { vm.deleteRepackRule(rule.id) }) {
                            Icon(Icons.Rounded.DeleteOutline, contentDescription = "Delete rule", tint = PosColors.Rose600)
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        OutlinedTextField(
                            value = unpackQty,
                            onValueChange = { unpackQty = it },
                            label = { Text("Qty") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            singleLine = true,
                            modifier = Modifier.width(100.dp)
                        )
                        Button(
                            onClick = { vm.runRepackConversion(rule.id, unpackQty.toDoubleOrNull() ?: 1.0) },
                            colors = ButtonDefaults.buttonColors(containerColor = PosColors.Indigo600),
                            modifier = Modifier.weight(1f).heightIn(min = 48.dp)
                        ) { Text("Unpack Now") }
                    }
                }
            }
        }

        if (repackLogs.isNotEmpty()) {
            item { Text("Recent Conversion Logs", style = MaterialTheme.typography.titleSmall, color = PosColors.Slate700) }
            items(repackLogs.take(15), key = { it.id }) { log ->
                Surface(shape = RoundedCornerShape(12.dp), color = Color.White, border = BorderStroke(1.dp, PosColors.Slate200)) {
                    Row(modifier = Modifier.fillMaxWidth().padding(10.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("${log.masterName} (-${PosMath.formatQty(log.masterQtyUsed)})", style = MaterialTheme.typography.labelMedium)
                            Text("→ +${PosMath.formatQty(log.targetQtyAdded)} ${log.targetName}", style = MaterialTheme.typography.bodySmall, color = PosColors.Emerald700)
                        }
                        Text("Cost ${PosMath.formatPeso(log.unitCost)}", fontSize = 11.sp, color = PosColors.Slate500)
                    }
                }
            }
        }
    }
}

@Composable
fun ShiftGastosTab(vm: PosViewModel) {
    val activeShift by vm.activeShift.collectAsStateWithLifecycle()
    val cashiers by vm.cashiers.collectAsStateWithLifecycle()
    val sales by vm.sales.collectAsStateWithLifecycle()
    val products by vm.products.collectAsStateWithLifecycle()
    val drawerEvents by vm.drawerEvents.collectAsStateWithLifecycle()
    val utangTxs by vm.utangTxs.collectAsStateWithLifecycle()
    val serviceEntries by vm.serviceEntries.collectAsStateWithLifecycle()

    val todayStart = remember { PosMath.startOfDayMs() }
    val shiftSummary = remember(sales, products, drawerEvents, utangTxs, serviceEntries, activeShift) {
        OpsMath.computeShiftLedgerSummary(
            sales, products, drawerEvents, utangTxs, serviceEntries,
            activeShift?.openingFloat ?: 0.0, todayStart, todayStart + PosMath.DAY_MS
        )
    }

    var selectedCashierId by remember(cashiers, activeShift) {
        mutableStateOf(activeShift?.cashierId ?: cashiers.firstOrNull()?.id ?: "")
    }
    var floatInput by remember(activeShift) { mutableStateOf((activeShift?.openingFloat ?: 1500.0).toString()) }
    var pinInput by remember { mutableStateOf("") }

    var evType by remember { mutableStateOf(DrawerEventType.expense) }
    var evCategory by remember { mutableStateOf("Store Supplies") }
    var evAmount by remember { mutableStateOf("") }
    var evNote by remember { mutableStateOf("") }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        item {
            Surface(shape = RoundedCornerShape(14.dp), color = PosColors.Slate900) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        if (activeShift != null) "Active Shift: ${activeShift!!.cashierName} (${activeShift!!.cashierRole})" else "No Active Shift Started",
                        color = Color.White,
                        style = MaterialTheme.typography.titleMedium
                    )
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Column {
                            Text("Expected Drawer", fontSize = 11.sp, color = PosColors.Slate300)
                            Text(PosMath.formatPeso(shiftSummary.expectedDrawerCash), color = PosColors.Emerald500, style = MaterialTheme.typography.titleLarge)
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text("True Net Profit", fontSize = 11.sp, color = PosColors.Slate300)
                            Text(PosMath.formatPeso(shiftSummary.trueNetProfit), color = Color.White, style = MaterialTheme.typography.titleLarge)
                        }
                    }
                    Text(
                        "Cash Sales ${PosMath.formatPeso(shiftSummary.cashSales)} · Gastos -${PosMath.formatPeso(shiftSummary.expensesTotal)} · Fees +${PosMath.formatPeso(shiftSummary.serviceFeesTotal)}",
                        fontSize = 11.sp,
                        color = PosColors.Slate300
                    )
                }
            }
        }

        item {
            Surface(shape = RoundedCornerShape(14.dp), color = Color.White, border = BorderStroke(1.dp, PosColors.Slate200)) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Start / Switch Cashier Shift", style = MaterialTheme.typography.titleSmall)
                    Row(modifier = Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        cashiers.filter { it.active }.forEach { c ->
                            FilterChip(selected = selectedCashierId == c.id, onClick = { selectedCashierId = c.id }, label = { Text("${c.name} (${c.role})") })
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = floatInput,
                            onValueChange = { floatInput = it },
                            label = { Text("Opening Float (₱)") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )
                        val needPin = vm.security.cashierHasPin(cashiers.find { it.id == selectedCashierId })
                        if (needPin) {
                            OutlinedTextField(
                                value = pinInput,
                                onValueChange = { pinInput = it },
                                label = { Text("Cashier PIN") },
                                visualTransformation = PasswordVisualTransformation(),
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                                singleLine = true,
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }
                    Button(
                        onClick = {
                            if (vm.openShift(selectedCashierId, floatInput.toDoubleOrNull() ?: 0.0, pinInput)) {
                                pinInput = ""
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = PosColors.Emerald600),
                        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
                    ) { Text("Start Shift") }
                }
            }
        }

        item {
            Surface(shape = RoundedCornerShape(14.dp), color = Color.White, border = BorderStroke(1.dp, PosColors.Slate200)) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Record Gastos / Cash Drop / Top-Up", style = MaterialTheme.typography.titleSmall)
                    Row(modifier = Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf(DrawerEventType.expense, DrawerEventType.drop, DrawerEventType.topup).forEach { t ->
                            FilterChip(selected = evType == t, onClick = { evType = t }, label = { Text(t.label, fontSize = 11.sp) })
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(value = evAmount, onValueChange = { evAmount = it }, label = { Text("Amount (₱)") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true, modifier = Modifier.weight(1f))
                        OutlinedTextField(value = evCategory, onValueChange = { evCategory = it }, label = { Text("Category") }, singleLine = true, modifier = Modifier.weight(1f))
                    }
                    OutlinedTextField(value = evNote, onValueChange = { evNote = it }, label = { Text("Note / Receipt Ref") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    Button(
                        onClick = {
                            val a = evAmount.toDoubleOrNull() ?: 0.0
                            if (a > 0.0) {
                                vm.addDrawerEvent(evType, evCategory, a, evNote)
                                evAmount = ""; evNote = ""
                            } else {
                                vm.toast("Enter valid amount > ₱0", ToastType.WARNING)
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = PosColors.Slate900),
                        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
                    ) { Text("Save Drawer Entry") }
                }
            }
        }

        items(drawerEvents.take(20), key = { it.id }) { ev ->
            Surface(shape = RoundedCornerShape(12.dp), color = Color.White, border = BorderStroke(1.dp, PosColors.Slate200)) {
                Row(modifier = Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("${ev.type.label} · ${ev.category}", style = MaterialTheme.typography.labelMedium)
                        Text(ev.note ?: ev.dateIso.take(16), style = MaterialTheme.typography.bodySmall, color = PosColors.Slate500)
                    }
                    Text(PosMath.formatPeso(ev.amount), fontWeight = FontWeight.Bold, color = if (ev.type == DrawerEventType.topup) PosColors.Emerald700 else PosColors.Rose700)
                    IconButton(onClick = { vm.deleteDrawerEvent(ev.id) }) {
                        Icon(Icons.Rounded.DeleteOutline, contentDescription = "Delete entry", tint = PosColors.Slate400)
                    }
                }
            }
        }
    }
}

@Composable
fun DigitalServicesTab(vm: PosViewModel) {
    val entries by vm.serviceEntries.collectAsStateWithLifecycle()
    val today = remember { PosMath.startOfDayMs() }
    val summary = remember(entries) { OpsMath.summarizeDigitalServices(entries, today, today + PosMath.DAY_MS) }

    var kind by remember { mutableStateOf(DigitalServiceKind.GCASH_IN) }
    var amountStr by remember { mutableStateOf("") }
    var feeStr by remember { mutableStateOf("") }
    var refNo by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                OpsKpiBox("Today Volume", PosMath.formatPeso(summary.totalVolume), "${summary.count} txns", PosColors.Indigo700, Modifier.weight(1f))
                OpsKpiBox("Fees Earned", PosMath.formatPeso(summary.totalFees), "Pure service profit", PosColors.Emerald700, Modifier.weight(1f))
                OpsKpiBox("Cash Impact", PosMath.formatPeso(summary.cashDrawerImpact), "Drawer net", PosColors.Slate800, Modifier.weight(1f))
            }
        }
        item {
            Surface(shape = RoundedCornerShape(14.dp), color = Color.White, border = BorderStroke(1.dp, PosColors.Slate200)) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Log GCash / Maya / E-Load / Bills Pay", style = MaterialTheme.typography.titleSmall)
                    Row(modifier = Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        DigitalServiceKind.entries.forEach { k ->
                            FilterChip(selected = kind == k, onClick = { kind = k }, label = { Text(k.label, fontSize = 11.sp) })
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        OutlinedTextField(
                            value = amountStr,
                            onValueChange = {
                                amountStr = it
                                val a = it.toDoubleOrNull() ?: 0.0
                                if (a > 0) feeStr = OpsMath.suggestServiceFee(kind, a).toString()
                            },
                            label = { Text("Principal (₱)") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )
                        OutlinedTextField(
                            value = feeStr,
                            onValueChange = { feeStr = it },
                            label = { Text("Service Fee (₱)") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(value = phone, onValueChange = { phone = it }, label = { Text("Customer Mobile") }, singleLine = true, modifier = Modifier.weight(1f))
                        OutlinedTextField(value = refNo, onValueChange = { refNo = it }, label = { Text("Ref #") }, singleLine = true, modifier = Modifier.weight(1f))
                    }
                    Button(
                        onClick = {
                            val a = amountStr.toDoubleOrNull() ?: 0.0
                            val f = feeStr.toDoubleOrNull() ?: 0.0
                            if (a > 0.0) {
                                vm.addServiceEntry(kind, a, f, refNo, phone, null)
                                amountStr = ""; feeStr = ""; refNo = ""; phone = ""
                            } else {
                                vm.toast("Enter principal amount > ₱0", ToastType.WARNING)
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = PosColors.Indigo600),
                        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
                    ) { Text("Record Service Transaction") }
                }
            }
        }
        items(entries.take(25), key = { it.id }) { e ->
            Surface(shape = RoundedCornerShape(12.dp), color = Color.White, border = BorderStroke(1.dp, PosColors.Slate200)) {
                Row(modifier = Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("${e.kind} · ${PosMath.formatPeso(e.amount)}", style = MaterialTheme.typography.labelMedium)
                        Text("Fee +${PosMath.formatPeso(e.fee)} ${e.reference?.let { "· Ref $it" } ?: ""}", style = MaterialTheme.typography.bodySmall, color = PosColors.Emerald700)
                    }
                    IconButton(onClick = { vm.deleteServiceEntry(e.id) }) {
                        Icon(Icons.Rounded.DeleteOutline, contentDescription = "Delete log", tint = PosColors.Slate400)
                    }
                }
            }
        }
    }
}

@Composable
fun PrinterLabelsTab(vm: PosViewModel) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val settings by vm.settings.collectAsStateWithLifecycle()
    val products by vm.products.collectAsStateWithLifecycle()
    val connected by vm.btPrinterConnected.collectAsStateWithLifecycle()
    val printerName by vm.btPrinterName.collectAsStateWithLifecycle()

    var pairedList by remember { mutableStateOf<List<PairedPrinterDevice>>(emptyList()) }
    var shelfProduct by remember(products) { mutableStateOf(products.firstOrNull()) }

    val btLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { res ->
        if (res.values.all { it }) {
            EscPosPrinter.listPairedPrinters(context)
                .onSuccess { pairedList = it; vm.toast("Found ${it.size} paired Bluetooth device(s)") }
                .onFailure { vm.toast(it.message ?: "Bluetooth scan failed", ToastType.WARNING) }
        } else {
            vm.toast("Bluetooth permission is needed to connect thermal printers", ToastType.WARNING)
        }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        item {
            Surface(shape = RoundedCornerShape(14.dp), color = Color.White, border = BorderStroke(1.dp, PosColors.Slate200)) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Icon(Icons.Rounded.Bluetooth, contentDescription = null, tint = if (connected) PosColors.Emerald600 else PosColors.Slate500)
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Bluetooth ESC/POS Thermal Printer", style = MaterialTheme.typography.titleSmall)
                            Text(if (connected) "Connected to $printerName" else "Not connected", style = MaterialTheme.typography.bodySmall, color = if (connected) PosColors.Emerald700 else PosColors.Slate500)
                        }
                        if (connected) {
                            OutlinedButton(onClick = { EscPosPrinter.disconnect(); vm.refreshBluetoothPrinterStatus(); vm.toast("Printer disconnected", ToastType.WARNING) }) {
                                Text("Disconnect", fontSize = 11.sp)
                            }
                        }
                    }

                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = {
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !EscPosPrinter.hasBluetoothPermission(context)) {
                                    btLauncher.launch(arrayOf(Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN))
                                } else {
                                    EscPosPrinter.listPairedPrinters(context)
                                        .onSuccess { pairedList = it; vm.toast("Found ${it.size} paired device(s)") }
                                        .onFailure { vm.toast(it.message ?: "Bluetooth unavailable", ToastType.WARNING) }
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = PosColors.Slate900),
                            modifier = Modifier.weight(1f)
                        ) { Text("Find Paired Printers", fontSize = 12.sp) }

                        OutlinedButton(
                            onClick = { vm.previewTestReceipt() },
                            modifier = Modifier.weight(1f)
                        ) { Text("Preview Receipt", fontSize = 12.sp) }
                    }

                    pairedList.forEach { dev ->
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = PosColors.Slate50,
                            border = BorderStroke(1.dp, PosColors.Slate200),
                            modifier = Modifier.fillMaxWidth().clickable {
                                scope.launch {
                                    EscPosPrinter.connectByAddress(context, dev.address)
                                        .onSuccess { vm.refreshBluetoothPrinterStatus(); vm.toast("Connected to ${it.deviceName}") }
                                        .onFailure { vm.toast(it.message ?: "Failed to connect", ToastType.ERROR) }
                                }
                            }
                        ) {
                            Row(modifier = Modifier.padding(10.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                Text("${dev.name} (${dev.address})", style = MaterialTheme.typography.labelMedium)
                                Text("Connect", color = PosColors.Emerald700, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                            }
                        }
                    }

                    if (connected) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(
                                onClick = {
                                    scope.launch {
                                        EscPosPrinter.sendBytes(EscPosPrinter.buildTestSlip(settings))
                                            .onSuccess { vm.toast("Printed test slip") }
                                            .onFailure { vm.toast(it.message ?: "Print error", ToastType.ERROR) }
                                    }
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = PosColors.Emerald600),
                                modifier = Modifier.weight(1f)
                            ) { Text("Test Print", fontSize = 12.sp) }
                            OutlinedButton(
                                onClick = {
                                    scope.launch {
                                        EscPosPrinter.sendBytes(EscPosPrinter.buildCashDrawerKick())
                                            .onSuccess { vm.toast("Cash drawer kick sent") }
                                            .onFailure { vm.toast(it.message ?: "Failed", ToastType.ERROR) }
                                    }
                                },
                                modifier = Modifier.weight(1f)
                            ) { Text("Kick Drawer", fontSize = 12.sp) }
                        }
                    }

                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Paper Width:", style = MaterialTheme.typography.labelMedium)
                        listOf("58mm", "80mm").forEach { w ->
                            FilterChip(
                                selected = settings.receiptWidth == w,
                                onClick = { vm.updateSettings(settings.copy(receiptWidth = w), "Paper width $w") },
                                label = { Text(w) }
                            )
                        }
                    }
                }
            }
        }

        // Shelf Tag / Code-128B Barcode Preview & Android PrintManager
        shelfProduct?.let { prod ->
            item {
                Surface(shape = RoundedCornerShape(14.dp), color = Color.White, border = BorderStroke(1.dp, PosColors.Slate200)) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Shelf Price & Code-128 Barcode Tag", style = MaterialTheme.typography.titleSmall)
                        Row(modifier = Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            products.take(10).forEach { p ->
                                FilterChip(selected = shelfProduct?.id == p.id, onClick = { shelfProduct = p }, label = { Text(p.name.take(18), fontSize = 11.sp) })
                            }
                        }
                        Surface(shape = RoundedCornerShape(12.dp), color = PosColors.Slate50, border = BorderStroke(1.dp, PosColors.Slate300)) {
                            Column(modifier = Modifier.fillMaxWidth().padding(14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                Text(prod.name, style = MaterialTheme.typography.titleSmall)
                                Text(
                                    PosMath.formatPeso(prod.retailPrice) + " / " + prod.unit,
                                    fontSize = 22.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    color = PosColors.Emerald700
                                )
                                if (prod.wholesalePrice < prod.retailPrice) {
                                    Text("Wholesale ${PosMath.formatPeso(prod.wholesalePrice)} (${prod.wholesaleMinQty}+)", fontSize = 11.sp, color = PosColors.Indigo700)
                                }
                                Spacer(Modifier.height(6.dp))
                                BarcodeCanvas(code = prod.barcode.ifBlank { prod.id }, modifier = Modifier.fillMaxWidth(0.75f))
                            }
                        }
                        OutlinedButton(
                            onClick = {
                                val html = "<html><body style='font-family:sans-serif;text-align:center;border:2px dashed #333;padding:12px;width:240px;'>" +
                                    "<div><b>${prod.name}</b></div>" +
                                    "<div style='font-size:26px;font-weight:900;margin:6px 0;'>${PosMath.formatPeso(prod.retailPrice)}</div>" +
                                    "<div style='font-size:12px;'>Barcode: ${prod.barcode.ifBlank { prod.id }}</div>" +
                                    "</body></html>"
                                AndroidDeviceBridge.printHtmlReceipt(context, "Shelf Tag - ${prod.name}", html)
                            },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Icon(Icons.Rounded.Print, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Print Shelf Tag")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun OpsKpiBox(title: String, value: String, sub: String, color: Color, modifier: Modifier = Modifier) {
    Surface(shape = RoundedCornerShape(12.dp), color = Color.White, border = BorderStroke(1.dp, PosColors.Slate200), modifier = modifier) {
        Column(modifier = Modifier.padding(10.dp)) {
            Text(title, fontSize = 10.sp, color = PosColors.Slate500, fontWeight = FontWeight.SemiBold)
            Text(value, fontSize = 16.sp, fontWeight = FontWeight.ExtraBold, color = color)
            Text(sub, fontSize = 10.sp, color = PosColors.Slate500)
        }
    }
}
