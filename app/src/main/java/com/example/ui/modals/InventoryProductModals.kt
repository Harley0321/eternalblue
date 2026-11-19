package com.example.ui.modals

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.QrCodeScanner
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.domain.PosMath
import com.example.model.Product
import com.example.model.ScannerMode
import com.example.model.ToastType
import com.example.ui.theme.PosColors
import com.example.viewmodel.PosViewModel

@Composable
fun ProductDialog(vm: PosViewModel) {
    val state by vm.productModal.collectAsStateWithLifecycle()
    if (!state.open) return

    val edit = state.editingProduct
    var name by remember(edit?.id, state.open) { mutableStateOf(edit?.name ?: "") }
    var barcode by remember(edit?.id, state.initialBarcode, state.open) { mutableStateOf(edit?.barcode ?: state.initialBarcode) }
    var category by remember(edit?.id, state.open) { mutableStateOf(edit?.category ?: PosMath.BASE_CATEGORIES.first()) }
    var unit by remember(edit?.id, state.open) { mutableStateOf(edit?.unit ?: "pc") }
    var retail by remember(edit?.id, state.open) { mutableStateOf(edit?.retailPrice?.toString() ?: "") }
    var wholesale by remember(edit?.id, state.open) { mutableStateOf(edit?.wholesalePrice?.toString() ?: "") }
    var minQty by remember(edit?.id, state.open) { mutableStateOf((edit?.wholesaleMinQty ?: 10).toString()) }
    var capital by remember(edit?.id, state.open) { mutableStateOf(edit?.capital?.toString() ?: "") }
    var stock by remember(edit?.id, state.open) { mutableStateOf((edit?.stock ?: 0.0).toString()) }
    var lowTh by remember(edit?.id, state.open) { mutableStateOf(edit?.lowStockThreshold?.toString() ?: "") }
    var expiry by remember(edit?.id, state.open) { mutableStateOf(edit?.expiry ?: "") }
    var scElig by remember(edit?.id, state.open) { mutableStateOf(edit?.scEligible ?: PosMath.scSuggest(edit?.name, edit?.category)) }

    LaunchedEffect(state.initialBarcode) {
        if (state.initialBarcode.isNotEmpty() && barcode.isEmpty()) {
            barcode = state.initialBarcode
        }
    }

    Dialog(onDismissRequest = { vm.closeProductModal() }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        BackHandler { vm.closeProductModal() }
        Surface(shape = RoundedCornerShape(20.dp), color = Color.White, modifier = Modifier.fillMaxWidth(0.94f).heightIn(max = 700.dp)) {
            Column {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(if (edit != null) "Edit Product" else "Add New Product", style = MaterialTheme.typography.titleMedium)
                    IconButton(onClick = { vm.closeProductModal() }) { Icon(Icons.Rounded.Close, contentDescription = "Close") }
                }
                HorizontalDivider(color = PosColors.Slate200)

                Column(
                    modifier = Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()).padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Product Name *") }, singleLine = true, modifier = Modifier.fillMaxWidth().testTag("prod_name_input"))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        OutlinedTextField(value = barcode, onValueChange = { barcode = it }, label = { Text("Barcode") }, singleLine = true, modifier = Modifier.weight(1f))
                        OutlinedButton(
                            onClick = { vm.openScanner(ScannerMode.productForm, continuous = false) },
                            modifier = Modifier.heightIn(min = 52.dp)
                        ) { Icon(Icons.Rounded.QrCodeScanner, contentDescription = "Scan barcode") }
                    }

                    Text("Category", style = MaterialTheme.typography.labelMedium)
                    Row(modifier = Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        PosMath.BASE_CATEGORIES.forEach { cat ->
                            FilterChip(selected = category == cat, onClick = { category = cat }, label = { Text(cat, fontSize = 11.sp) })
                        }
                    }

                    Text("Unit of Measure", style = MaterialTheme.typography.labelMedium)
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf("pc", "pack", "kg", "bottle", "box", "sack").forEach { u ->
                            FilterChip(selected = unit == u, onClick = { unit = u }, label = { Text(u, fontSize = 11.sp) })
                        }
                    }

                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(value = retail, onValueChange = { retail = it }, label = { Text("Retail Price *") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true, modifier = Modifier.weight(1f))
                        OutlinedTextField(value = capital, onValueChange = { capital = it }, label = { Text("Capital Cost") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true, modifier = Modifier.weight(1f))
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(value = wholesale, onValueChange = { wholesale = it }, label = { Text("Wholesale Price") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true, modifier = Modifier.weight(1f))
                        OutlinedTextField(value = minQty, onValueChange = { minQty = it }, label = { Text("Min Qty") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true, modifier = Modifier.weight(1f))
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(value = stock, onValueChange = { stock = it }, label = { Text("Current Stock") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true, modifier = Modifier.weight(1f))
                        OutlinedTextField(value = lowTh, onValueChange = { lowTh = it }, label = { Text("Low Alert") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true, modifier = Modifier.weight(1f))
                    }
                    OutlinedTextField(value = expiry, onValueChange = { expiry = it }, label = { Text("Expiry Date (YYYY-MM-DD, Optional)") }, singleLine = true, modifier = Modifier.fillMaxWidth())

                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = scElig, onCheckedChange = { scElig = it })
                        Text("Eligible for Senior/PWD 5% Basic Necessity Discount", fontSize = 12.sp)
                    }
                }

                HorizontalDivider(color = PosColors.Slate200)
                Row(modifier = Modifier.fillMaxWidth().padding(14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { vm.closeProductModal() }, modifier = Modifier.weight(0.35f)) { Text("Cancel") }
                    Button(
                        onClick = {
                            val rVal = retail.toDoubleOrNull() ?: 0.0
                            if (name.isBlank() || rVal <= 0.0) {
                                vm.toast("Enter product name and retail price > 0", ToastType.WARNING)
                                return@Button
                            }
                            val wVal = wholesale.toDoubleOrNull()?.takeIf { it > 0.0 } ?: rVal
                            val draft = Product(
                                id = edit?.id ?: "",
                                barcode = barcode.trim(),
                                name = name.trim(),
                                category = category,
                                unit = unit,
                                capital = capital.toDoubleOrNull()?.takeIf { it >= 0.0 },
                                retailPrice = PosMath.round2(rVal),
                                wholesalePrice = PosMath.round2(wVal),
                                wholesaleMinQty = (minQty.toIntOrNull() ?: 10).coerceAtLeast(1),
                                stock = (stock.toDoubleOrNull() ?: 0.0).coerceAtLeast(0.0).let { PosMath.round3(it) },
                                lowStockThreshold = lowTh.toDoubleOrNull()?.takeIf { it >= 0.0 },
                                expiry = expiry.trim().ifEmpty { null },
                                scEligible = scElig,
                                icon = edit?.icon,
                                iconColor = edit?.iconColor
                            )
                            vm.saveProduct(draft, edit?.id)
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = PosColors.Emerald600),
                        modifier = Modifier.weight(0.65f).testTag("prod_save_btn")
                    ) { Text(if (edit != null) "Update Product" else "Save Product") }
                }
            }
        }
    }
}

@Composable
fun StockAdjustDialog(vm: PosViewModel) {
    val product by vm.stockAdjustProduct.collectAsStateWithLifecycle()
    val prod = product ?: return

    var mode by remember(prod.id) { mutableStateOf("add") }
    var qtyStr by remember(prod.id) { mutableStateOf("") }
    var reason by remember(prod.id) { mutableStateOf("Restock") }
    var note by remember(prod.id) { mutableStateOf("") }
    var newExpiry by remember(prod.id) { mutableStateOf(prod.expiry ?: "") }
    var newCap by remember(prod.id) { mutableStateOf(prod.capital?.toString() ?: "") }

    Dialog(onDismissRequest = { vm.closeStockAdjust() }) {
        BackHandler { vm.closeStockAdjust() }
        Surface(shape = RoundedCornerShape(20.dp), color = Color.White, modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Adjust Stock — ${prod.name}", style = MaterialTheme.typography.titleMedium)
                Text("Current Stock: ${PosMath.formatQty(prod.stock, prod.unit)}", color = PosColors.Emerald700, fontWeight = FontWeight.Bold)

                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("add" to "+ Add", "sub" to "- Deduct", "set" to "= Set Exact").forEach { (k, lbl) ->
                        FilterChip(selected = mode == k, onClick = { mode = k }, label = { Text(lbl, fontSize = 11.sp) })
                    }
                }
                OutlinedTextField(
                    value = qtyStr,
                    onValueChange = { qtyStr = it },
                    label = { Text("Quantity (${prod.unit})") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Row(modifier = Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("Restock", "Spoilage / Expired", "Damage", "Count Correction", "Other").forEach { r ->
                        FilterChip(selected = reason == r, onClick = { reason = r }, label = { Text(r, fontSize = 11.sp) })
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = newExpiry, onValueChange = { newExpiry = it }, label = { Text("Expiry (YYYY-MM-DD)") }, singleLine = true, modifier = Modifier.weight(1f))
                    OutlinedTextField(value = newCap, onValueChange = { newCap = it }, label = { Text("Capital (₱)") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true, modifier = Modifier.weight(1f))
                }
                OutlinedTextField(value = note, onValueChange = { note = it }, label = { Text("Audit Note") }, singleLine = true, modifier = Modifier.fillMaxWidth())

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    OutlinedButton(onClick = { vm.closeStockAdjust() }, modifier = Modifier.weight(0.4f)) { Text("Cancel") }
                    Button(
                        onClick = {
                            val v = qtyStr.toDoubleOrNull()
                            if (v == null || v < 0.0) {
                                vm.toast("Enter valid quantity", ToastType.WARNING)
                                return@Button
                            }
                            val delta = when (mode) {
                                "add" -> v
                                "sub" -> -v
                                else -> PosMath.round3(v - prod.stock)
                            }
                            vm.applyStockAdjust(prod.id, delta, reason, note, newExpiry.trim(), newCap.toDoubleOrNull())
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = PosColors.Emerald600),
                        modifier = Modifier.weight(0.6f)
                    ) { Text("Save Adjustment") }
                }
            }
        }
    }
}
