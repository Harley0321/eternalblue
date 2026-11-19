package com.example.ui.modals

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.domain.PosMath
import com.example.ui.theme.EmeraldDark
import com.example.ui.theme.EmeraldPrimary
import com.example.ui.theme.RoseDanger
import com.example.ui.theme.SlateBorder
import com.example.ui.theme.SlateMuted
import com.example.viewmodel.PosUiState
import com.example.viewmodel.PosViewModel

@Composable
fun BatchStockModal(state: PosUiState, vm: PosViewModel) {
    if (!state.batchModalOpen) return
    var isCycleCount by remember { mutableStateOf(false) }
    var note by remember { mutableStateOf("") }
    val entries = remember { mutableStateMapOf<String, String>() }

    AlertDialog(
        onDismissRequest = { vm.setBatchModalOpen(false) },
        title = { Text("Batch Stock Receive / Cycle Audit", fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(selected = !isCycleCount, onClick = { isCycleCount = false }, label = { Text("Receive (+Qty)", fontSize = 11.sp) })
                    FilterChip(selected = isCycleCount, onClick = { isCycleCount = true }, label = { Text("Cycle Audit (=Qty)", fontSize = 11.sp) })
                }
                OutlinedTextField(value = note, onValueChange = { note = it }, label = { Text("DR / Supplier Note") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.height(260.dp)) {
                    items(state.products, key = { it.id }) { p ->
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                            Column(modifier = Modifier.weight(1.4f)) {
                                Text(p.name, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text("Curr: ${PosMath.formatQty(p.stock, p.unit)}", fontSize = 10.sp, color = SlateMuted)
                            }
                            OutlinedTextField(
                                value = entries[p.id] ?: "",
                                onValueChange = { entries[p.id] = it },
                                placeholder = { Text("0") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                singleLine = true,
                                modifier = Modifier.weight(0.7f)
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val map = entries.mapNotNull { (k, v) -> v.toDoubleOrNull()?.let { k to it } }.toMap()
                    vm.applyBatchStock(map, isCycleCount, note)
                },
                colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary)
            ) { Text("Apply Batch") }
        },
        dismissButton = {
            TextButton(onClick = { vm.setBatchModalOpen(false) }) { Text("Cancel") }
        }
    )
}

@Composable
fun StockLogModal(state: PosUiState, vm: PosViewModel) {
    if (!state.stockLogModalOpen) return
    AlertDialog(
        onDismissRequest = { vm.setStockLogModalOpen(false) },
        title = { Text("Stock Movement Log", fontWeight = FontWeight.Bold) },
        text = {
            if (state.stockLog.isEmpty()) {
                Text("No stock adjustments recorded yet.", fontSize = 13.sp, color = SlateMuted)
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.height(340.dp)) {
                    items(state.stockLog, key = { it.id }) { log ->
                        Column(modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
                            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                                Text(log.productName, fontWeight = FontWeight.Bold, fontSize = 12.sp, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(
                                    (if (log.delta >= 0) "+" else "") + PosMath.formatQty(log.delta),
                                    fontFamily = FontFamily.Monospace,
                                    fontWeight = FontWeight.ExtraBold,
                                    fontSize = 12.sp,
                                    color = if (log.delta >= 0) EmeraldDark else RoseDanger
                                )
                            }
                            Text("${log.reason}${log.note?.let { " • $it" } ?: ""} (${PosMath.formatDateTime(log.dateIso)})", fontSize = 10.sp, color = SlateMuted)
                            HorizontalDivider(color = SlateBorder, modifier = Modifier.padding(top = 4.dp))
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { vm.setStockLogModalOpen(false) }) { Text("Close") }
        }
    )
}
