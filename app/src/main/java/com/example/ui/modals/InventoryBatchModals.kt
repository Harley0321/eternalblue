package com.example.ui.modals

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.domain.PosMath
import com.example.hardware.AndroidDeviceBridge
import com.example.model.ToastType
import com.example.ui.theme.PosColors
import com.example.viewmodel.PosViewModel

@Composable
fun BatchStockDialog(vm: PosViewModel) {
    val state by vm.batchStockState.collectAsStateWithLifecycle()
    if (!state.open) return

    val products by vm.products.collectAsStateWithLifecycle()
    val valuesMap = remember(state.open, state.prefill) {
        mutableStateMapOf<String, String>().apply {
            state.prefill.forEach { (pid, pair) -> put(pid, pair.first.toString()) }
        }
    }

    Dialog(onDismissRequest = { vm.closeBatchStock() }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        BackHandler { vm.closeBatchStock() }
        Surface(shape = RoundedCornerShape(20.dp), color = Color.White, modifier = Modifier.fillMaxWidth(0.94f).heightIn(max = 680.dp)) {
            Column {
                Row(modifier = Modifier.fillMaxWidth().padding(14.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Column {
                        Text("Batch Stock Update (${state.reason})", style = MaterialTheme.typography.titleMedium)
                        Text(if (state.mode == "set") "Set exact shelf stock" else "Add delta quantity (+/-)", style = MaterialTheme.typography.bodySmall, color = PosColors.Slate500)
                    }
                    IconButton(onClick = { vm.closeBatchStock() }) { Icon(Icons.Rounded.Close, contentDescription = "Close") }
                }
                HorizontalDivider(color = PosColors.Slate200)

                LazyColumn(
                    modifier = Modifier.weight(1f),
                    contentPadding = PaddingValues(12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(products, key = { it.id }) { p ->
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(p.name, style = MaterialTheme.typography.labelMedium, maxLines = 1)
                                Text("Now: ${PosMath.formatQty(p.stock, p.unit)}", fontSize = 11.sp, color = PosColors.Slate500)
                            }
                            OutlinedTextField(
                                value = valuesMap[p.id] ?: "",
                                onValueChange = { valuesMap[p.id] = it },
                                placeholder = { Text(if (state.mode == "set") "Exact" else "+Qty", fontSize = 11.sp) },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                singleLine = true,
                                modifier = Modifier.width(96.dp)
                            )
                        }
                    }
                }
                HorizontalDivider(color = PosColors.Slate200)
                Row(modifier = Modifier.fillMaxWidth().padding(14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { vm.closeBatchStock() }, modifier = Modifier.weight(0.35f)) { Text("Cancel") }
                    Button(
                        onClick = {
                            val inputs = valuesMap.mapNotNull { (pid, raw) ->
                                val d = raw.toDoubleOrNull() ?: return@mapNotNull null
                                val note = state.prefill[pid]?.second
                                PosMath.BatchStockAdjustmentInput(pid, state.mode, d, state.reason, note)
                            }
                            vm.applyBatchStock(inputs)
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = PosColors.Emerald600),
                        modifier = Modifier.weight(0.65f)
                    ) { Text("Apply All Changes") }
                }
            }
        }
    }
}

@Composable
fun CsvImportDialog(vm: PosViewModel) {
    val open by vm.csvImportOpen.collectAsStateWithLifecycle()
    if (!open) return

    val context = LocalContext.current
    val products by vm.products.collectAsStateWithLifecycle()
    var csvText by remember {
        mutableStateOf("Barcode,Name,Category,Unit,Retail Price,Wholesale Price,Min Qty,Stock\n")
    }
    val parsed = remember(csvText, products) { PosMath.parseInventoryCsv(csvText, products) }

    val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            AndroidDeviceBridge.readUriText(context, uri)
                .onSuccess { csvText = it }
                .onFailure { vm.toast(it.message ?: "Failed to load CSV", ToastType.ERROR) }
        }
    }

    Dialog(onDismissRequest = { vm.closeCsvImport() }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        BackHandler { vm.closeCsvImport() }
        Surface(shape = RoundedCornerShape(20.dp), color = Color.White, modifier = Modifier.fillMaxWidth(0.94f).heightIn(max = 680.dp)) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text("CSV Bulk Catalog Import", style = MaterialTheme.typography.titleMedium)
                    IconButton(onClick = { vm.closeCsvImport() }) { Icon(Icons.Rounded.Close, contentDescription = "Close") }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { filePicker.launch(arrayOf("text/*", "*/*")) }, modifier = Modifier.weight(1f)) { Text("Pick CSV File", fontSize = 12.sp) }
                    OutlinedButton(
                        onClick = {
                            csvText = "Barcode,Name,Category,Unit,Retail Price,Wholesale Price,Min Qty,Stock\n4800099100999,Sample Buko Juice 350ml,Beverages,pc,25,22,12,48\n"
                        },
                        modifier = Modifier.weight(1f)
                    ) { Text("Load Sample", fontSize = 12.sp) }
                }
                OutlinedTextField(value = csvText, onValueChange = { csvText = it }, label = { Text("Paste CSV Data") }, maxLines = 7, modifier = Modifier.fillMaxWidth())

                if (parsed.error != null) {
                    Text(parsed.error, color = PosColors.Rose700, fontSize = 12.sp)
                } else {
                    val creates = parsed.rows.count { it.action == "create" }
                    val updates = parsed.rows.count { it.action == "update" }
                    val skips = parsed.rows.count { it.action == "skip" }
                    Text("Preview: +$creates create · $updates update · $skips skip", style = MaterialTheme.typography.labelMedium, color = PosColors.Emerald700)
                }

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    OutlinedButton(
                        onClick = { vm.applyCsvImport(parsed.rows, "new-only") },
                        enabled = parsed.rows.isNotEmpty(),
                        modifier = Modifier.weight(1f)
                    ) { Text("New Only") }
                    Button(
                        onClick = { vm.applyCsvImport(parsed.rows, "merge") },
                        enabled = parsed.rows.isNotEmpty(),
                        colors = ButtonDefaults.buttonColors(containerColor = PosColors.Emerald600),
                        modifier = Modifier.weight(1f)
                    ) { Text("Merge All") }
                }
            }
        }
    }
}

@Composable
fun StockLogDialog(vm: PosViewModel) {
    val open by vm.stockLogOpen.collectAsStateWithLifecycle()
    if (!open) return

    val context = LocalContext.current
    val logs by vm.stockLog.collectAsStateWithLifecycle()

    Dialog(onDismissRequest = { vm.closeStockLog() }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        BackHandler { vm.closeStockLog() }
        Surface(shape = RoundedCornerShape(20.dp), color = Color.White, modifier = Modifier.fillMaxWidth(0.94f).heightIn(max = 680.dp)) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text("Stock Movement Log (${logs.size})", style = MaterialTheme.typography.titleMedium)
                    IconButton(onClick = { vm.closeStockLog() }) { Icon(Icons.Rounded.Close, contentDescription = "Close") }
                }
                LazyColumn(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(logs, key = { it.id }) { e ->
                        Surface(shape = RoundedCornerShape(10.dp), color = PosColors.Slate50, border = BorderStroke(1.dp, PosColors.Slate200)) {
                            Row(modifier = Modifier.fillMaxWidth().padding(10.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text("${e.productName} · ${e.reason}", style = MaterialTheme.typography.labelMedium)
                                    Text("${e.dateIso.take(16)} ${e.note?.let { "· $it" } ?: ""}", fontSize = 11.sp, color = PosColors.Slate500)
                                }
                                Text(
                                    (if (e.delta > 0) "+" else "") + PosMath.formatQty(e.delta),
                                    fontWeight = FontWeight.Bold,
                                    color = if (e.delta >= 0) PosColors.Emerald700 else PosColors.Rose700
                                )
                            }
                        }
                    }
                }
                OutlinedButton(
                    onClick = {
                        val header = "Date,Product,Delta,Prev,New,Reason,Note\n"
                        val body = logs.joinToString("\n") {
                            listOf(it.dateIso, it.productName, it.delta.toString(), it.prevStock.toString(), it.newStock.toString(), it.reason, it.note ?: "")
                                .joinToString(",") { cell -> PosMath.escapeCsvCell(cell) }
                        }
                        AndroidDeviceBridge.shareTextFile(context, "stock-movements.csv", header + body, "text/csv")
                    },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Export CSV") }
            }
        }
    }
}

@Composable
fun ScReviewDialog(vm: PosViewModel) {
    val open by vm.scReviewOpen.collectAsStateWithLifecycle()
    if (!open) return

    val products by vm.products.collectAsStateWithLifecycle()
    val flags = remember(open, products) {
        mutableStateMapOf<String, Boolean>().apply {
            products.forEach { put(it.id, PosMath.scEligibleProduct(it)) }
        }
    }

    Dialog(onDismissRequest = { vm.closeScReview() }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        BackHandler { vm.closeScReview() }
        Surface(shape = RoundedCornerShape(20.dp), color = Color.White, modifier = Modifier.fillMaxWidth(0.94f).heightIn(max = 680.dp)) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text("SC/PWD 5% Basic Necessities Review", style = MaterialTheme.typography.titleMedium)
                    IconButton(onClick = { vm.closeScReview() }) { Icon(Icons.Rounded.Close, contentDescription = "Close") }
                }
                LazyColumn(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    items(products, key = { it.id }) { p ->
                        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(p.name, style = MaterialTheme.typography.labelMedium, maxLines = 1)
                                Text(p.category, fontSize = 11.sp, color = PosColors.Slate500)
                            }
                            Checkbox(checked = flags[p.id] == true, onCheckedChange = { flags[p.id] = it })
                        }
                    }
                }
                Button(
                    onClick = { vm.saveScReview(flags.toMap()) },
                    colors = ButtonDefaults.buttonColors(containerColor = PosColors.Emerald600),
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Save SC/PWD Flags") }
            }
        }
    }
}

@Composable
fun ReorderDialog(vm: PosViewModel) {
    val open by vm.reorderOpen.collectAsStateWithLifecycle()
    if (!open) return

    val products by vm.products.collectAsStateWithLifecycle()
    val sales by vm.sales.collectAsStateWithLifecycle()
    val settings by vm.settings.collectAsStateWithLifecycle()
    val reorder = remember(products, sales, settings) { PosMath.computeReorderList(products, sales, settings) }

    Dialog(onDismissRequest = { vm.closeReorder() }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        BackHandler { vm.closeReorder() }
        Surface(shape = RoundedCornerShape(20.dp), color = Color.White, modifier = Modifier.fillMaxWidth(0.94f).heightIn(max = 680.dp)) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Column {
                        Text("Smart Velocity Reorder List", style = MaterialTheme.typography.titleMedium)
                        Text("Lead ${settings.reorderLeadDays}d + Safety ${settings.reorderSafetyDays}d", fontSize = 11.sp, color = PosColors.Slate500)
                    }
                    IconButton(onClick = { vm.closeReorder() }) { Icon(Icons.Rounded.Close, contentDescription = "Close") }
                }

                if (reorder.rows.isEmpty()) {
                    Text(
                        if (!reorder.hasSales) "Record sales across a few days so velocity-based reorder points can compute automatically."
                        else "All fast-moving SKUs are comfortably above their reorder point.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = PosColors.Slate600,
                        modifier = Modifier.padding(vertical = 24.dp)
                    )
                } else {
                    LazyColumn(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        items(reorder.rows, key = { it.p.id }) { r ->
                            Surface(shape = RoundedCornerShape(10.dp), color = PosColors.Slate50, border = BorderStroke(1.dp, PosColors.Slate200)) {
                                Row(modifier = Modifier.fillMaxWidth().padding(10.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(r.p.name, style = MaterialTheme.typography.labelMedium)
                                        Text(
                                            "Left: ${PosMath.formatQty(r.p.stock, r.p.unit)} (~${String.format("%.1f", r.daysLeft)}d cover)",
                                            fontSize = 11.sp,
                                            color = PosColors.Amber700
                                        )
                                    }
                                    Column(horizontalAlignment = Alignment.End) {
                                        Text("+${PosMath.formatQty(r.suggest, r.p.unit)}", fontWeight = FontWeight.ExtraBold, color = PosColors.Emerald700)
                                        r.cost?.let { Text(PosMath.formatPeso(it), fontSize = 11.sp, color = PosColors.Slate500) }
                                    }
                                }
                            }
                        }
                    }

                    Button(
                        onClick = {
                            val prefill = reorder.rows.associate { it.p.id to (it.suggest to "Smart Reorder PO") }
                            vm.closeReorder()
                            vm.openBatchStock("delta", "Restock", prefill)
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = PosColors.Emerald600),
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("Send to Batch Restock") }
                }
            }
        }
    }
}
