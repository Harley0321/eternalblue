package com.example.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Inventory
import androidx.compose.material.icons.filled.PlaylistAddCheck
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.domain.InventoryFilter
import com.example.domain.PosMath
import com.example.domain.StockAlerts
import com.example.model.StockFilter
import com.example.ui.components.KpiCard
import com.example.ui.components.ProductCategoryBadge
import com.example.ui.theme.AmberWarn
import com.example.ui.theme.EmeraldDark
import com.example.ui.theme.EmeraldPrimary
import com.example.ui.theme.IndigoAccent
import com.example.ui.theme.RoseDanger
import com.example.ui.theme.SlateBorder
import com.example.ui.theme.SlateMuted
import com.example.ui.theme.SlateSurface
import com.example.ui.theme.SlateText
import com.example.viewmodel.PosUiState
import com.example.viewmodel.PosViewModel

@Composable
fun InventoryScreen(state: PosUiState, vm: PosViewModel) {
    val summary = remember(state.products, state.sales, state.settings) {
        PosMath.computeStockHealthSummary(state.products, state.sales, state.settings)
    }
    val filtered = remember(state.products, state.sales, state.settings, state.stockSearch, state.stockFilter, state.stockSort) {
        InventoryFilter.filterAndSort(state.products, state.sales, state.settings, state.stockSearch, state.stockFilter, state.stockSort)
    }

    Column(modifier = Modifier.fillMaxSize().background(SlateSurface)) {
        // KPI Drilldown Row
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 12.dp, vertical = 10.dp)
        ) {
            KpiCard(
                title = "All SKUs",
                value = summary.totalSkus.toString(),
                sub = PosMath.formatPeso(summary.retailValue),
                active = state.stockFilter == StockFilter.ALL,
                modifier = Modifier.width(136.dp),
                onClick = { vm.setStockFilter(StockFilter.ALL) }
            )
            KpiCard(
                title = "Low Stock",
                value = summary.lowCount.toString(),
                valueColor = AmberWarn,
                active = state.stockFilter == StockFilter.LOW,
                modifier = Modifier.width(116.dp),
                onClick = { vm.setStockFilter(StockFilter.LOW) }
            )
            KpiCard(
                title = "Out of Stock",
                value = summary.outCount.toString(),
                valueColor = RoseDanger,
                active = state.stockFilter == StockFilter.OUT,
                modifier = Modifier.width(116.dp),
                onClick = { vm.setStockFilter(StockFilter.OUT) }
            )
            KpiCard(
                title = "Fast-Low",
                value = summary.fastLowCount.toString(),
                valueColor = IndigoAccent,
                active = state.stockFilter == StockFilter.FAST_LOW,
                modifier = Modifier.width(116.dp),
                onClick = { vm.setStockFilter(StockFilter.FAST_LOW) }
            )
            KpiCard(
                title = "Expiring",
                value = (summary.expiredCount + summary.soonCount).toString(),
                valueColor = AmberWarn,
                active = state.stockFilter == StockFilter.SOON,
                modifier = Modifier.width(116.dp),
                onClick = { vm.setStockFilter(StockFilter.SOON) }
            )
        }

        // Toolbar
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color.White)
                .padding(horizontal = 12.dp, vertical = 10.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                OutlinedTextField(
                    value = state.stockSearch,
                    onValueChange = vm::setStockSearch,
                    placeholder = { Text("Search SKU or barcode…", fontSize = 13.sp) },
                    leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.weight(1f)
                )
                IconButton(onClick = { vm.openScanner("inventory") }) {
                    Icon(Icons.Filled.QrCodeScanner, contentDescription = "Scan SKU", tint = IndigoAccent)
                }
                Button(
                    onClick = { vm.openProductModal(null) },
                    colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Add", fontWeight = FontWeight.Bold)
                }
            }
            Spacer(Modifier.height(8.dp))
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.horizontalScroll(rememberScrollState())
            ) {
                OutlinedButton(onClick = { vm.setBatchModalOpen(true) }, shape = RoundedCornerShape(10.dp)) {
                    Icon(Icons.Filled.PlaylistAddCheck, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Batch Receive / Audit", fontSize = 12.sp)
                }
                OutlinedButton(onClick = { vm.setStockLogModalOpen(true) }, shape = RoundedCornerShape(10.dp)) {
                    Icon(Icons.Filled.History, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Movement Log (${state.stockLog.size})", fontSize = 12.sp)
                }
                if (state.stockFilter != StockFilter.ALL) {
                    FilterChip(
                        selected = true,
                        onClick = { vm.setStockFilter(StockFilter.ALL) },
                        label = { Text("Filter: ${state.stockFilter.label} ×", fontSize = 12.sp) }
                    )
                }
            }
        }

        // List
        LazyColumn(
            contentPadding = PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.weight(1f).fillMaxWidth()
        ) {
            items(filtered, key = { it.id }) { p ->
                val out = StockAlerts.isOutOfStock(p)
                val low = StockAlerts.isLowStock(p, state.settings)
                Card(
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    border = BorderStroke(1.dp, SlateBorder)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.fillMaxWidth().padding(12.dp)
                    ) {
                        ProductCategoryBadge(category = p.category, size = 40.dp)
                        Spacer(Modifier.width(10.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(p.name, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(
                                "${p.category} • ${p.barcode}",
                                fontSize = 11.sp,
                                color = SlateMuted,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 4.dp)) {
                                Text(
                                    "Retail ${PosMath.formatPeso(p.retailPrice)}",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    fontFamily = FontFamily.Monospace,
                                    color = EmeraldDark
                                )
                                p.capital?.let { cap ->
                                    Text(
                                        "Cap ${PosMath.formatPeso(cap)}",
                                        fontSize = 11.sp,
                                        fontFamily = FontFamily.Monospace,
                                        color = SlateMuted
                                    )
                                }
                            }
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Surface(
                                color = when {
                                    out -> Color(0xFFFFF1F2)
                                    low -> Color(0xFFFFFBEB)
                                    else -> Color(0xFFECFDF5)
                                },
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                Text(
                                    PosMath.formatQty(p.stock, p.unit),
                                    color = when {
                                        out -> RoseDanger
                                        low -> AmberWarn
                                        else -> EmeraldDark
                                    },
                                    fontWeight = FontWeight.ExtraBold,
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 12.sp,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                )
                            }
                            Row {
                                IconButton(onClick = { vm.openStockAdjust(p) }, modifier = Modifier.size(34.dp)) {
                                    Icon(Icons.Filled.Inventory, contentDescription = "Adjust stock", tint = IndigoAccent, modifier = Modifier.size(18.dp))
                                }
                                IconButton(onClick = { vm.openProductModal(p) }, modifier = Modifier.size(34.dp)) {
                                    Icon(Icons.Filled.Edit, contentDescription = "Edit product", tint = SlateText, modifier = Modifier.size(18.dp))
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
