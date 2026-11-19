package com.example.ui.modals

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Bluetooth
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.FlipToFront
import androidx.compose.material.icons.rounded.Print
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.domain.OpsMath
import com.example.domain.PaymentQr
import com.example.domain.PosMath
import com.example.hardware.AndroidDeviceBridge
import com.example.hardware.EscPosPrinter
import com.example.model.CheckoutLiveDraft
import com.example.model.PaymentMethod
import com.example.model.ReadingReport
import com.example.model.SaleRecord
import com.example.model.ToastType
import com.example.ui.components.MerchantQrCard
import com.example.ui.components.StoreEmblem
import com.example.ui.theme.PosColors
import com.example.viewmodel.PosViewModel
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CheckoutDialog(vm: PosViewModel) {
    val open by vm.checkoutOpen.collectAsStateWithLifecycle()
    if (!open) return

    val totals by vm.cartTotals.collectAsStateWithLifecycle()
    val settings by vm.settings.collectAsStateWithLifecycle()
    val customers by vm.customers.collectAsStateWithLifecycle()

    var method by remember { mutableStateOf(PaymentMethod.Cash) }
    var selectedCustomerId by remember { mutableStateOf<String?>(null) }
    var custExpand by remember { mutableStateOf(false) }
    var pointsInput by remember { mutableStateOf("0") }
    var cashStr by remember(totals.grandTotal) { mutableStateOf(PosMath.round2(totals.grandTotal).toString()) }
    var refNo by remember { mutableStateOf("") }
    var seniorId by remember { mutableStateOf("") }
    var utangDueDate by remember { mutableStateOf("") }
    var allowOverLimit by remember { mutableStateOf(false) }
    var splitCashStr by remember { mutableStateOf("") }
    var splitDigitalMethod by remember { mutableStateOf("GCash") }

    val selectedCustomer = remember(customers, selectedCustomerId) {
        selectedCustomerId?.let { id -> customers.find { it.id == id } }
    }
    val ptVal = if (settings.loyaltyPointValue > 0.0) settings.loyaltyPointValue else 1.0
    val redemption = remember(selectedCustomer, pointsInput, totals.grandTotal, ptVal) {
        if (selectedCustomer != null) {
            OpsMath.computePointsRedemption(pointsInput.toIntOrNull() ?: 0, selectedCustomer.points, ptVal, totals.grandTotal)
        } else OpsMath.PointsRedemption(0, 0.0)
    }
    val finalDue = PosMath.round2((totals.grandTotal - redemption.discountPeso).coerceAtLeast(0.0))
    val cashVal = cashStr.toDoubleOrNull() ?: 0.0
    val changeVal = PosMath.round2((cashVal - finalDue).coerceAtLeast(0.0))
    val splitCash = splitCashStr.toDoubleOrNull() ?: 0.0
    val splitDigital = PosMath.round2((finalDue - splitCash).coerceAtLeast(0.0))

    val qrTargetAmt = when (method) {
        PaymentMethod.GCash -> finalDue
        PaymentMethod.Split -> if (splitDigitalMethod == "GCash") splitDigital else 0.0
        else -> 0.0
    }
    val resolvedQr = remember(settings, qrTargetAmt) { PaymentQr.resolveCheckoutQrState(settings, qrTargetAmt) }

    LaunchedEffect(method, finalDue, cashVal, changeVal, splitCash, splitDigital, splitDigitalMethod, selectedCustomer, redemption) {
        vm.updateCheckoutDraft(
            CheckoutLiveDraft(
                open = true,
                method = method,
                finalDue = finalDue,
                cashTendered = cashVal,
                cashChange = changeVal,
                splitCash = splitCash,
                splitDigital = splitDigital,
                splitDigitalMethod = splitDigitalMethod,
                customerName = selectedCustomer?.name,
                pointsDiscount = redemption.discountPeso
            )
        )
    }

    Dialog(onDismissRequest = { vm.closeCheckout() }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        BackHandler { vm.closeCheckout() }
        Surface(
            shape = RoundedCornerShape(20.dp),
            color = Color.White,
            modifier = Modifier
                .fillMaxWidth(0.94f)
                .heightIn(max = 720.dp)
        ) {
            Column(modifier = Modifier.fillMaxWidth()) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text("Checkout & Payment", style = MaterialTheme.typography.titleMedium)
                        Text("Amount Due: ${PosMath.formatPeso(finalDue)}", style = MaterialTheme.typography.titleLarge, color = PosColors.Emerald700)
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconButton(onClick = { vm.openFlipCustomerDisplay() }) {
                            Icon(Icons.Rounded.FlipToFront, contentDescription = "Customer Flip Display", tint = PosColors.Indigo600)
                        }
                        IconButton(onClick = { vm.closeCheckout() }) {
                            Icon(Icons.Rounded.Close, contentDescription = "Close checkout")
                        }
                    }
                }
                HorizontalDivider(color = PosColors.Slate200)

                Column(
                    modifier = Modifier
                        .weight(1f, fill = false)
                        .verticalScroll(rememberScrollState())
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    // Payment Methods
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        PaymentMethod.entries.forEach { pm ->
                            FilterChip(
                                selected = method == pm,
                                onClick = { method = pm },
                                label = { Text(pm.label, fontWeight = FontWeight.Bold) },
                                modifier = Modifier.testTag("chk_method_${pm.name.lowercase()}")
                            )
                        }
                    }

                    // Suki Customer Selector
                    ExposedDropdownMenuBox(expanded = custExpand, onExpandedChange = { custExpand = it }) {
                        OutlinedTextField(
                            value = selectedCustomer?.let { "${it.name} (${it.points} pts · Bal ${PosMath.formatPeso(it.balance)})" } ?: "Walk-in Customer (Optional Suki)",
                            onValueChange = {},
                            readOnly = true,
                            label = { Text("Suki Customer") },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = custExpand) },
                            modifier = Modifier.fillMaxWidth().menuAnchor(MenuAnchorType.PrimaryNotEditable)
                        )
                        ExposedDropdownMenu(expanded = custExpand, onDismissRequest = { custExpand = false }) {
                            DropdownMenuItem(text = { Text("Walk-in Customer") }, onClick = { selectedCustomerId = null; custExpand = false })
                            customers.forEach { c ->
                                DropdownMenuItem(
                                    text = { Text("${c.name} · ${c.points} pts · Utang ${PosMath.formatPeso(c.balance)}") },
                                    onClick = { selectedCustomerId = c.id; custExpand = false }
                                )
                            }
                        }
                    }

                    if (selectedCustomer != null && selectedCustomer.points > 0) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                            OutlinedTextField(
                                value = pointsInput,
                                onValueChange = { pointsInput = it },
                                label = { Text("Redeem Suki Points (Avail ${selectedCustomer.points})") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                singleLine = true,
                                modifier = Modifier.weight(1f)
                            )
                            TextButton(onClick = { pointsInput = selectedCustomer.points.toString() }) { Text("Max") }
                        }
                    }

                    if (totals.seniorDiscount > 0.0) {
                        OutlinedTextField(
                            value = seniorId,
                            onValueChange = { seniorId = it },
                            label = { Text("OSCA / PWD ID # (Optional)") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }

                    when (method) {
                        PaymentMethod.Cash -> {
                            OutlinedTextField(
                                value = cashStr,
                                onValueChange = { cashStr = it },
                                label = { Text("Cash Tendered (₱)") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth().testTag("chk_cash_input")
                            )
                            Row(
                                modifier = Modifier.horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                listOf(finalDue, 50.0, 100.0, 200.0, 500.0, 1000.0).distinct().filter { it >= finalDue }.forEach { amt ->
                                    OutlinedButton(onClick = { cashStr = amt.toString() }) {
                                        Text(if (amt == finalDue) "Exact" else "₱${amt.toInt()}")
                                    }
                                }
                            }
                            Surface(shape = RoundedCornerShape(12.dp), color = PosColors.Emerald50) {
                                Row(
                                    modifier = Modifier.fillMaxWidth().padding(12.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text("Change", style = MaterialTheme.typography.titleSmall, color = PosColors.Emerald700)
                                    Text(PosMath.formatPeso(changeVal), style = MaterialTheme.typography.titleMedium, color = PosColors.Emerald700)
                                }
                            }
                        }
                        PaymentMethod.GCash -> {
                            MerchantQrCard(qrState = resolvedQr, compact = true)
                            OutlinedTextField(
                                value = refNo,
                                onValueChange = { refNo = it },
                                label = { Text("GCash Reference # (Optional)") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth()
                            )
                        }
                        PaymentMethod.Card -> {
                            OutlinedTextField(
                                value = refNo,
                                onValueChange = { refNo = it },
                                label = { Text("Approval / Trace #") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth()
                            )
                        }
                        PaymentMethod.Split -> {
                            OutlinedTextField(
                                value = splitCashStr,
                                onValueChange = { splitCashStr = it },
                                label = { Text("Cash Portion (₱)") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth()
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                listOf("GCash", "Card").forEach { dm ->
                                    FilterChip(selected = splitDigitalMethod == dm, onClick = { splitDigitalMethod = dm }, label = { Text(dm) })
                                }
                            }
                            Text("Digital Balance Due: ${PosMath.formatPeso(splitDigital)}", style = MaterialTheme.typography.titleSmall, color = PosColors.Indigo700)
                            if (splitDigitalMethod == "GCash" && splitDigital > 0.0) {
                                MerchantQrCard(qrState = resolvedQr, compact = true)
                            }
                            OutlinedTextField(value = refNo, onValueChange = { refNo = it }, label = { Text("Digital Ref #") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                        }
                        PaymentMethod.Utang -> {
                            OutlinedTextField(
                                value = utangDueDate,
                                onValueChange = { utangDueDate = it },
                                label = { Text("Due Date (YYYY-MM-DD, Optional)") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth()
                            )
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Checkbox(checked = allowOverLimit, onCheckedChange = { allowOverLimit = it })
                                Text("Override credit limit if exceeded", fontSize = 12.sp)
                            }
                        }
                    }
                }

                HorizontalDivider(color = PosColors.Slate200)
                Row(modifier = Modifier.fillMaxWidth().padding(14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { vm.closeCheckout() }, modifier = Modifier.weight(0.35f).heightIn(min = 48.dp)) { Text("Cancel") }
                    Button(
                        onClick = {
                            vm.completeSale(
                                paymentMethod = method,
                                tendered = cashVal,
                                refNo = refNo,
                                seniorId = seniorId,
                                customerId = selectedCustomerId,
                                pointsRedeemedRequested = redemption.pointsUsed,
                                utangDueDate = utangDueDate,
                                allowOverLimit = allowOverLimit,
                                splitCash = splitCash,
                                splitDigitalMethod = splitDigitalMethod
                            )
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = PosColors.Emerald600),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier
                            .weight(0.65f)
                            .heightIn(min = 48.dp)
                            .testTag("chk_confirm_pay_btn")
                    ) {
                        Text("COMPLETE SALE (${PosMath.formatPeso(finalDue)})", fontWeight = FontWeight.ExtraBold)
                    }
                }
            }
        }
    }
}

@Composable
fun ReceiptDialog(vm: PosViewModel) {
    val sale by vm.receiptSale.collectAsStateWithLifecycle()
    val reading by vm.receiptReading.collectAsStateWithLifecycle()
    if (sale == null && reading == null) return

    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val settings by vm.settings.collectAsStateWithLifecycle()
    val btConnected by vm.btPrinterConnected.collectAsStateWithLifecycle()

    val plainText = remember(sale, reading, settings) {
        EscPosPrinter.buildPlainTextReceipt(sale, reading, settings)
    }

    Dialog(onDismissRequest = { vm.dismissReceipt() }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        BackHandler { vm.dismissReceipt() }
        Surface(shape = RoundedCornerShape(20.dp), color = Color.White, modifier = Modifier.fillMaxWidth(0.92f).heightIn(max = 680.dp)) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text(if (sale != null) "Receipt ${sale!!.receiptNo}" else reading!!.title, style = MaterialTheme.typography.titleMedium)
                    IconButton(onClick = { vm.dismissReceipt() }) { Icon(Icons.Rounded.Close, contentDescription = "Close") }
                }

                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = PosColors.Slate50,
                    border = BorderStroke(1.dp, PosColors.Slate200),
                    modifier = Modifier.weight(1f, fill = false).fillMaxWidth()
                ) {
                    Text(
                        text = plainText,
                        fontFamily = FontFamily.Monospace,
                        fontSize = 12.sp,
                        lineHeight = 16.sp,
                        color = PosColors.Slate900,
                        modifier = Modifier.verticalScroll(rememberScrollState()).padding(14.dp)
                    )
                }

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    if (btConnected) {
                        Button(
                            onClick = {
                                scope.launch {
                                    val bytes = EscPosPrinter.buildReceiptBytes(sale = sale, reading = reading, settings = settings)
                                    EscPosPrinter.sendBytes(bytes)
                                        .onSuccess { vm.toast("Sent to Bluetooth Thermal Printer") }
                                        .onFailure { vm.toast(it.message ?: "Print error", ToastType.ERROR) }
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = PosColors.Emerald600),
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(Icons.Rounded.Bluetooth, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Thermal", fontSize = 12.sp)
                        }
                    }
                    OutlinedButton(
                        onClick = {
                            val html = "<html><body style='font-family:monospace;white-space:pre-wrap;font-size:12px;'>$plainText</body></html>"
                            AndroidDeviceBridge.printHtmlReceipt(context, sale?.receiptNo ?: reading?.title ?: "Receipt", html)
                        },
                        modifier = Modifier.weight(1f)
                    ) {
                        Icon(Icons.Rounded.Print, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Print", fontSize = 12.sp)
                    }
                    OutlinedButton(
                        onClick = {
                            AndroidDeviceBridge.copyToClipboard(context, "Receipt", plainText)
                            vm.toast("Copied receipt text")
                        },
                        modifier = Modifier.weight(1f)
                    ) {
                        Icon(Icons.Rounded.ContentCopy, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Copy", fontSize = 12.sp)
                    }
                }

                Button(
                    onClick = {
                        AndroidDeviceBridge.shareTextFile(context, "${sale?.receiptNo ?: "report"}.txt", plainText, "text/plain")
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = PosColors.Slate900),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Rounded.Share, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Share / Save Receipt")
                }
            }
        }
    }
}

@Composable
fun CustomerDisplayScreen(vm: PosViewModel) {
    val visible by vm.flipCustomerDisplay.collectAsStateWithLifecycle()
    if (!visible) return

    val settings by vm.settings.collectAsStateWithLifecycle()
    val cart by vm.cart.collectAsStateWithLifecycle()
    val cartTotals by vm.cartTotals.collectAsStateWithLifecycle()
    val productMap by vm.productMap.collectAsStateWithLifecycle()
    val draft by vm.checkoutLiveDraft.collectAsStateWithLifecycle()
    val lastSale by vm.lastCompletedDisplaySale.collectAsStateWithLifecycle()

    BackHandler { vm.closeFlipCustomerDisplay() }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(PosColors.Slate950)
            .systemBarsPadding()
            .padding(16.dp)
    ) {
        Column(modifier = Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    StoreEmblem(storeIcon = settings.storeIcon, size = 40.dp)
                    Column {
                        Text(settings.storeName, color = Color.White, style = MaterialTheme.typography.titleLarge)
                        Text(settings.customerDisplayGreeting ?: "Salamat sa pagtangkilik! Welcome to our store.", color = PosColors.Emerald500, fontSize = 12.sp)
                    }
                }
                IconButton(onClick = { vm.closeFlipCustomerDisplay() }, modifier = Modifier.testTag("customer_display_close")) {
                    Icon(Icons.Rounded.Close, contentDescription = "Close customer screen", tint = Color.White)
                }
            }

            if (cart.isEmpty() && lastSale != null) {
                Surface(shape = RoundedCornerShape(20.dp), color = PosColors.Emerald700, modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("MARAMING SALAMAT!", color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 22.sp)
                        Spacer(Modifier.height(6.dp))
                        Text("Total Paid: ${PosMath.formatPeso(lastSale!!.grandTotal)}", color = Color.White, fontSize = 18.sp)
                        if (lastSale!!.change > 0.0) {
                            Text("Your Change: ${PosMath.formatPeso(lastSale!!.change)}", color = PosColors.Amber100, fontSize = 24.sp, fontWeight = FontWeight.ExtraBold)
                        }
                    }
                }
            } else {
                LazyColumn(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    items(cart, key = { it.productId }) { line ->
                        val price = PosMath.getLinePrice(line, productMap)
                        Surface(shape = RoundedCornerShape(12.dp), color = PosColors.Slate900) {
                            Row(modifier = Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(line.name, color = Color.White, style = MaterialTheme.typography.titleSmall)
                                    Text("${PosMath.formatQty(line.qty, line.unit)} × ${PosMath.formatPeso(price)}", color = PosColors.Slate300, fontSize = 12.sp)
                                }
                                Text(PosMath.formatPeso(PosMath.lineTotalPeso(price, line.qty)), color = PosColors.Emerald500, style = MaterialTheme.typography.titleMedium)
                            }
                        }
                    }
                }

                if (draft != null && (draft!!.method == PaymentMethod.GCash || (draft!!.method == PaymentMethod.Split && draft!!.splitDigitalMethod == "GCash"))) {
                    val amt = if (draft!!.method == PaymentMethod.GCash) draft!!.finalDue else draft!!.splitDigital
                    MerchantQrCard(qrState = PaymentQr.resolveCheckoutQrState(settings, amt), compact = true)
                }

                Surface(shape = RoundedCornerShape(18.dp), color = PosColors.Emerald600) {
                    Row(modifier = Modifier.fillMaxWidth().padding(18.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Column {
                            Text("TOTAL DUE", color = PosColors.Emerald50, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            if (cartTotals.wholesaleSavings + cartTotals.seniorDiscount > 0) {
                                Text("You saved ${PosMath.formatPeso(cartTotals.wholesaleSavings + cartTotals.seniorDiscount)}!", color = Color.White, fontSize = 12.sp)
                            }
                        }
                        Text(PosMath.formatPeso(draft?.finalDue ?: cartTotals.grandTotal), color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.ExtraBold)
                    }
                }
            }
        }
    }
}
