package com.example.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
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
import androidx.compose.material.icons.rounded.Calculate
import androidx.compose.material.icons.rounded.ExpandLess
import androidx.compose.material.icons.rounded.ExpandMore
import androidx.compose.material.icons.rounded.Print
import androidx.compose.material.icons.rounded.ReceiptLong
import androidx.compose.material.icons.rounded.Remove
import androidx.compose.material.icons.rounded.Undo
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.domain.PosMath
import com.example.model.SaleRecord
import com.example.ui.theme.PosColors
import com.example.viewmodel.PosViewModel

enum class SalesPeriod(val label: String) {
    TODAY("Today"),
    YESTERDAY("Yesterday"),
    DAYS7("7 Days"),
    DAYS30("30 Days"),
    ALL("All Time")
}

@Composable
fun SalesScreen(vm: PosViewModel) {
    val sales by vm.sales.collectAsStateWithLifecycle()
    val products by vm.products.collectAsStateWithLifecycle()
    val activeShift by vm.activeShift.collectAsStateWithLifecycle()
    val cashDrawerSignal by vm.salesCashDrawerSignal.collectAsStateWithLifecycle()

    var period by remember { mutableStateOf(SalesPeriod.TODAY) }
    var drawerOpen by remember { mutableStateOf(false) }
    val denomCounts = remember { mutableStateMapOf<Double, Int>() }
    var expandedReceiptNo by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(cashDrawerSignal) {
        if (cashDrawerSignal > 0) drawerOpen = true
    }

    val (fromMs, toMs) = remember(period) {
        val now = System.currentTimeMillis()
        val startToday = PosMath.startOfDayMs(now)
        when (period) {
            SalesPeriod.TODAY -> startToday to (startToday + PosMath.DAY_MS)
            SalesPeriod.YESTERDAY -> (startToday - PosMath.DAY_MS) to startToday
            SalesPeriod.DAYS7 -> (startToday - 6 * PosMath.DAY_MS) to (startToday + PosMath.DAY_MS)
            SalesPeriod.DAYS30 -> (startToday - 29 * PosMath.DAY_MS) to (startToday + PosMath.DAY_MS)
            SalesPeriod.ALL -> 0L to Long.MAX_VALUE
        }
    }

    val periodAllSales = remember(sales, fromMs, toMs) {
        sales.filter { PosMath.inRange(it.dateIso, fromMs, toMs) }.sortedByDescending { PosMath.parseIsoMs(it.dateIso) }
    }
    val liveSales = remember(periodAllSales) { periodAllSales.filter { it.voided != true } }
    val stats = remember(liveSales, products) { PosMath.computeSalesStats(liveSales, products) }
    val trend7 = remember(sales) { PosMath.computeLast7DaysNetSales(sales) }
    val trend7Summary = remember(trend7) { PosMath.summarize7DayTrend(trend7) }
    val hourlySeries = remember(stats.hours) { PosMath.computeHourlySalesSeries(stats.hours) }
    val abcRanking = remember(liveSales, products) { PosMath.computeProfitRanking(liveSales, products) }

    val drawerSummary = remember(sales, denomCounts.toMap(), activeShift) {
        val today = PosMath.startOfDayMs()
        PosMath.computeCashDrawerSummary(
            sales = sales,
            fromMs = today,
            toMs = today + PosMath.DAY_MS,
            denominationCounts = denomCounts,
            openingFloat = activeShift?.openingFloat ?: 0.0
        )
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Period selector + X-Read / Z-Read / Drawer
        item {
            Surface(shape = RoundedCornerShape(16.dp), color = Color.White, border = BorderStroke(1.dp, PosColors.Slate200)) {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        SalesPeriod.entries.forEach { p ->
                            FilterChip(
                                selected = period == p,
                                onClick = { period = p },
                                label = { Text(p.label, fontSize = 12.sp) },
                                colors = FilterChipDefaults.filterChipColors(
                                    selectedContainerColor = PosColors.Slate900,
                                    selectedLabelColor = Color.White
                                ),
                                modifier = Modifier.testTag("sales_period_${p.name.lowercase()}")
                            )
                        }
                    }

                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        OutlinedButton(
                            onClick = { vm.openReadingReport(false) },
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier
                                .weight(1f)
                                .heightIn(min = 44.dp)
                                .testTag("sales_xread_btn")
                        ) {
                            Icon(Icons.Rounded.ReceiptLong, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("X-Read", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                        Button(
                            onClick = { vm.openReadingReport(true) },
                            colors = ButtonDefaults.buttonColors(containerColor = PosColors.Slate900),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier
                                .weight(1f)
                                .heightIn(min = 44.dp)
                                .testTag("sales_zread_btn")
                        ) {
                            Text("Z-Read EOD", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                        OutlinedButton(
                            onClick = { drawerOpen = !drawerOpen },
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier
                                .weight(1f)
                                .heightIn(min = 44.dp)
                                .testTag("sales_drawer_btn")
                        ) {
                            Icon(Icons.Rounded.Calculate, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Count Cash", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }

        // Primary Sales KPIs
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                SalesKpiCard("Net Sales", PosMath.formatPeso(stats.net), "${stats.count} orders", PosColors.Emerald700, Modifier.weight(1f))
                SalesKpiCard("Est. Profit", PosMath.formatPeso(stats.profit), "Gross ${PosMath.formatPeso(stats.gross)}", PosColors.Indigo700, Modifier.weight(1f))
            }
        }
        item {
            val avgBasket = if (stats.count > 0) stats.net / stats.count else 0.0
            val discTotal = stats.seniorDisc + stats.wholesaleDisc
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                SalesKpiCard("Avg Basket", PosMath.formatPeso(avgBasket), "${PosMath.formatQty(stats.items)} items sold", PosColors.Slate800, Modifier.weight(1f))
                SalesKpiCard("Discounts", PosMath.formatPeso(discTotal), "SC ${PosMath.formatPeso(stats.seniorDisc)} · Whs ${PosMath.formatPeso(stats.wholesaleDisc)}", PosColors.Amber700, Modifier.weight(1f))
            }
        }

        // PH Denomination Cash Drawer Counter
        if (drawerOpen) {
            item {
                Surface(shape = RoundedCornerShape(16.dp), color = Color.White, border = BorderStroke(1.dp, PosColors.Indigo100)) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Column {
                                Text("Cash Drawer Denomination Count", style = MaterialTheme.typography.titleMedium)
                                Text(
                                    "Expected Cash: ${PosMath.formatPeso(drawerSummary.expectedDrawerTotal)} (Float ${PosMath.formatPeso(drawerSummary.openingFloat)})",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = PosColors.Slate500
                                )
                            }
                            TextButton(onClick = { denomCounts.clear() }) { Text("Reset") }
                        }

                        val (statusColor, statusText) = when (drawerSummary.status) {
                            "balanced" -> PosColors.Emerald700 to "BALANCED"
                            "over" -> PosColors.Indigo700 to "OVER +${PosMath.formatPeso(drawerSummary.variance)}"
                            else -> PosColors.Rose700 to "SHORT ${PosMath.formatPeso(drawerSummary.variance)}"
                        }
                        Surface(shape = RoundedCornerShape(10.dp), color = statusColor.copy(alpha = 0.1f)) {
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(10.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text("Counted: ${PosMath.formatPeso(drawerSummary.countedTotal)}", fontWeight = FontWeight.Bold, color = PosColors.Slate900)
                                Text(statusText, fontWeight = FontWeight.ExtraBold, color = statusColor)
                            }
                        }

                        PosMath.PH_DENOMINATIONS.chunked(2).forEach { pair ->
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                                pair.forEach { d ->
                                    val c = denomCounts[d] ?: 0
                                    Surface(
                                        shape = RoundedCornerShape(10.dp),
                                        color = PosColors.Slate50,
                                        border = BorderStroke(1.dp, PosColors.Slate200),
                                        modifier = Modifier.weight(1f)
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.SpaceBetween
                                        ) {
                                            Text(
                                                if (d >= 1.0) "₱${d.toInt()}" else "25¢",
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 13.sp
                                            )
                                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                                Icon(
                                                    Icons.Rounded.Remove,
                                                    contentDescription = "Decrease denom",
                                                    modifier = Modifier
                                                        .size(28.dp)
                                                        .clip(RoundedCornerShape(6.dp))
                                                        .clickable { if (c > 0) denomCounts[d] = c - 1 }
                                                        .padding(4.dp)
                                                )
                                                Text("$c", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                                Icon(
                                                    Icons.Rounded.Add,
                                                    contentDescription = "Increase denom",
                                                    modifier = Modifier
                                                        .size(28.dp)
                                                        .clip(RoundedCornerShape(6.dp))
                                                        .clickable { denomCounts[d] = c + 1 }
                                                        .padding(4.dp)
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Tender Breakdown
        if (stats.tender.isNotEmpty()) {
            item {
                Surface(shape = RoundedCornerShape(16.dp), color = Color.White, border = BorderStroke(1.dp, PosColors.Slate200)) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("Payment Tender Mix", style = MaterialTheme.typography.titleSmall)
                        stats.tender.forEach { (method, ts) ->
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("$method (${ts.count})", style = MaterialTheme.typography.bodyMedium)
                                Text(PosMath.formatPeso(ts.amt), style = MaterialTheme.typography.labelMedium)
                            }
                        }
                    }
                }
            }
        }

        // 7-Day Net Sales Chart
        item {
            Surface(shape = RoundedCornerShape(16.dp), color = Color.White, border = BorderStroke(1.dp, PosColors.Slate200)) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("7-Day Net Sales Trend", style = MaterialTheme.typography.titleSmall)
                        Text("7d Avg ${PosMath.formatPeso(trend7Summary.average)}/day", style = MaterialTheme.typography.bodySmall, color = PosColors.Slate500)
                    }
                    BarChartCanvas(
                        labels = trend7.map { it.shortDay },
                        values = trend7.map { it.netSales },
                        barColor = PosColors.Emerald500
                    )
                }
            }
        }

        // Hourly Peak Chart
        if (hourlySeries.isNotEmpty()) {
            item {
                Surface(shape = RoundedCornerShape(16.dp), color = Color.White, border = BorderStroke(1.dp, PosColors.Slate200)) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Hourly Sales Distribution", style = MaterialTheme.typography.titleSmall)
                        BarChartCanvas(
                            labels = hourlySeries.map { it.label },
                            values = hourlySeries.map { it.sales },
                            barColor = PosColors.Indigo600
                        )
                    }
                }
            }
        }

        // ABC Profit Ranking
        if (abcRanking.ranked.isNotEmpty()) {
            item {
                Surface(shape = RoundedCornerShape(16.dp), color = Color.White, border = BorderStroke(1.dp, PosColors.Slate200)) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("ABC Margin & Profit Ranking", style = MaterialTheme.typography.titleSmall)
                        abcRanking.ranked.take(8).forEach { r ->
                            val badgeColor = when (r.cls) {
                                "A" -> PosColors.Emerald700
                                "B" -> PosColors.Indigo700
                                else -> PosColors.Slate600
                            }
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.weight(1f)) {
                                    Surface(shape = RoundedCornerShape(6.dp), color = badgeColor.copy(alpha = 0.12f)) {
                                        Text(r.cls, fontWeight = FontWeight.ExtraBold, fontSize = 11.sp, color = badgeColor, modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp))
                                    }
                                    Text(r.name, style = MaterialTheme.typography.bodyMedium, maxLines = 1)
                                }
                                Text("+${PosMath.formatPeso(r.profit)}", style = MaterialTheme.typography.labelMedium, color = PosColors.Emerald700)
                            }
                        }
                    }
                }
            }
        }

        // Receipt History Header
        item {
            Text(
                "Receipts (${periodAllSales.size})",
                style = MaterialTheme.typography.titleSmall,
                color = PosColors.Slate700,
                modifier = Modifier.padding(top = 4.dp)
            )
        }

        if (periodAllSales.isEmpty()) {
            item {
                Surface(shape = RoundedCornerShape(14.dp), color = Color.White, border = BorderStroke(1.dp, PosColors.Slate200)) {
                    Box(modifier = Modifier.fillMaxWidth().padding(28.dp), contentAlignment = Alignment.Center) {
                        Text("No receipts in selected period", color = PosColors.Slate500)
                    }
                }
            }
        } else {
            items(periodAllSales, key = { it.receiptNo }) { sale ->
                ReceiptHistoryCard(
                    sale = sale,
                    expanded = expandedReceiptNo == sale.receiptNo,
                    onToggleExpand = {
                        expandedReceiptNo = if (expandedReceiptNo == sale.receiptNo) null else sale.receiptNo
                    },
                    onOpenReceipt = { vm.openReceipt(sale) },
                    onVoid = { vm.openVoidSale(sale) }
                )
            }
        }
    }
}

@Composable
private fun SalesKpiCard(title: String, value: String, sub: String, accent: Color, modifier: Modifier = Modifier) {
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = Color.White,
        border = BorderStroke(1.dp, PosColors.Slate200),
        modifier = modifier
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(title, fontSize = 11.sp, color = PosColors.Slate500, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(2.dp))
            Text(value, fontSize = 19.sp, fontWeight = FontWeight.ExtraBold, color = accent)
            Text(sub, fontSize = 10.sp, color = PosColors.Slate500)
        }
    }
}

@Composable
private fun BarChartCanvas(labels: List<String>, values: List<Double>, barColor: Color) {
    val maxVal = (values.maxOrNull() ?: 0.0).coerceAtLeast(1.0)
    Column {
        Canvas(modifier = Modifier.fillMaxWidth().height(110.dp)) {
            val n = values.size.coerceAtLeast(1)
            val gap = 8.dp.toPx()
            val barW = ((size.width - gap * (n - 1)) / n).coerceAtLeast(4f)
            values.forEachIndexed { idx, v ->
                val h = ((v / maxVal).toFloat() * (size.height - 6.dp.toPx())).coerceAtLeast(if (v > 0) 4f else 0f)
                val x = idx * (barW + gap)
                drawRoundRect(
                    color = PosColors.Slate100,
                    topLeft = Offset(x, 0f),
                    size = Size(barW, size.height),
                    cornerRadius = CornerRadius(6f, 6f)
                )
                if (h > 0f) {
                    drawRoundRect(
                        color = barColor,
                        topLeft = Offset(x, size.height - h),
                        size = Size(barW, h),
                        cornerRadius = CornerRadius(6f, 6f)
                    )
                }
            }
        }
        Spacer(Modifier.height(4.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            labels.forEach { lbl ->
                Text(lbl, fontSize = 10.sp, color = PosColors.Slate500)
            }
        }
    }
}

@Composable
private fun ReceiptHistoryCard(
    sale: SaleRecord,
    expanded: Boolean,
    onToggleExpand: () -> Unit,
    onOpenReceipt: () -> Unit,
    onVoid: () -> Unit
) {
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = if (sale.voided == true) PosColors.Rose50 else Color.White,
        border = BorderStroke(1.dp, if (sale.voided == true) PosColors.Rose100 else PosColors.Slate200)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onToggleExpand),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(sale.receiptNo, style = MaterialTheme.typography.titleSmall)
                        Surface(shape = RoundedCornerShape(6.dp), color = PosColors.Slate100) {
                            Text(sale.paymentMethod, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp))
                        }
                        if (sale.voided == true) {
                            Surface(shape = RoundedCornerShape(6.dp), color = PosColors.Rose600) {
                                Text("VOIDED", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color.White, modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp))
                            }
                        }
                    }
                    Text(
                        "${sale.dateFormatted} · ${sale.items.size} line(s)" + (sale.customerName?.let { " · $it" } ?: ""),
                        style = MaterialTheme.typography.bodySmall,
                        color = PosColors.Slate500
                    )
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        PosMath.formatPeso(sale.grandTotal),
                        style = MaterialTheme.typography.titleSmall,
                        color = if (sale.voided == true) PosColors.Rose700 else PosColors.Emerald700
                    )
                    Icon(if (expanded) Icons.Rounded.ExpandLess else Icons.Rounded.ExpandMore, contentDescription = "Toggle details")
                }
            }

            if (expanded) {
                Spacer(Modifier.height(8.dp))
                HorizontalDivider(color = PosColors.Slate200)
                Spacer(Modifier.height(8.dp))
                sale.items.forEach { it ->
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("${PosMath.formatQty(it.qty, it.unit)} × ${it.name}", style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                        Text(PosMath.formatPeso(it.lineTotal), style = MaterialTheme.typography.labelMedium)
                    }
                }
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(
                        onClick = onOpenReceipt,
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.weight(1f)
                    ) {
                        Icon(Icons.Rounded.Print, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Receipt / Print", fontSize = 12.sp)
                    }
                    if (sale.voided != true) {
                        OutlinedButton(
                            onClick = onVoid,
                            shape = RoundedCornerShape(10.dp),
                            border = BorderStroke(1.dp, PosColors.Rose600),
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(Icons.Rounded.Undo, contentDescription = null, tint = PosColors.Rose600, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Void Sale", fontSize = 12.sp, color = PosColors.Rose700)
                        }
                    }
                }
            }
        }
    }
}
