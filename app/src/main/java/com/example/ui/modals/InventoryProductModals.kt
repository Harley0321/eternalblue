package com.example.ui.modals

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.domain.PosMath
import com.example.model.Product
import com.example.ui.theme.EmeraldPrimary
import com.example.ui.theme.RoseDanger
import com.example.viewmodel.PosUiState
import com.example.viewmodel.PosViewModel

@Composable
fun ProductModal(state: PosUiState, vm: PosViewModel) {
    if (!state.productModalOpen) return
    val existing = state.editingProduct

    var name by remember(existing) { mutableStateOf(existing?.name ?: "") }
    var barcode by remember(existing, state.productModalScannedBarcode) {
        mutableStateOf(
            state.productModalScannedBarcode.ifBlank { existing?.barcode ?: PosMath.generateEan13() }
        )
    }
    LaunchedEffect(state.productModalScannedBarcode) {
        if (state.productModalScannedBarcode.isNotBlank()) barcode = state.productModalScannedBarcode
    }

    var category by remember(existing) { mutableStateOf(existing?.category ?: PosMath.BASE_CATEGORIES.first()) }
    var unit by remember(existing) { mutableStateOf(existing?.unit ?: "pc") }
    var capital by remember(existing) { mutableStateOf(existing?.capital?.toString() ?: "") }
    var retail by remember(existing) { mutableStateOf(existing?.retailPrice?.toString() ?: "") }
    var wholesale by remember(existing) { mutableStateOf(existing?.wholesalePrice?.toString() ?: "") }
    var minQty by remember(existing) { mutableStateOf((existing?.wholesaleMinQty ?: 10.0).toString()) }
    var stock by remember(existing) { mutableStateOf((existing?.stock ?: 0.0).toString()) }
    var expiry by remember(existing) { mutableStateOf(existing?.expiry ?: "") }
    var scElig by remember(existing) { mutableStateOf(existing?.scEligible ?: true) }

    AlertDialog(
        onDismissRequest = vm::closeProductModal,
        title = { Text(if (existing == null) "New Product" else "Edit Product", fontWeight = FontWeight.ExtraBold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.verticalScroll(rememberScrollState())) {
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Product Name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(value = barcode, onValueChange = { barcode = it }, label = { Text("Barcode") }, singleLine = true, modifier = Modifier.weight(1f))
                    OutlinedButton(onClick = { barcode = PosMath.generateEan13() }) { Text("EAN", fontSize = 11.sp) }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = category, onValueChange = { category = it }, label = { Text("Category") }, singleLine = true, modifier = Modifier.weight(1f))
                    OutlinedTextField(value = unit, onValueChange = { unit = it }, label = { Text("Unit") }, singleLine = true, modifier = Modifier.weight(0.6f))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = capital, onValueChange = { capital = it }, label = { Text("Capital (₱)") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true, modifier = Modifier.weight(1f))
                    OutlinedTextField(value = retail, onValueChange = { retail = it }, label = { Text("Retail (₱)") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true, modifier = Modifier.weight(1f))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = wholesale, onValueChange = { wholesale = it }, label = { Text("Wholesale (₱)") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true, modifier = Modifier.weight(1f))
                    OutlinedTextField(value = minQty, onValueChange = { minQty = it }, label = { Text("Min WS Qty") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true, modifier = Modifier.weight(1f))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = stock, onValueChange = { stock = it }, label = { Text("Stock") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true, modifier = Modifier.weight(1f))
                    OutlinedTextField(value = expiry, onValueChange = { expiry = it }, label = { Text("Expiry YYYY-MM-DD") }, singleLine = true, modifier = Modifier.weight(1f))
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                    Text("SC / PWD 5% Eligible", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    Switch(checked = scElig, onCheckedChange = { scElig = it })
                }
                if (existing != null) {
                    TextButton(onClick = { vm.deleteProduct(existing.id) }) {
                        Text("Delete Product", color = RoseDanger, fontSize = 12.sp)
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val retailVal = (retail.toDoubleOrNull() ?: 0.0).coerceAtLeast(0.0)
                    val wsVal = (wholesale.toDoubleOrNull() ?: retailVal).coerceAtLeast(0.0)
                    vm.saveProduct(
                        Product(
                            id = existing?.id ?: "p-${System.currentTimeMillis()}",
                            barcode = barcode.trim(),
                            name = name.trim(),
                            category = category.trim().ifEmpty { "General" },
                            unit = unit.trim().ifEmpty { "pc" },
                            capital = capital.toDoubleOrNull()?.takeIf { it.isFinite() }?.coerceAtLeast(0.0),
                            retailPrice = retailVal,
                            wholesalePrice = wsVal,
                            wholesaleMinQty = (minQty.toDoubleOrNull() ?: 10.0).coerceAtLeast(1.0),
                            stock = (stock.toDoubleOrNull() ?: 0.0).coerceAtLeast(0.0),
                            lowStockThreshold = existing?.lowStockThreshold,
                            expiry = expiry.trim().takeIf { it.isNotEmpty() },
                            scEligible = scElig,
                            icon = existing?.icon,
                            iconColor = existing?.iconColor
                        )
                    )
                },
                enabled = name.isNotBlank() && (retail.toDoubleOrNull()?.let { it.isFinite() && it > 0.0 } == true),
                colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary)
            ) { Text("Save") }
        },
        dismissButton = {
            TextButton(onClick = vm::closeProductModal) { Text("Cancel") }
        }
    )
}

@Composable
fun StockAdjustModal(state: PosUiState, vm: PosViewModel) {
    val p = state.stockAdjustProduct ?: return
    var mode by remember { mutableStateOf("add") } // add | sub | set
    var qtyStr by remember(p.id) { mutableStateOf("10") }
    var reason by remember { mutableStateOf("Restock") }
    var note by remember { mutableStateOf("") }

    val qty = qtyStr.toDoubleOrNull() ?: 0.0
    val previewStock = when (mode) {
        "add" -> p.stock + qty
        "sub" -> (p.stock - qty).coerceAtLeast(0.0)
        else -> qty.coerceAtLeast(0.0)
    }

    AlertDialog(
        onDismissRequest = { vm.openStockAdjust(null) },
        title = { Text("Adjust Stock • ${p.name}", fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Current: ${PosMath.formatQty(p.stock, p.unit)} → Next: ${PosMath.formatQty(previewStock, p.unit)}", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("add" to "+ Add", "sub" to "- Deduct", "set" to "= Set Count").forEach { (id, lbl) ->
                        FilterChip(selected = mode == id, onClick = { mode = id }, label = { Text(lbl, fontSize = 11.sp) })
                    }
                }
                OutlinedTextField(value = qtyStr, onValueChange = { qtyStr = it }, label = { Text("Quantity") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true, modifier = Modifier.fillMaxWidth())
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("Restock", "Spoilage", "Count Correction").forEach { r ->
                        FilterChip(selected = reason == r, onClick = { reason = r }, label = { Text(r, fontSize = 10.sp) })
                    }
                }
                OutlinedTextField(value = note, onValueChange = { note = it }, label = { Text("Note / DR #") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = {
            Button(
                onClick = { vm.applyStockAdjustment(p.id, previewStock, reason, note) },
                colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary)
            ) { Text("Apply") }
        },
        dismissButton = {
            TextButton(onClick = { vm.openStockAdjust(null) }) { Text("Cancel") }
        }
    )
}
