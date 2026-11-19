package com.example.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.DeleteSweep
import androidx.compose.material.icons.filled.PauseCircleOutline
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Restore
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.domain.PosMath
import com.example.domain.StockAlerts
import com.example.model.CartLine
import com.example.model.PriceType
import com.example.model.Product
import com.example.ui.components.ProductCategoryBadge
import com.example.ui.theme.AmberWarn
import com.example.ui.theme.EmeraldDark
import com.example.ui.theme.EmeraldLightBg
import com.example.ui.theme.EmeraldPrimary
import com.example.ui.theme.IndigoAccent
import com.example.ui.theme.RoseDanger
import com.example.ui.theme.SlateBorder
import com.example.ui.theme.SlateMuted
import com.example.ui.theme.SlateSurface
import com.example.ui.theme.SlateText
import com.example.viewmodel.PosUiState
import com.example.viewmodel.PosViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PosScreen(state: PosUiState, vm: PosViewModel, isWide: Boolean) {
    var mobileCartSheetOpen by remember { mutableStateOf(false) }

    val categories = remember(state.products) {
        listOf("All") + state.products.map { it.category }.distinct().sorted()
    }
    val filteredProducts = remember(state.products, state.posSearch, state.posCategory) {
        val q = state.posSearch.trim().lowercase()
        state.products.filter { p ->
            val matchCat = state.posCategory == "All" || p.category == state.posCategory
            val matchQ = q.isEmpty() || p.name.lowercase().contains(q) || p.barcode.lowercase().contains(q)
            matchCat && matchQ
        }
    }

    Row(modifier = Modifier.fillMaxSize().background(SlateSurface)) {
        Column(modifier = Modifier.weight(1f).fillMaxHeight()) {
            // Search & Scanner bar
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color.White)
                    .padding(horizontal = 12.dp, vertical = 10.dp)
            ) {
                OutlinedTextField(
                    value = state.posSearch,
                    onValueChange = vm::setPosSearch,
                    placeholder = { Text("Search product or barcode…", fontSize = 13.sp) },
                    leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                    trailingIcon = {
                        if (state.posSearch.isNotEmpty()) {
                            IconButton(onClick = { vm.setPosSearch("") }) {
                                Icon(Icons.Filled.Clear, contentDescription = "Clear search")
                            }
                        }
                    },
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.weight(1f)
                )
                Button(
                    onClick = { vm.openScanner("pos") },
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = IndigoAccent),
                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 14.dp)
                ) {
                    Icon(Icons.Filled.QrCodeScanner, contentDescription = "Scan Barcode")
                    Spacer(Modifier.width(6.dp))
                    Text("Scan", fontWeight = FontWeight.Bold)
                }
            }

            // Categories
            Row(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color.White)
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 12.dp, vertical = 6.dp)
            ) {
                categories.forEach { cat ->
                    FilterChip(
                        selected = state.posCategory == cat,
                        onClick = { vm.setPosCategory(cat) },
                        label = { Text(cat, fontSize = 12.sp) }
                    )
                }
            }
            HorizontalDivider(color = SlateBorder)

            // Product Grid
            LazyVerticalGrid(
                columns = GridCells.Adaptive(minSize = 156.dp),
                contentPadding = PaddingValues(12.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.weight(1f).fillMaxWidth()
            ) {
                items(filteredProducts, key = { it.id }) { p ->
                    val out = StockAlerts.isOutOfStock(p)
                    val low = StockAlerts.isLowStock(p, state.settings)
                    val inCartQty = state.cart.firstOrNull { it.productId == p.id }?.qty ?: 0.0
                    ProductQuickCard(
                        product = p,
                        priceMode = state.priceMode,
                        out = out,
                        low = low,
                        inCartQty = inCartQty,
                        onClick = { vm.addToCart(p, 1.0) }
                    )
                }
            }

            // Compact Cart Sticky Footer (mobile / narrow screens)
            if (!isWide) {
                Surface(
                    color = Color.White,
                    shadowElevation = 8.dp,
                    border = BorderStroke(1.dp, SlateBorder),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp)
                    ) {
                        Column(modifier = Modifier.weight(1f).clickable { mobileCartSheetOpen = true }) {
                            Text(
                                "${state.cart.size} items • Tap to edit cart",
                                fontSize = 11.sp,
                                color = SlateMuted,
                                fontWeight = FontWeight.SemiBold
                            )
                            Text(
                                PosMath.formatPeso(state.cartTotals.grandTotal),
                                fontSize = 19.sp,
                                fontWeight = FontWeight.ExtraBold,
                                fontFamily = FontFamily.Monospace,
                                color = EmeraldDark
                            )
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(
                                onClick = { mobileCartSheetOpen = true },
                                shape = RoundedCornerShape(10.dp)
                            ) {
                                Icon(Icons.Filled.ShoppingCart, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("Cart (${state.cart.size})")
                            }
                            Button(
                                onClick = { vm.openCheckout() },
                                enabled = state.cart.isNotEmpty(),
                                colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary),
                                shape = RoundedCornerShape(10.dp)
                            ) {
                                Text("Charge", fontWeight = FontWeight.ExtraBold)
                            }
                        }
                    }
                }
            }
        }

        // Tablet / Wide Right Cart Pane
        if (isWide) {
            Surface(
                color = Color.White,
                border = BorderStroke(1.dp, SlateBorder),
                modifier = Modifier.width(360.dp).fillMaxHeight()
            ) {
                CartPanelContent(state = state, vm = vm)
            }
        }
    }

    if (mobileCartSheetOpen && !isWide) {
        ModalBottomSheet(onDismissRequest = { mobileCartSheetOpen = false }) {
            Box(modifier = Modifier.fillMaxWidth().height(540.dp)) {
                CartPanelContent(
                    state = state,
                    vm = vm,
                    onCloseAfterAction = { mobileCartSheetOpen = false }
                )
            }
        }
    }
}

@Composable
private fun ProductQuickCard(
    product: Product,
    priceMode: PriceType,
    out: Boolean,
    low: Boolean,
    inCartQty: Double,
    onClick: () -> Unit
) {
    val activePrice = if (priceMode == PriceType.wholesale && product.wholesalePrice > 0) {
        product.wholesalePrice
    } else {
        product.retailPrice
    }
    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = if (out) Color(0xFFF8FAFC) else Color.White),
        border = BorderStroke(if (inCartQty > 0) 1.5.dp else 1.dp, if (inCartQty > 0) EmeraldPrimary else SlateBorder),
        modifier = Modifier.fillMaxWidth().clickable(enabled = !out) { onClick() }
    ) {
        Column(modifier = Modifier.padding(11.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth()
            ) {
                ProductCategoryBadge(category = product.category, size = 34.dp)
                if (inCartQty > 0) {
                    Surface(color = EmeraldPrimary, shape = RoundedCornerShape(8.dp)) {
                        Text(
                            PosMath.formatQty(inCartQty),
                            color = Color.White,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.ExtraBold,
                            modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp)
                        )
                    }
                } else {
                    val stockColor = when {
                        out -> RoseDanger
                        low -> AmberWarn
                        else -> SlateMuted
                    }
                    Text(
                        if (out) "OUT" else PosMath.formatQty(product.stock, product.unit),
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = stockColor
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
            Text(
                product.name,
                fontWeight = FontWeight.Bold,
                fontSize = 13.sp,
                color = if (out) SlateMuted else SlateText,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                minLines = 2
            )
            Spacer(Modifier.height(6.dp))
            Row(
                verticalAlignment = Alignment.Bottom,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    PosMath.formatPeso(activePrice),
                    fontSize = 16.sp,
                    fontWeight = FontWeight.ExtraBold,
                    fontFamily = FontFamily.Monospace,
                    color = if (out) SlateMuted else EmeraldDark
                )
                if (product.wholesalePrice > 0 && product.wholesalePrice < product.retailPrice) {
                    Text(
                        "WS ≥${PosMath.formatQty(product.wholesaleMinQty)}",
                        fontSize = 10.sp,
                        color = IndigoAccent,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }
    }
}

@Composable
private fun CartPanelContent(
    state: PosUiState,
    vm: PosViewModel,
    onCloseAfterAction: () -> Unit = {}
) {
    val totals = state.cartTotals
    val pMap = state.productMap

    Column(modifier = Modifier.fillMaxSize().padding(12.dp)) {
        // Header + Hold / Recall / Clear
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Current Order (${state.cart.size})", fontWeight = FontWeight.ExtraBold, fontSize = 16.sp)
            Row {
                IconButton(onClick = { vm.setHoldCartOpen(true) }, enabled = state.cart.isNotEmpty()) {
                    Icon(Icons.Filled.PauseCircleOutline, contentDescription = "Park order")
                }
                IconButton(onClick = { vm.setHeldOrdersOpen(true) }) {
                    Icon(Icons.Filled.Restore, contentDescription = "Recall parked (${state.heldOrders.size})")
                }
                IconButton(onClick = { vm.clearCart() }, enabled = state.cart.isNotEmpty()) {
                    Icon(Icons.Filled.DeleteSweep, contentDescription = "Clear cart", tint = RoseDanger)
                }
            }
        }

        // Retail vs Wholesale + SC/PWD toggle
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
            FilterChip(
                selected = state.priceMode == PriceType.retail,
                onClick = { vm.togglePriceMode(PriceType.retail) },
                label = { Text("Retail", fontSize = 12.sp) },
                modifier = Modifier.weight(1f)
            )
            FilterChip(
                selected = state.priceMode == PriceType.wholesale,
                onClick = { vm.togglePriceMode(PriceType.wholesale) },
                label = { Text("Wholesale", fontSize = 12.sp) },
                modifier = Modifier.weight(1f)
            )
        }

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text("SC / PWD 5% Discount", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                Text("Applies to eligible PH basic necessities", fontSize = 10.sp, color = SlateMuted)
            }
            Switch(checked = state.isSeniorPwd, onCheckedChange = vm::toggleSeniorPwd)
        }
        if (state.isSeniorPwd) {
            OutlinedTextField(
                value = state.seniorId,
                onValueChange = vm::setSeniorId,
                label = { Text("OSCA / PWD ID #", fontSize = 11.sp) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(bottom = 6.dp)
            )
        }

        HorizontalDivider(color = SlateBorder)

        if (state.cart.isEmpty()) {
            Box(contentAlignment = Alignment.Center, modifier = Modifier.weight(1f).fillMaxWidth()) {
                Text("Tap a product or scan a barcode to start", fontSize = 13.sp, color = SlateMuted)
            }
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(8.dp),
                contentPadding = PaddingValues(vertical = 8.dp),
                modifier = Modifier.weight(1f).fillMaxWidth()
            ) {
                items(state.cart, key = { it.productId }) { line ->
                    CartLineRow(
                        line = line,
                        effectivePrice = PosMath.getLinePrice(line, pMap),
                        isWs = PosMath.isWholesaleLine(line, pMap),
                        wsBlock = PosMath.wholesaleBlock(line, pMap),
                        onDec = { vm.updateCartQty(line.productId, line.qty - 1.0) },
                        onInc = { vm.updateCartQty(line.productId, line.qty + 1.0) },
                        onToggleType = { vm.toggleLinePriceType(line.productId) }
                    )
                }
            }
        }

        HorizontalDivider(color = SlateBorder)
        Spacer(Modifier.height(8.dp))

        Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
            Text("Subtotal", fontSize = 12.sp, color = SlateMuted)
            Text(PosMath.formatPeso(totals.retailSubtotal), fontSize = 12.sp, fontFamily = FontFamily.Monospace)
        }
        if (totals.wholesaleSavings > 0.0) {
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Text("Wholesale Savings", fontSize = 12.sp, color = IndigoAccent)
                Text("-${PosMath.formatPeso(totals.wholesaleSavings)}", fontSize = 12.sp, fontFamily = FontFamily.Monospace, color = IndigoAccent)
            }
        }
        if (totals.seniorDiscount > 0.0) {
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Text("SC/PWD 5%${if (totals.seniorCapped) " (Capped)" else ""}", fontSize = 12.sp, color = EmeraldDark)
                Text("-${PosMath.formatPeso(totals.seniorDiscount)}", fontSize = 12.sp, fontFamily = FontFamily.Monospace, color = EmeraldDark)
            }
        }
        Spacer(Modifier.height(4.dp))
        Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
            Text("Grand Total", fontSize = 16.sp, fontWeight = FontWeight.ExtraBold)
            Text(
                PosMath.formatPeso(totals.grandTotal),
                fontSize = 20.sp,
                fontWeight = FontWeight.ExtraBold,
                fontFamily = FontFamily.Monospace,
                color = EmeraldDark
            )
        }
        Spacer(Modifier.height(8.dp))
        Button(
            onClick = {
                onCloseAfterAction()
                vm.openCheckout()
            },
            enabled = state.cart.isNotEmpty(),
            colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary),
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth().height(48.dp)
        ) {
            Text("Charge ${PosMath.formatPeso(totals.grandTotal)}", fontSize = 15.sp, fontWeight = FontWeight.ExtraBold)
        }
    }
}

@Composable
private fun CartLineRow(
    line: CartLine,
    effectivePrice: Double,
    isWs: Boolean,
    wsBlock: PosMath.WholesaleBlockReason?,
    onDec: () -> Unit,
    onInc: () -> Unit,
    onToggleType: () -> Unit
) {
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = Color(0xFFF8FAFC),
        border = BorderStroke(1.dp, SlateBorder),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(8.dp)
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(line.name, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        "${PosMath.formatPeso(effectivePrice)} / ${line.unit}",
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace,
                        color = SlateMuted
                    )
                    Surface(
                        color = if (isWs) Color(0xFFEEF2FF) else Color(0xFFF1F5F9),
                        shape = RoundedCornerShape(4.dp),
                        modifier = Modifier.clickable { onToggleType() }
                    ) {
                        Text(
                            if (isWs) "WS" else "RT",
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (isWs) IndigoAccent else SlateMuted,
                            modifier = Modifier.padding(horizontal = 5.dp, vertical = 1.dp)
                        )
                    }
                    if (line.priceType == PriceType.wholesale && wsBlock == PosMath.WholesaleBlockReason.QTY) {
                        Text("Need ≥${PosMath.formatQty(line.wholesaleMinQty)}", fontSize = 9.sp, color = AmberWarn)
                    }
                }
            }
            IconButton(onClick = onDec, modifier = Modifier.size(30.dp)) {
                Icon(Icons.Filled.Remove, contentDescription = "Decrease qty", modifier = Modifier.size(16.dp))
            }
            Text(
                PosMath.formatQty(line.qty),
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.Bold,
                fontSize = 13.sp,
                modifier = Modifier.padding(horizontal = 4.dp)
            )
            IconButton(onClick = onInc, modifier = Modifier.size(30.dp)) {
                Icon(Icons.Filled.Add, contentDescription = "Increase qty", modifier = Modifier.size(16.dp))
            }
            Spacer(Modifier.width(6.dp))
            Text(
                PosMath.formatPeso(PosMath.lineTotalPeso(effectivePrice, line.qty)),
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 13.sp,
                color = SlateText
            )
        }
    }
}
