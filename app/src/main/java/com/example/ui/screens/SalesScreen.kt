package com.example.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.domain.PosMath
import com.example.ui.components.KpiCard
import com.example.ui.theme.EmeraldDark
import com.example.ui.theme.IndigoAccent
import com.example.ui.theme.RoseDanger
import com.example.ui.theme.SlateBorder
import com.example.ui.theme.SlateMuted
import com.example.ui.theme.SlateSurface
import com.example.viewmodel.PosUiState
import com.example.viewmodel.PosViewModel

@Composable
fun SalesScreen(state: PosUiState, vm: PosViewModel) {
    var periodDays by remember { mutableStateOf(7) }
    var denomOpen by remember { mutableStateOf(false) }

    val startToday = PosMath.startOfDayMs()
    val endToday = startToday + PosMath.DAY_MS
    val fromMs = if (periodDays <= 0) 0L else startToday - (periodDays - 1L) * PosMath.DAY_MS

    val stats = remember(state.sales, state.products, periodDays) {
        PosMath.computeSalesStats(state.sales, fromMs, endToday, state.productMap)
    }
    val filteredSales = remember(state.sales, periodDays) {
        state.sales.filter { PosMath.parseIsoMs(it.dateIso) in fromMs until endToday }
    }

    LazyColumn(
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxSize().background(SlateSurface)
    ) {
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                listOf(1 to "Today", 7 to "7 Days", 30 to "30 Days", 0 to "All").forEach { (days, lbl) ->
                    FilterChip(selected = periodDays == days, onClick = { periodDays = days }, label = { Text(lbl, fontSize = 12.sp) })
                }
                Spacer(Modifier.weight(1f))
                OutlinedButton(onClick = { denomOpen = true }, shape = RoundedCornerShape(10.dp)) {
                    Text("Count Cash", fontSize = 12.sp)
                }
            }
        }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                KpiCard("Net Revenue", PosMath.formatPeso(stats.revenue), "${stats.orders} orders", valueColor = EmeraldDark, modifier = Modifier.weight(1f))
                KpiCard("Est. Profit", PosMath.formatPeso(stats.profit), "${stats.marginPct}% margin", valueColor = IndigoAccent, modifier = Modifier.weight(1f))
            }
        }

        item {
            // Simple 7-day sales bar visual
            val dayBuckets = remember(state.sales, state.products) {
                (6 downTo 0).map { offset ->
                    val dStart = startToday - offset * PosMath.DAY_MS
                    val dEnd = dStart + PosMath.DAY_MS
                    val dStat = PosMath.computeSalesStats(state.sales, dStart, dEnd, state.productMap)
                    val label = if (offset == 0) "Today" else "${offset}d"
                    label to dStat.revenue
                }
            }
            val peak = (dayBuckets.maxOfOrNull { it.second } ?: 1.0).coerceAtLeast(1.0)
            Card(shape = RoundedCornerShape(14.dp), colors = CardDefaults.cardColors(containerColor = Color.White), border = BorderStroke(1.dp, SlateBorder)) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text("Last 7 Days Sales Trend", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    Spacer(Modifier.height(10.dp))
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.Bottom,
                        modifier = Modifier.fillMaxWidth().height(92.dp)
                    ) {
                        dayBuckets.forEach { (lbl, amt) ->
                            val frac = (amt / peak).toFloat().coerceIn(0.06f, 1f)
                            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.weight(1f)) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height((68 * frac).dp)
                                        .background(if (amt > 0) EmeraldDark else SlateBorder, RoundedCornerShape(topStart = 6.dp, topEnd = 6.dp))
                                )
                                Spacer(Modifier.height(4.dp))
                                Text(lbl, fontSize = 10.sp, color = SlateMuted)
                            }
                        }
                    }
                }
            }
        }

        item {
            Text("Receipts (${filteredSales.size})", fontWeight = FontWeight.ExtraBold, fontSize = 14.sp)
        }

        items(filteredSales, key = { it.receiptNo }) { s ->
            Card(
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                border = BorderStroke(1.dp, SlateBorder),
                modifier = Modifier.fillMaxWidth().clickable { vm.openReceipt(s) }
            ) {
                Row(
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(12.dp)
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(s.receiptNo, fontWeight = FontWeight.ExtraBold, fontFamily = FontFamily.Monospace, fontSize = 14.sp)
                            Surface(color = Color(0xFFF1F5F9), shape = RoundedCornerShape(4.dp)) {
                                Text(s.paymentMethod, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp))
                            }
                            if (s.voided == true) {
                                Surface(color = Color(0xFFFFF1F2), shape = RoundedCornerShape(4.dp)) {
                                    Text("VOIDED", color = RoseDanger, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp))
                                }
                            }
                        }
                        Text("${s.dateFormatted} • ${s.items.size} lines", fontSize = 11.sp, color = SlateMuted)
                    }
                    Text(
                        PosMath.formatPeso(s.grandTotal),
                        fontWeight = FontWeight.ExtraBold,
                        fontFamily = FontFamily.Monospace,
                        fontSize = 15.sp,
                        color = if (s.voided == true) SlateMuted else EmeraldDark
                    )
                }
            }
        }
    }

    if (denomOpen) {
        val counts = remember { mutableStateMapOf<Double, String>() }
        val total = PosMath.PH_DENOMINATIONS.sumOf { d -> d * (counts[d]?.toIntOrNull() ?: 0) }
        AlertDialog(
            onDismissRequest = { denomOpen = false },
            title = { Text("PH Cash Denomination Counter", fontWeight = FontWeight.Bold) },
            text = {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.height(340.dp)) {
                    items(PosMath.PH_DENOMINATIONS) { denom ->
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                            Text(PosMath.formatPeso(denom), fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                            OutlinedTextField(
                                value = counts[denom] ?: "",
                                onValueChange = { counts[denom] = it.filter { ch -> ch.isDigit() } },
                                placeholder = { Text("0") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                singleLine = true,
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }
                    item {
                        Spacer(Modifier.height(6.dp))
                        Text("Total Counted: ${PosMath.formatPeso(total)}", fontWeight = FontWeight.ExtraBold, fontSize = 16.sp, color = EmeraldDark)
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { denomOpen = false }) { Text("Done") }
            }
        )
    }
}
