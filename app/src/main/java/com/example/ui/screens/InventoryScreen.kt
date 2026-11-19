package com.example.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.AutoGraph
import androidx.compose.material.icons.rounded.Clear
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.EventBusy
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.Inventory
import androidx.compose.material.icons.rounded.Layers
import androidx.compose.material.icons.rounded.QrCodeScanner
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Sort
import androidx.compose.material.icons.rounded.TableView
import androidx.compose.material.icons.rounded.VerifiedUser
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.domain.InventoryFilter
import com.example.domain.PosMath
import com.example.domain.StockAlerts
import com.example.model.OperationsSubTab
import com.example.model.Product
import com.example.model.ScannerMode
import com.example.model.StockFilter
import com.example.model.StockSort
import com.example.model.TabName
import com.example.ui.components.ProductIconBadge
import com.example.ui.theme.PosColors
import com.example.viewmodel.PosViewModel

@Composable
fun InventoryScreen(vm: PosViewModel) {
    val products by vm.products.collectAsStateWithLifecycle()
    val sales by vm.sales.collectAsStateWithLifecycle()
    val settings by vm.settings.collectAsStateWithLifecycle()
    val invCategory by vm.invCategory.collectAsStateWithLifecycle()
    val invStockFilter by vm.invStockFilter.collectAsStateWithLifecycle()
    val invSort by vm.invSort.collectAsStateWithLifecycle()
    val invSearch by vm.invSearch.collectAsStateWithLifecycle()

    val health = remember(products, sales, settings) {
        PosMath.computeStockHealthSummary(products, sales, settings)
    }
    val expiryMap = remember(products, settings.expiryWarnDays) {
        InventoryFilter.buildExpiryStatusMap(products, settings.expiryWarnDays)
    }
    val velocity = remember(products, sales) {
        PosMath.computeProductVelocities(products, sales)
    }
    val coverWarnDays = remember(settings.reorderLeadDays, settings.reorderSafetyDays) {
        settings.reorderLeadDays.coerceAtLeast(0) + settings.reorderSafetyDays.coerceAtLeast(0)
    }
    val filteredList = remember(
        products, invSearch, invStockFilter, invCategory, invSort,
        settings.lowStockThreshold, coverWarnDays, expiryMap, velocity
    ) {
        InventoryFilter.filterAndSortInventory(
            products = products,
            searchQuery = invSearch,
            stockFilter = invStockFilter,
            selectedCategory = invCategory,
            sortBy = invSort,
            lowStockThreshold = settings.lowStockThreshold,
            coverWarnDays = coverWarnDays,
            expiryMap = expiryMap,
            velocityById = velocity.byId
        )
    }
    val categories = remember(products) {
        listOf("All") + products.map { it.category }.filter { it.isNotBlank() }.distinct()
    }
    var sortMenuExpanded by remember { mutableStateOf(false) }

    Column(modifier = Modifier.fillMaxSize()) {
        // KPI Strip + Controls Header
        Surface(color = Color.White, shadowElevation = 1.dp) {
            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    InvKpiTile(
                        title = "Total SKUs",
                        value = "${health.totalSkus}",
                        sub = PosMath.formatPeso(health.stockRetailValue) + " retail",
                        selected = invStockFilter == StockFilter.ALL,
                        accent = PosColors.Slate900,
                        onClick = { vm.setInvStockFilter(StockFilter.ALL) }
                    )
                    InvKpiTile(
                        title = "Out of Stock",
                        value = "${health.outCount}",
                        sub = "Needs urgent restock",
                        selected = invStockFilter == StockFilter.OUT,
                        accent = PosColors.Rose600,
                        onClick = { vm.setInvStockFilter(StockFilter.OUT) }
                    )
                    InvKpiTile(
                        title = "Low Stock",
                        value = "${health.lowCount}",
                        sub = "At/below threshold",
                        selected = invStockFilter == StockFilter.LOW,
                        accent = PosColors.Amber600,
                        onClick = { vm.setInvStockFilter(StockFilter.LOW) }
                    )
                    InvKpiTile(
                        title = "Fast-Draining",
                        value = "${health.fastLowCount}",
                        sub = "<= ${coverWarnDays}d cover",
                        selected = invStockFilter == StockFilter.FAST_LOW,
                        accent = PosColors.Orange700,
                        onClick = { vm.setInvStockFilter(StockFilter.FAST_LOW) }
                    )
                    InvKpiTile(
                        title = "Expiring / Expired",
                        value = "${health.expiredCount + health.soonCount}",
                        sub = "${health.expiredCount} exp · ${health.soonCount} soon",
                        selected = invStockFilter == StockFilter.EXPIRED || invStockFilter == StockFilter.SOON,
                        accent = PosColors.Rose700,
                        onClick = {
                            vm.setInvStockFilter(
                                if (health.expiredCount > 0) StockFilter.EXPIRED else StockFilter.SOON
                            )
                        }
                    )
                    InvKpiTile(
                        title = "Capital & Margin",
                        value = "${health.missingCapitalCount + health.lossMarginCount}",
                        sub = "GMROI ${health.gmroi}",
                        selected = invStockFilter == StockFilter.NO_CAP || invStockFilter == StockFilter.LOSS,
                        accent = PosColors.Indigo600,
                        onClick = {
                            vm.setInvStockFilter(
                                if (health.lossMarginCount > 0) StockFilter.LOSS else StockFilter.NO_CAP
                            )
                        }
                    )
                }

                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = invSearch,
                        onValueChange = { vm.setInvSearch(it) },
                        placeholder = { Text("Search SKU, name, barcode...", fontSize = 13.sp) },
                        leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = "Search Inventory") },
                        trailingIcon = {
                            if (invSearch.isNotEmpty()) {
                                IconButton(onClick = { vm.setInvSearch("") }) {
                                    Icon(Icons.Rounded.Clear, contentDescription = "Clear search")
                                }
                            }
                        },
                        singleLine = true,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier
                            .weight(1f)
                            .testTag("inv_search_input")
                    )

                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = PosColors.Slate900,
                        modifier = Modifier
                            .size(48.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .clickable { vm.openScanner(ScannerMode.inventory, continuous = false) }
                            .testTag("inv_scan_button")
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(Icons.Rounded.QrCodeScanner, contentDescription = "Scan SKU Barcode", tint = Color.White)
                        }
                    }

                    Box {
                        OutlinedButton(
                            onClick = { sortMenuExpanded = true },
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier
                                .heightIn(min = 48.dp)
                                .testTag("inv_sort_button")
                        ) {
                            Icon(Icons.Rounded.Sort, contentDescription = "Sort inventory", modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Sort", fontSize = 12.sp)
                        }
                        DropdownMenu(expanded = sortMenuExpanded, onDismissRequest = { sortMenuExpanded = false }) {
                            StockSort.entries.forEach { sortOpt ->
                                DropdownMenuItem(
                                    text = {
                                        Text(
                                            sortOpt.label,
                                            fontWeight = if (invSort == sortOpt) FontWeight.Bold else FontWeight.Normal,
                                            color = if (invSort == sortOpt) PosColors.Emerald700 else PosColors.Slate900
                                        )
                                    },
                                    onClick = { vm.setInvSort(sortOpt); sortMenuExpanded = false }
                                )
                            }
                        }
                    }
                }

                // Toolbars: Primary Inventory Actions
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Button(
                        onClick = { vm.openProductModal() },
                        colors = ButtonDefaults.buttonColors(containerColor = PosColors.Emerald600),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier
                            .heightIn(min = 42.dp)
                            .testTag("inv_add_product_button")
                    ) {
                        Icon(Icons.Rounded.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Add Product", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                    InvToolChip("Batch Stock", Icons.Rounded.Layers, "inv_batch_btn") { vm.openBatchStock() }
                    InvToolChip("Smart Reorder", Icons.Rounded.AutoGraph, "inv_reorder_btn") { vm.openReorder() }
                    InvToolChip("Pull Expired (${health.expiredCount})", Icons.Rounded.EventBusy, "inv_pull_expired_btn") { vm.pullExpiredBatch() }
                    InvToolChip("CSV Import", Icons.Rounded.TableView, "inv_csv_btn") { vm.openCsvImport() }
                    InvToolChip("Stock Log", Icons.Rounded.History, "inv_log_btn") { vm.openStockLog() }
                    InvToolChip("SC/PWD Flags", Icons.Rounded.VerifiedUser, "inv_sc_btn") { vm.openScReview() }
                    InvToolChip("Tingi Repack", Icons.Rounded.Inventory, "inv_repack_btn") {
                        vm.setOpsSubTab(OperationsSubTab.repack)
                        vm.selectTab(TabName.operations)
                    }
                }

                // Category Chips
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    categories.forEach { cat ->
                        FilterChip(
                            selected = invCategory == cat,
                            onClick = { vm.setInvCategory(cat) },
                            label = { Text(cat, fontSize = 11.sp) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = PosColors.Slate900,
                                selectedLabelColor = Color.White
                            )
                        )
                    }
                }
            }
        }

        // Inventory Rows List
        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            if (filteredList.isEmpty()) {
                item {
                    Box(modifier = Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                        Text("No products match this filter", color = PosColors.Slate500)
                    }
                }
            } else {
                items(filteredList, key = { it.id }) { prod ->
                    InventoryRowCard(
                        product = prod,
                        globalLowTh = settings.lowStockThreshold,
                        expiryStatus = expiryMap[prod.id],
                        avgDailySales = velocity.byId[prod.id]?.avgDaily ?: 0.0,
                        daysOfCover = velocity.byId[prod.id]?.daysOfCover,
                        onAdjustStock = { vm.openStockAdjust(prod.id) },
                        onEdit = { vm.openProductModal(prod.id) },
                        onDelete = { vm.askDeleteProduct(prod.id) }
                    )
                }
            }
        }
    }
}

@Composable
private fun InvKpiTile(
    title: String,
    value: String,
    sub: String,
    selected: Boolean,
    accent: Color,
    onClick: () -> Unit
) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = if (selected) accent.copy(alpha = 0.08f) else PosColors.Slate50,
        border = BorderStroke(if (selected) 2.dp else 1.dp, if (selected) accent else PosColors.Slate200),
        modifier = Modifier
            .width(142.dp)
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
    ) {
        Column(modifier = Modifier.padding(10.dp)) {
            Text(title, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = PosColors.Slate600, maxLines = 1)
            Text(value, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold, color = accent)
            Text(sub, fontSize = 10.sp, color = PosColors.Slate500, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun InvToolChip(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    tag: String,
    onClick: () -> Unit
) {
    OutlinedButton(
        onClick = onClick,
        shape = RoundedCornerShape(10.dp),
        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
        modifier = Modifier
            .heightIn(min = 42.dp)
            .testTag(tag)
    ) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(15.dp))
        Spacer(Modifier.width(4.dp))
        Text(label, fontSize = 12.sp, maxLines = 1)
    }
}

@Composable
private fun InventoryRowCard(
    product: Product,
    globalLowTh: Double,
    expiryStatus: PosMath.ExpiryStatus?,
    avgDailySales: Double,
    daysOfCover: Double?,
    onAdjustStock: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit
) {
    val effLow = StockAlerts.getEffectiveLowStockThreshold(product, globalLowTh)
    val stockColor = when {
        product.stock <= 0.0 -> PosColors.Rose700
        product.stock <= effLow -> PosColors.Amber700
        else -> PosColors.Emerald700
    }
    val cap = product.capital ?: 0.0
    val marginPct = if (cap > 0.0 && product.retailPrice > 0.0) ((product.retailPrice - cap) / product.retailPrice) * 100.0 else null

    Surface(
        shape = RoundedCornerShape(14.dp),
        color = Color.White,
        border = BorderStroke(1.dp, PosColors.Slate200)
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                ProductIconBadge(product = product, size = 38.dp)
                Column(modifier = Modifier.weight(1f)) {
                    Text(product.name, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(
                        "${product.category} · ${product.barcode.ifBlank { "No barcode" }}",
                        style = MaterialTheme.typography.bodySmall,
                        color = PosColors.Slate500
                    )
                }
                Surface(shape = RoundedCornerShape(8.dp), color = stockColor.copy(alpha = 0.1f)) {
                    Text(
                        text = PosMath.formatQty(product.stock, product.unit),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = stockColor,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        "Retail ${PosMath.formatPeso(product.retailPrice)} · Whs ${PosMath.formatPeso(product.wholesalePrice)} (${product.wholesaleMinQty}+)",
                        style = MaterialTheme.typography.bodySmall,
                        color = PosColors.Slate700
                    )
                    val metaLine = buildString {
                        if (cap > 0.0) append("Cost ${PosMath.formatPeso(cap)} (${String.format("%.1f", marginPct ?: 0.0)}%)")
                        else append("Cost missing")
                        if (avgDailySales > 0.0 && daysOfCover != null) {
                            append(" · ~${String.format("%.1f", daysOfCover)}d cover")
                        }
                        if (expiryStatus != null && expiryStatus.status != PosMath.ExpiryState.NONE) {
                            append(" · Exp ${product.expiry}")
                        }
                    }
                    Text(metaLine, fontSize = 11.sp, color = PosColors.Slate500)
                }

                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedButton(
                        onClick = onAdjustStock,
                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier
                            .heightIn(min = 40.dp)
                            .testTag("inv_adj_${product.id}")
                    ) {
                        Text("+/- Stock", fontSize = 11.sp)
                    }
                    IconButton(onClick = onEdit, modifier = Modifier.testTag("inv_edit_${product.id}")) {
                        Icon(Icons.Rounded.Edit, contentDescription = "Edit product", tint = PosColors.Slate700, modifier = Modifier.size(18.dp))
                    }
                    IconButton(onClick = onDelete, modifier = Modifier.testTag("inv_del_${product.id}")) {
                        Icon(Icons.Rounded.DeleteOutline, contentDescription = "Delete product", tint = PosColors.Rose600, modifier = Modifier.size(18.dp))
                    }
                }
            }
        }
    }
}
