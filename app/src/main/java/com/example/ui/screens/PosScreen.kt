package com.example.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
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
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Clear
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.ExpandMore
import androidx.compose.material.icons.rounded.FlipToFront
import androidx.compose.material.icons.rounded.PauseCircleOutline
import androidx.compose.material.icons.rounded.QrCodeScanner
import androidx.compose.material.icons.rounded.ReceiptLong
import androidx.compose.material.icons.rounded.Remove
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.ShoppingBasket
import androidx.compose.material.icons.rounded.Undo
import androidx.compose.material.icons.rounded.Verified
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.domain.InventoryFilter
import com.example.domain.PosMath
import com.example.domain.StockAlerts
import com.example.model.CartLine
import com.example.model.CartTotals
import com.example.model.PriceType
import com.example.model.Product
import com.example.model.ScannerMode
import com.example.ui.components.ProductIconBadge
import com.example.ui.components.getCategoryIcon
import com.example.ui.theme.PosColors
import com.example.viewmodel.PosViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PosScreen(
    vm: PosViewModel,
    isWideLayout: Boolean
) {
    val products by vm.products.collectAsStateWithLifecycle()
    val settings by vm.settings.collectAsStateWithLifecycle()
    val cart by vm.cart.collectAsStateWithLifecycle()
    val cartTotals by vm.cartTotals.collectAsStateWithLifecycle()
    val priceMode by vm.priceMode.collectAsStateWithLifecycle()
    val isSeniorPwd by vm.isSeniorPwd.collectAsStateWithLifecycle()
    val posCategory by vm.posCategory.collectAsStateWithLifecycle()
    val posSearch by vm.posSearch.collectAsStateWithLifecycle()
    val heldOrders by vm.heldOrders.collectAsStateWithLifecycle()
    val sales by vm.sales.collectAsStateWithLifecycle()
    val lastVoidable by vm.lastVoidableSale.collectAsStateWithLifecycle()
    val fastMoverIds by vm.fastMoverIds.collectAsStateWithLifecycle()
    val productMap by vm.productMap.collectAsStateWithLifecycle()
    val mobileCartOpen by vm.mobileCartOpen.collectAsStateWithLifecycle()

    val categories = remember(products) {
        val cats = products.map { it.category }.filter { it.isNotBlank() }.distinct()
        listOf("All") + cats
    }

    val filteredProducts = remember(products, posCategory, posSearch, settings.expiryWarnDays) {
        val q = posSearch.trim()
        products.filter { p ->
            if (posCategory != "All" && p.category != posCategory) return@filter false
            if (q.isNotEmpty() && !InventoryFilter.matchesInventorySearch(p, q)) return@filter false
            true
        }
    }

    val cartQtyMap = remember(cart) {
        cart.groupBy { it.productId }.mapValues { (_, lines) -> lines.sumOf { it.qty } }
    }

    val itemCountText = remember(cart) {
        val count = cart.sumOf { if (it.unit == "kg") 1.0 else it.qty }
        if (count % 1.0 == 0.0) "${count.toInt()} item(s)" else "${PosMath.round3(count)} item(s)"
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Row(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier
                    .weight(if (isWideLayout) 0.62f else 1f)
                    .fillMaxHeight()
            ) {
                // Search & Barcode bar
                Surface(color = Color.White, shadowElevation = 1.dp) {
                    Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp)) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            OutlinedTextField(
                                value = posSearch,
                                onValueChange = { vm.setPosSearch(it) },
                                placeholder = { Text("Search or type 5*barcode", fontSize = 13.sp, maxLines = 1) },
                                leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = "Search") },
                                trailingIcon = {
                                    if (posSearch.isNotEmpty()) {
                                        IconButton(onClick = { vm.setPosSearch("") }) {
                                            Icon(Icons.Rounded.Clear, contentDescription = "Clear search")
                                        }
                                    }
                                },
                                singleLine = true,
                                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                                keyboardActions = KeyboardActions(onSearch = { vm.onPosSearchSubmit(posSearch) }),
                                shape = RoundedCornerShape(12.dp),
                                colors = OutlinedTextFieldDefaults.colors(
                                    unfocusedContainerColor = PosColors.Slate50,
                                    focusedContainerColor = Color.White
                                ),
                                modifier = Modifier
                                    .weight(1f)
                                    .testTag("pos_search_input")
                            )

                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = PosColors.Slate900,
                                modifier = Modifier
                                    .size(48.dp)
                                    .clip(RoundedCornerShape(12.dp))
                                    .clickable { vm.openScanner(ScannerMode.pos, continuous = true) }
                                    .testTag("pos_scan_button")
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(Icons.Rounded.QrCodeScanner, contentDescription = "Scan Barcode", tint = Color.White)
                                }
                            }
                        }

                        Spacer(Modifier.height(8.dp))

                        // Price Mode + Quick Actions Row
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            FilterChip(
                                selected = priceMode == PriceType.retail,
                                onClick = { vm.setPriceMode(PriceType.retail) },
                                label = { Text("Retail", fontWeight = FontWeight.Bold, fontSize = 12.sp) },
                                colors = FilterChipDefaults.filterChipColors(
                                    selectedContainerColor = PosColors.Emerald600,
                                    selectedLabelColor = Color.White
                                ),
                                modifier = Modifier.testTag("pos_mode_retail")
                            )
                            FilterChip(
                                selected = priceMode == PriceType.wholesale,
                                onClick = { vm.setPriceMode(PriceType.wholesale) },
                                label = { Text("Wholesale", fontWeight = FontWeight.Bold, fontSize = 12.sp) },
                                colors = FilterChipDefaults.filterChipColors(
                                    selectedContainerColor = PosColors.Indigo600,
                                    selectedLabelColor = Color.White
                                ),
                                modifier = Modifier.testTag("pos_mode_wholesale")
                            )
                            FilterChip(
                                selected = heldOrders.isNotEmpty(),
                                onClick = { vm.openHeldModal() },
                                leadingIcon = { Icon(Icons.Rounded.PauseCircleOutline, contentDescription = null, modifier = Modifier.size(16.dp)) },
                                label = { Text("Parked (${heldOrders.size})", fontSize = 12.sp) },
                                modifier = Modifier.testTag("pos_quick_parked")
                            )
                            if (sales.isNotEmpty()) {
                                val latestSale = sales.lastOrNull()
                                if (latestSale != null) {
                                    FilterChip(
                                        selected = false,
                                        onClick = { vm.openReceipt(latestSale) },
                                        leadingIcon = { Icon(Icons.Rounded.ReceiptLong, contentDescription = null, modifier = Modifier.size(16.dp)) },
                                        label = { Text("Last Receipt", fontSize = 12.sp) },
                                        modifier = Modifier.testTag("pos_quick_last_receipt")
                                    )
                                }
                            }
                            if (lastVoidable != null) {
                                FilterChip(
                                    selected = false,
                                    onClick = { lastVoidable?.let { vm.openVoidSale(it) } },
                                    leadingIcon = { Icon(Icons.Rounded.Undo, contentDescription = null, modifier = Modifier.size(16.dp), tint = PosColors.Rose600) },
                                    label = { Text("Void Last", fontSize = 12.sp, color = PosColors.Rose700) },
                                    modifier = Modifier.testTag("pos_quick_void")
                                )
                            }
                            FilterChip(
                                selected = false,
                                onClick = { vm.openFlipCustomerDisplay() },
                                leadingIcon = { Icon(Icons.Rounded.FlipToFront, contentDescription = null, modifier = Modifier.size(16.dp)) },
                                label = { Text("Customer View", fontSize = 12.sp) },
                                modifier = Modifier.testTag("pos_quick_customer_screen")
                            )
                        }

                        // Category Chips Bar
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            categories.take(6).forEach { cat ->
                                FilterChip(
                                    selected = posCategory == cat,
                                    onClick = { vm.setPosCategory(cat) },
                                    leadingIcon = {
                                        Icon(
                                            getCategoryIcon(cat),
                                            contentDescription = null,
                                            modifier = Modifier.size(15.dp)
                                        )
                                    },
                                    label = { Text(cat, fontSize = 12.sp, maxLines = 1) },
                                    colors = FilterChipDefaults.filterChipColors(
                                        selectedContainerColor = PosColors.Slate900,
                                        selectedLabelColor = Color.White,
                                        selectedLeadingIconColor = PosColors.Emerald500
                                    ),
                                    modifier = Modifier.testTag("pos_cat_${cat.lowercase().replace(" ", "_")}")
                                )
                            }
                            if (categories.size > 6) {
                                OutlinedButton(
                                    onClick = { vm.openCategorySheet() },
                                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                                    shape = RoundedCornerShape(10.dp),
                                    modifier = Modifier
                                        .height(34.dp)
                                        .testTag("pos_cat_more_button")
                                ) {
                                    Text("More", fontSize = 12.sp)
                                    Icon(Icons.Rounded.ExpandMore, contentDescription = "More categories", modifier = Modifier.size(16.dp))
                                }
                            }
                        }
                    }
                }

                // Product Grid
                BoxWithConstraints(modifier = Modifier.weight(1f).fillMaxWidth()) {
                    val cols = when {
                        maxWidth >= 700.dp -> 4
                        maxWidth >= 480.dp -> 3
                        else -> 2
                    }
                    if (filteredProducts.isEmpty()) {
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(24.dp)) {
                                Icon(Icons.Rounded.ShoppingBasket, contentDescription = null, tint = PosColors.Slate300, modifier = Modifier.size(48.dp))
                                Spacer(Modifier.height(8.dp))
                                Text("No matching products", style = MaterialTheme.typography.titleMedium, color = PosColors.Slate600)
                                Text("Try another keyword or clear category filters", style = MaterialTheme.typography.bodySmall, color = PosColors.Slate500)
                            }
                        }
                    } else {
                        LazyVerticalGrid(
                            columns = GridCells.Fixed(cols),
                            contentPadding = PaddingValues(
                                start = 12.dp,
                                end = 12.dp,
                                top = 12.dp,
                                bottom = if (!isWideLayout && cart.isNotEmpty()) 96.dp else 16.dp
                            ),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier.fillMaxSize()
                        ) {
                            items(filteredProducts, key = { it.id }) { prod ->
                                val inCartQty = cartQtyMap[prod.id] ?: 0.0
                                val isFast = prod.id in fastMoverIds
                                PosProductCard(
                                    product = prod,
                                    priceMode = priceMode,
                                    inCartQty = inCartQty,
                                    isFastMover = isFast,
                                    globalLowThreshold = settings.lowStockThreshold,
                                    expiryWarnDays = settings.expiryWarnDays,
                                    onClick = { vm.onProductClick(prod) }
                                )
                            }
                        }
                    }
                }
            }

            // Wide Screen Right Cart Column
            if (isWideLayout) {
                Surface(
                    color = Color.White,
                    shadowElevation = 6.dp,
                    modifier = Modifier
                        .weight(0.38f)
                        .fillMaxHeight()
                ) {
                    CartPaneContent(
                        cart = cart,
                        cartTotals = cartTotals,
                        isSeniorPwd = isSeniorPwd,
                        productMap = productMap,
                        onToggleSenior = { vm.toggleSeniorPwd(it) },
                        onChangeQty = { pid, d -> vm.changeCartQty(pid, d) },
                        onSetQty = { pid, q -> vm.setCartQty(pid, q) },
                        onSetPriceType = { pid, pt -> vm.setLinePriceType(pid, pt) },
                        onUnlockWholesale = { pid, min -> vm.unlockWholesaleLine(pid, min) },
                        onRemoveLine = { vm.removeCartLine(it) },
                        onParkOrder = { vm.openHoldModal() },
                        onClearCart = { vm.askClearCart() },
                        onCheckout = { vm.openCheckout() }
                    )
                }
            }
        }

        // Compact Screen Sticky Floating Cart Summary Bar
        if (!isWideLayout && cart.isNotEmpty()) {
            Surface(
                color = PosColors.Slate900,
                shape = RoundedCornerShape(16.dp),
                shadowElevation = 8.dp,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 10.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .clickable { vm.openMobileCart() }
                    .testTag("pos_mobile_cart_bar")
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Surface(shape = RoundedCornerShape(8.dp), color = PosColors.Emerald600) {
                            Text(
                                text = itemCountText,
                                color = Color.White,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                            )
                        }
                        Column {
                            Text("View Basket", color = PosColors.Slate300, fontSize = 11.sp)
                            Text(PosMath.formatPeso(cartTotals.grandTotal), color = Color.White, style = MaterialTheme.typography.titleMedium)
                        }
                    }

                    Button(
                        onClick = { vm.openCheckout() },
                        colors = ButtonDefaults.buttonColors(containerColor = PosColors.Emerald500, contentColor = PosColors.Slate950),
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier
                            .heightIn(min = 48.dp)
                            .testTag("pos_mobile_checkout_btn")
                    ) {
                        Text("Charge", fontWeight = FontWeight.ExtraBold)
                    }
                }
            }
        }
    }

    if (!isWideLayout && mobileCartOpen) {
        ModalBottomSheet(
            onDismissRequest = { vm.closeMobileCart() },
            containerColor = Color.White
        ) {
            Box(modifier = Modifier.fillMaxWidth().heightIn(max = 580.dp)) {
                CartPaneContent(
                    cart = cart,
                    cartTotals = cartTotals,
                    isSeniorPwd = isSeniorPwd,
                    productMap = productMap,
                    onToggleSenior = { vm.toggleSeniorPwd(it) },
                    onChangeQty = { pid, d -> vm.changeCartQty(pid, d) },
                    onSetQty = { pid, q -> vm.setCartQty(pid, q) },
                    onSetPriceType = { pid, pt -> vm.setLinePriceType(pid, pt) },
                    onUnlockWholesale = { pid, min -> vm.unlockWholesaleLine(pid, min) },
                    onRemoveLine = { vm.removeCartLine(it) },
                    onParkOrder = { vm.closeMobileCart(); vm.openHoldModal() },
                    onClearCart = { vm.askClearCart() },
                    onCheckout = { vm.closeMobileCart(); vm.openCheckout() }
                )
            }
        }
    }
}

@Composable
private fun PosProductCard(
    product: Product,
    priceMode: PriceType,
    inCartQty: Double,
    isFastMover: Boolean,
    globalLowThreshold: Double,
    expiryWarnDays: Int,
    onClick: () -> Unit
) {
    val exp = remember(product.expiry, expiryWarnDays) { PosMath.expiryInfo(product, expiryWarnDays) }
    val isExpired = exp.status == PosMath.ExpiryState.EXPIRED
    val isOut = product.stock <= 0.0
    val effLow = StockAlerts.getEffectiveLowStockThreshold(product, globalLowThreshold)
    val isLow = !isOut && product.stock <= effLow
    val showWhs = priceMode == PriceType.wholesale && product.wholesalePrice > 0 && product.wholesalePrice < product.retailPrice
    val displayPrice = if (showWhs) product.wholesalePrice else product.retailPrice
    val unavailable = isOut || isExpired

    Surface(
        shape = RoundedCornerShape(14.dp),
        color = Color.White,
        border = BorderStroke(
            width = if (inCartQty > 0.0) 2.dp else 1.dp,
            color = if (inCartQty > 0.0) PosColors.Emerald500 else PosColors.Slate200
        ),
        shadowElevation = 1.dp,
        modifier = Modifier
            .fillMaxWidth()
            .alpha(if (unavailable) 0.55f else 1f)
            .clip(RoundedCornerShape(14.dp))
            .clickable(enabled = !unavailable, onClick = onClick)
            .testTag("pos_product_${product.id}")
    ) {
        Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                ProductIconBadge(product = product, size = 34.dp)
                Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    if (inCartQty > 0.0) {
                        Surface(shape = RoundedCornerShape(8.dp), color = PosColors.Emerald600) {
                            Text(
                                text = "×${PosMath.formatQty(inCartQty)}",
                                color = Color.White,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.ExtraBold,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                            )
                        }
                    } else if (isFastMover) {
                        Surface(shape = RoundedCornerShape(6.dp), color = PosColors.Amber50) {
                            Text("FAST", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = PosColors.Amber700, modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp))
                        }
                    }
                    if (isExpired) {
                        Surface(shape = RoundedCornerShape(6.dp), color = PosColors.Rose100) {
                            Text("EXPIRED", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = PosColors.Rose700, modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp))
                        }
                    } else if (isOut) {
                        Surface(shape = RoundedCornerShape(6.dp), color = PosColors.Rose100) {
                            Text("OUT", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = PosColors.Rose700, modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp))
                        }
                    } else if (isLow) {
                        Surface(shape = RoundedCornerShape(6.dp), color = PosColors.Amber100) {
                            Text("LOW ${PosMath.formatQty(product.stock)}", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = PosColors.Amber700, modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp))
                        }
                    }
                }
            }

            Text(
                text = product.name,
                style = MaterialTheme.typography.titleSmall,
                color = PosColors.Slate900,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                minLines = 2
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Bottom
            ) {
                Column {
                    Text(
                        text = PosMath.formatPeso(displayPrice),
                        style = MaterialTheme.typography.titleMedium,
                        color = if (showWhs) PosColors.Indigo700 else PosColors.Emerald700
                    )
                    Text(
                        text = "per ${product.unit}" + if (product.wholesalePrice < product.retailPrice) " · min ${product.wholesaleMinQty}" else "",
                        style = MaterialTheme.typography.bodySmall,
                        color = PosColors.Slate500
                    )
                }
                Text(
                    text = "${PosMath.formatQty(product.stock)} left",
                    fontSize = 10.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = PosColors.Slate500
                )
            }
        }
    }
}

@Composable
private fun CartPaneContent(
    cart: List<CartLine>,
    cartTotals: CartTotals,
    isSeniorPwd: Boolean,
    productMap: Map<String, Product>,
    onToggleSenior: (Boolean) -> Unit,
    onChangeQty: (String, Double) -> Unit,
    onSetQty: (String, String) -> Unit,
    onSetPriceType: (String, PriceType) -> Unit,
    onUnlockWholesale: (String, Int) -> Unit,
    onRemoveLine: (String) -> Unit,
    onParkOrder: () -> Unit,
    onClearCart: () -> Unit,
    onCheckout: () -> Unit
) {
    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column {
                Text("Current Basket", style = MaterialTheme.typography.titleMedium)
                Text("${cart.size} line(s)", style = MaterialTheme.typography.bodySmall, color = PosColors.Slate500)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                TextButton(
                    onClick = onParkOrder,
                    enabled = cart.isNotEmpty(),
                    modifier = Modifier.testTag("cart_park_button")
                ) {
                    Icon(Icons.Rounded.PauseCircleOutline, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Park")
                }
                IconButton(
                    onClick = onClearCart,
                    enabled = cart.isNotEmpty(),
                    modifier = Modifier
                        .size(48.dp)
                        .testTag("cart_clear_button")
                ) {
                    Icon(Icons.Rounded.DeleteOutline, contentDescription = "Clear Basket", tint = PosColors.Rose600)
                }
            }
        }
        HorizontalDivider(color = PosColors.Slate200)

        if (cart.isEmpty()) {
            Box(modifier = Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(24.dp)) {
                    Icon(Icons.Rounded.ShoppingBasket, contentDescription = null, tint = PosColors.Slate300, modifier = Modifier.size(44.dp))
                    Spacer(Modifier.height(8.dp))
                    Text("Basket is empty", style = MaterialTheme.typography.titleSmall, color = PosColors.Slate600)
                    Text("Tap items or scan barcodes to ring up", style = MaterialTheme.typography.bodySmall, color = PosColors.Slate500)
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(cart, key = { it.productId }) { line ->
                    val pricing = PosMath.linePricing(line, productMap)
                    val unitPrice = PosMath.getLinePrice(line, productMap)
                    val lineTotal = PosMath.lineTotalPeso(unitPrice, line.qty)
                    val isWhs = PosMath.isWholesaleLine(line, productMap)
                    val whsBlock = PosMath.wholesaleBlock(line, productMap)

                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = PosColors.Slate50,
                        border = BorderStroke(1.dp, PosColors.Slate200)
                    ) {
                        Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.Top
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(line.name, style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                    Text(
                                        "${PosMath.formatPeso(unitPrice)} / ${line.unit}" + if (isWhs) " (Wholesale)" else "",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = if (isWhs) PosColors.Indigo700 else PosColors.Slate600
                                    )
                                }
                                Text(
                                    PosMath.formatPeso(lineTotal),
                                    style = MaterialTheme.typography.titleSmall,
                                    color = PosColors.Slate900
                                )
                            }

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Surface(
                                        shape = RoundedCornerShape(8.dp),
                                        color = Color.White,
                                        border = BorderStroke(1.dp, PosColors.Slate300),
                                        modifier = Modifier
                                            .size(38.dp)
                                            .clip(RoundedCornerShape(8.dp))
                                            .clickable { onChangeQty(line.productId, -1.0) }
                                            .testTag("cart_dec_${line.productId}")
                                    ) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(Icons.Rounded.Remove, contentDescription = "Decrease quantity", modifier = Modifier.size(18.dp))
                                        }
                                    }

                                    var qtyInput by remember(line.qty) { mutableStateOf(PosMath.formatQty(line.qty)) }
                                    OutlinedTextField(
                                        value = qtyInput,
                                        onValueChange = {
                                            qtyInput = it
                                            if (it.toDoubleOrNull() != null && !it.endsWith(".")) {
                                                onSetQty(line.productId, it)
                                            }
                                        },
                                        singleLine = true,
                                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                        textStyle = MaterialTheme.typography.labelMedium,
                                        modifier = Modifier.width(66.dp)
                                    )

                                    Surface(
                                        shape = RoundedCornerShape(8.dp),
                                        color = Color.White,
                                        border = BorderStroke(1.dp, PosColors.Slate300),
                                        modifier = Modifier
                                            .size(38.dp)
                                            .clip(RoundedCornerShape(8.dp))
                                            .clickable { onChangeQty(line.productId, 1.0) }
                                            .testTag("cart_inc_${line.productId}")
                                    ) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(Icons.Rounded.Add, contentDescription = "Increase quantity", modifier = Modifier.size(18.dp))
                                        }
                                    }
                                }

                                Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                                    if (pricing.wholesale > 0.0 && pricing.wholesale < pricing.retail) {
                                        if (whsBlock == PosMath.WholesaleBlockReason.QTY) {
                                            val needed = PosMath.round3(pricing.minQty - line.qty)
                                            TextButton(
                                                onClick = { onUnlockWholesale(line.productId, pricing.minQty) },
                                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp),
                                                modifier = Modifier.testTag("cart_unlock_whs_${line.productId}")
                                            ) {
                                                Text("+${PosMath.formatQty(needed)} → Whs", fontSize = 11.sp, color = PosColors.Indigo700)
                                            }
                                        } else if (whsBlock == null) {
                                            FilterChip(
                                                selected = isWhs,
                                                onClick = {
                                                    onSetPriceType(
                                                        line.productId,
                                                        if (isWhs) PriceType.retail else PriceType.wholesale
                                                    )
                                                },
                                                label = { Text(if (isWhs) "Wholesale" else "Retail", fontSize = 10.sp) }
                                            )
                                        }
                                    }
                                    IconButton(onClick = { onRemoveLine(line.productId) }) {
                                        Icon(Icons.Rounded.DeleteOutline, contentDescription = "Remove line", tint = PosColors.Slate500, modifier = Modifier.size(18.dp))
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        HorizontalDivider(color = PosColors.Slate200)
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(PosColors.Slate50)
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(Icons.Rounded.Verified, contentDescription = null, tint = PosColors.Indigo600, modifier = Modifier.size(16.dp))
                    Column {
                        Text("Senior / PWD 5% Basic Needs", style = MaterialTheme.typography.labelMedium)
                        if (isSeniorPwd) {
                            Text(
                                "${cartTotals.scKinds} eligible SKU(s) · Cap ${PosMath.formatPeso(cartTotals.seniorCap)}",
                                style = MaterialTheme.typography.bodySmall,
                                color = PosColors.Slate500
                            )
                        }
                    }
                }
                Switch(
                    checked = isSeniorPwd,
                    onCheckedChange = onToggleSenior,
                    modifier = Modifier.testTag("cart_sc_pwd_switch")
                )
            }

            if (cartTotals.wholesaleSavings > 0.0) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Wholesale Savings", style = MaterialTheme.typography.bodySmall, color = PosColors.Indigo700)
                    Text("-${PosMath.formatPeso(cartTotals.wholesaleSavings)}", style = MaterialTheme.typography.labelMedium, color = PosColors.Indigo700)
                }
            }
            if (cartTotals.seniorDiscount > 0.0) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("SC/PWD 5% Discount", style = MaterialTheme.typography.bodySmall, color = PosColors.Emerald700)
                    Text("-${PosMath.formatPeso(cartTotals.seniorDiscount)}", style = MaterialTheme.typography.labelMedium, color = PosColors.Emerald700)
                }
            }

            Button(
                onClick = onCheckout,
                enabled = cart.isNotEmpty(),
                colors = ButtonDefaults.buttonColors(containerColor = PosColors.Emerald600),
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 52.dp)
                    .testTag("cart_checkout_button")
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("CHARGE ORDER", fontWeight = FontWeight.ExtraBold)
                    Text(PosMath.formatPeso(cartTotals.grandTotal), fontWeight = FontWeight.ExtraBold, fontSize = 17.sp)
                }
            }
        }
    }
}
