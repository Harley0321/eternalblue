package com.example.ui.modals

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.AddShoppingCart
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Cameraswitch
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.DeleteSweep
import androidx.compose.material.icons.rounded.FlashlightOff
import androidx.compose.material.icons.rounded.FlashlightOn
import androidx.compose.material.icons.rounded.ImageSearch
import androidx.compose.material.icons.rounded.QrCodeScanner
import androidx.compose.material.icons.rounded.Remove
import androidx.compose.material.icons.rounded.ShoppingCartCheckout
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.domain.PosMath
import com.example.hardware.BarcodeSymbology
import com.example.hardware.ScanFeedEntry
import com.example.model.CartLine
import com.example.model.CartTotals
import com.example.model.ScannerMode
import com.example.ui.theme.PosColors

@Composable
fun ScannerTopHeader(
    selectedCount: Int,
    formatsExpanded: Boolean,
    onToggleFormats: () -> Unit,
    torchOn: Boolean,
    hasFlash: Boolean,
    onToggleTorch: () -> Unit,
    onSwitchCamera: () -> Unit,
    onClose: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.weight(1f)
        ) {
            Icon(Icons.Rounded.QrCodeScanner, contentDescription = null, tint = PosColors.Emerald500)
            Column {
                Text(
                    "Multi-Barcode Scanner",
                    color = Color.White,
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    "$selectedCount of 10 symbologies • Simultaneous",
                    color = PosColors.Slate300,
                    fontSize = 11.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
        Row(
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Surface(
                onClick = onToggleFormats,
                shape = RoundedCornerShape(999.dp),
                color = if (formatsExpanded) PosColors.Emerald600 else PosColors.Slate800,
                border = BorderStroke(1.dp, if (formatsExpanded) PosColors.Emerald500 else PosColors.Slate700)
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Icon(Icons.Rounded.Tune, contentDescription = "Configure barcode types", tint = Color.White, modifier = Modifier.size(15.dp))
                    Text("$selectedCount/10 Types", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                }
            }
            IconButton(onClick = onSwitchCamera) {
                Icon(Icons.Rounded.Cameraswitch, contentDescription = "Switch camera", tint = Color.White)
            }
            if (hasFlash) {
                IconButton(onClick = onToggleTorch) {
                    Icon(
                        if (torchOn) Icons.Rounded.FlashlightOn else Icons.Rounded.FlashlightOff,
                        contentDescription = "Toggle flashlight",
                        tint = if (torchOn) PosColors.Amber500 else Color.White
                    )
                }
            }
            IconButton(onClick = onClose, modifier = Modifier.testTag("scanner_close_btn")) {
                Icon(Icons.Rounded.Close, contentDescription = "Close scanner", tint = Color.White)
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SymbologySelectorDrawer(
    visible: Boolean,
    selectedSymbologies: Set<BarcodeSymbology>,
    onSelectPreset: (Set<BarcodeSymbology>) -> Unit,
    onToggleSymbology: (BarcodeSymbology) -> Unit
) {
    AnimatedVisibility(visible = visible) {
        Surface(color = PosColors.Slate900, tonalElevation = 4.dp) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Presets:", color = PosColors.Slate400, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                    FilterChip(
                        selected = selectedSymbologies.size == BarcodeSymbology.ALL_10.size,
                        onClick = { onSelectPreset(BarcodeSymbology.ALL_10) },
                        label = { Text("All 10 Types", fontSize = 11.sp) },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = PosColors.Emerald600,
                            selectedLabelColor = Color.White,
                            labelColor = PosColors.Slate200
                        )
                    )
                    FilterChip(
                        selected = selectedSymbologies == BarcodeSymbology.RETAIL_1D,
                        onClick = { onSelectPreset(BarcodeSymbology.RETAIL_1D) },
                        label = { Text("Retail 1D (6)", fontSize = 11.sp) },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = PosColors.Emerald600,
                            selectedLabelColor = Color.White,
                            labelColor = PosColors.Slate200
                        )
                    )
                    FilterChip(
                        selected = selectedSymbologies == BarcodeSymbology.WAREHOUSE_2D,
                        onClick = { onSelectPreset(BarcodeSymbology.WAREHOUSE_2D) },
                        label = { Text("Warehouse & 2D (6)", fontSize = 11.sp) },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = PosColors.Emerald600,
                            selectedLabelColor = Color.White,
                            labelColor = PosColors.Slate200
                        )
                    )
                }

                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    BarcodeSymbology.entries.forEach { sym ->
                        val active = sym in selectedSymbologies
                        FilterChip(
                            selected = active,
                            onClick = { onToggleSymbology(sym) },
                            label = { Text(sym.label, fontSize = 11.sp) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = PosColors.Slate700,
                                selectedLabelColor = PosColors.Emerald500,
                                labelColor = PosColors.Slate400
                            )
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun CameraFloatingZoomBar(
    currentZoom: Float,
    maxZoom: Float,
    autoZoomEnabled: Boolean,
    onSelectZoom: (Float) -> Unit,
    onToggleAutoZoom: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(999.dp),
        color = PosColors.Slate950.copy(alpha = 0.78f),
        border = BorderStroke(1.dp, PosColors.Slate700.copy(alpha = 0.8f))
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            listOf(1.0f, 1.5f, 2.0f, 3.0f).filter { it <= maxZoom + 0.05f }.forEach { z ->
                val selected = kotlin.math.abs(currentZoom - z) < 0.22f
                Surface(
                    onClick = { onSelectZoom(z) },
                    shape = CircleShape,
                    color = if (selected) PosColors.Emerald500 else Color.Transparent
                ) {
                    Text(
                        text = if (z == 1.0f || z == 2.0f || z == 3.0f) "${z.toInt()}x" else "${z}x",
                        color = if (selected) PosColors.Slate950 else Color.White,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp)
                    )
                }
            }
            Box(modifier = Modifier.width(1.dp).height(16.dp).background(PosColors.Slate700))
            Surface(
                onClick = onToggleAutoZoom,
                shape = RoundedCornerShape(999.dp),
                color = if (autoZoomEnabled) PosColors.Emerald600.copy(alpha = 0.35f) else Color.Transparent
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(3.dp)
                ) {
                    Icon(
                        Icons.Rounded.AutoAwesome,
                        contentDescription = "Auto zoom",
                        tint = if (autoZoomEnabled) PosColors.Emerald500 else PosColors.Slate400,
                        modifier = Modifier.size(13.dp)
                    )
                    Text(
                        "Auto",
                        color = if (autoZoomEnabled) PosColors.Emerald500 else PosColors.Slate400,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }
    }
}

@Composable
fun UnknownBarcodePromptBanner(
    notFoundCode: String,
    onAddSku: (String) -> Unit,
    onDismiss: () -> Unit
) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = PosColors.Amber700.copy(alpha = 0.28f),
        border = BorderStroke(1.dp, PosColors.Amber500.copy(alpha = 0.45f))
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                modifier = Modifier.weight(1f),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Icon(Icons.Rounded.WarningAmber, contentDescription = null, tint = PosColors.Amber500, modifier = Modifier.size(18.dp))
                Column {
                    Text("Unknown barcode", color = PosColors.Amber500, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    Text(notFoundCode, color = Color.White, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                Button(
                    onClick = { onAddSku(notFoundCode) },
                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = PosColors.Emerald600)
                ) {
                    Text("Add SKU", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }
                IconButton(onClick = onDismiss, modifier = Modifier.size(32.dp)) {
                    Icon(Icons.Rounded.Close, contentDescription = "Dismiss unknown barcode", tint = PosColors.Slate300, modifier = Modifier.size(16.dp))
                }
            }
        }
    }
}

@Composable
fun ScannerControlsFooter(
    mode: ScannerMode,
    rapidMode: Boolean,
    onToggleRapidMode: () -> Unit,
    manualCode: String,
    onManualCodeChange: (String) -> Unit,
    onSubmitManual: () -> Unit,
    onPickPhoto: () -> Unit,
    notFoundCode: String?,
    onAddUnknownSku: (String) -> Unit,
    onDismissUnknown: () -> Unit,
    recentFeed: List<ScanFeedEntry>,
    onClearFeed: () -> Unit,
    cart: List<CartLine>,
    cartTotals: CartTotals,
    onCheckout: () -> Unit
) {
    Surface(color = PosColors.Slate900) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            if (notFoundCode != null && mode == ScannerMode.pos) {
                UnknownBarcodePromptBanner(
                    notFoundCode = notFoundCode,
                    onAddSku = onAddUnknownSku,
                    onDismiss = onDismissUnknown
                )
            }

            if (recentFeed.isNotEmpty()) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        "Scanned This Session (${recentFeed.size})",
                        color = PosColors.Emerald500,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                    TextButton(onClick = onClearFeed, contentPadding = PaddingValues(horizontal = 6.dp, vertical = 0.dp)) {
                        Text("Clear", color = PosColors.Slate400, fontSize = 11.sp)
                    }
                }
                Row(
                    modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    recentFeed.take(12).forEach { entry ->
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = if (entry.isUnknown) PosColors.Amber700.copy(alpha = 0.25f) else PosColors.Slate800,
                            border = BorderStroke(
                                1.dp,
                                if (entry.isUnknown) PosColors.Amber500.copy(alpha = 0.45f) else PosColors.Emerald500.copy(alpha = 0.4f)
                            )
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(5.dp)
                            ) {
                                Icon(
                                    if (entry.isUnknown) Icons.Rounded.WarningAmber else Icons.Rounded.CheckCircle,
                                    contentDescription = null,
                                    tint = if (entry.isUnknown) PosColors.Amber500 else PosColors.Emerald500,
                                    modifier = Modifier.size(14.dp)
                                )
                                Text(
                                    text = if (entry.productName != null) {
                                        "${entry.productName} (${entry.formatLabel})"
                                    } else {
                                        "${entry.code} (${entry.formatLabel})"
                                    },
                                    color = Color.White,
                                    fontSize = 11.sp,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }
                    }
                }
            }

            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedTextField(
                    value = manualCode,
                    onValueChange = onManualCodeChange,
                    placeholder = { Text("Enter barcode or 5*code", color = PosColors.Slate400, fontSize = 12.sp) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { onSubmitManual() }),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White,
                        focusedBorderColor = PosColors.Emerald500,
                        unfocusedBorderColor = PosColors.Slate600
                    ),
                    modifier = Modifier.weight(1f)
                )
                Button(
                    onClick = onSubmitManual,
                    modifier = Modifier.heightIn(min = 48.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = PosColors.Emerald600)
                ) { Text("Add") }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (mode == ScannerMode.pos) {
                        FilterChip(
                            selected = rapidMode,
                            onClick = onToggleRapidMode,
                            label = { Text(if (rapidMode) "Multi-Scan: ON" else "Single Pick", fontSize = 11.sp) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = PosColors.Emerald600,
                                selectedLabelColor = Color.White,
                                labelColor = PosColors.Slate200
                            )
                        )
                    }
                    OutlinedButton(
                        onClick = onPickPhoto,
                        border = BorderStroke(1.dp, PosColors.Slate600)
                    ) {
                        Icon(Icons.Rounded.ImageSearch, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Photo Multi-Scan", color = Color.White, fontSize = 11.sp)
                    }
                }
                if (mode == ScannerMode.pos && cart.isNotEmpty()) {
                    Button(
                        onClick = onCheckout,
                        colors = ButtonDefaults.buttonColors(containerColor = PosColors.Emerald500, contentColor = PosColors.Slate950)
                    ) {
                        Text(
                            "Pay ${PosMath.formatPeso(cartTotals.grandTotal)}",
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 12.sp
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun TabletScannerSidePanel(
    mode: ScannerMode,
    rapidMode: Boolean,
    onToggleRapidMode: () -> Unit,
    manualCode: String,
    onManualCodeChange: (String) -> Unit,
    onSubmitManual: () -> Unit,
    onPickPhoto: () -> Unit,
    notFoundCode: String?,
    onAddUnknownSku: (String) -> Unit,
    onDismissUnknown: () -> Unit,
    recentFeed: List<ScanFeedEntry>,
    onClearFeed: () -> Unit,
    cart: List<CartLine>,
    cartTotals: CartTotals,
    onChangeQty: (String, Double) -> Unit,
    onCheckout: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        color = PosColors.Slate900,
        modifier = modifier.fillMaxHeight()
    ) {
        Column(
            modifier = Modifier.fillMaxHeight().padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        if (mode == ScannerMode.pos) "Live Counter Queue" else "Detected Items",
                        color = Color.White,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        "Scan 1–10 items at once in view",
                        color = PosColors.Slate400,
                        fontSize = 11.sp
                    )
                }
                if (mode == ScannerMode.pos) {
                    FilterChip(
                        selected = rapidMode,
                        onClick = onToggleRapidMode,
                        label = { Text(if (rapidMode) "Multi-Scan" else "Single", fontSize = 11.sp) },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = PosColors.Emerald600,
                            selectedLabelColor = Color.White,
                            labelColor = PosColors.Slate200
                        )
                    )
                }
            }

            if (notFoundCode != null && mode == ScannerMode.pos) {
                UnknownBarcodePromptBanner(
                    notFoundCode = notFoundCode,
                    onAddSku = onAddUnknownSku,
                    onDismiss = onDismissUnknown
                )
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = manualCode,
                    onValueChange = onManualCodeChange,
                    placeholder = { Text("Type barcode or 5*code", color = PosColors.Slate400, fontSize = 12.sp) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { onSubmitManual() }),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White,
                        focusedBorderColor = PosColors.Emerald500,
                        unfocusedBorderColor = PosColors.Slate600
                    ),
                    modifier = Modifier.weight(1f)
                )
                Button(
                    onClick = onSubmitManual,
                    modifier = Modifier.heightIn(min = 48.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = PosColors.Emerald600)
                ) { Text("Add") }
            }

            OutlinedButton(
                onClick = onPickPhoto,
                modifier = Modifier.fillMaxWidth(),
                border = BorderStroke(1.dp, PosColors.Slate600)
            ) {
                Icon(Icons.Rounded.ImageSearch, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text("Scan Multiple Barcodes from Photo", color = Color.White, fontSize = 12.sp)
            }

            HorizontalDivider(color = PosColors.Slate800)

            // Active Cart or Session Scan Feed
            if (mode == ScannerMode.pos && cart.isNotEmpty()) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Active Cart (${cart.size} SKUs)", color = PosColors.Emerald500, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    if (recentFeed.isNotEmpty()) {
                        IconButton(onClick = onClearFeed, modifier = Modifier.size(28.dp)) {
                            Icon(Icons.Rounded.DeleteSweep, contentDescription = "Clear scan log", tint = PosColors.Slate400, modifier = Modifier.size(16.dp))
                        }
                    }
                }
                LazyColumn(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(cart, key = { it.productId }) { line ->
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = PosColors.Slate800,
                            border = BorderStroke(1.dp, PosColors.Slate700)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 8.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(line.name, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(
                                        "${PosMath.formatPeso(if (line.priceType.name == "wholesale" && line.wholesalePrice > 0.0) line.wholesalePrice else line.retailPrice)} / ${line.unit}",
                                        color = PosColors.Slate300,
                                        fontSize = 11.sp
                                    )
                                }
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Surface(
                                        onClick = { onChangeQty(line.productId, -1.0) },
                                        shape = RoundedCornerShape(8.dp),
                                        color = PosColors.Slate700,
                                        modifier = Modifier.size(36.dp)
                                    ) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(Icons.Rounded.Remove, contentDescription = "Decrease quantity", tint = Color.White, modifier = Modifier.size(16.dp))
                                        }
                                    }
                                    Text(
                                        PosMath.formatQty(line.qty, line.unit),
                                        color = Color.White,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 13.sp,
                                        modifier = Modifier.padding(horizontal = 6.dp)
                                    )
                                    Surface(
                                        onClick = { onChangeQty(line.productId, 1.0) },
                                        shape = RoundedCornerShape(8.dp),
                                        color = PosColors.Emerald600,
                                        modifier = Modifier.size(36.dp)
                                    ) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(Icons.Rounded.Add, contentDescription = "Increase quantity", tint = Color.White, modifier = Modifier.size(16.dp))
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                Button(
                    onClick = onCheckout,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 50.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = PosColors.Emerald500, contentColor = PosColors.Slate950)
                ) {
                    Icon(Icons.Rounded.ShoppingCartCheckout, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Pay ${PosMath.formatPeso(cartTotals.grandTotal)}", fontWeight = FontWeight.ExtraBold, fontSize = 14.sp)
                }
            } else {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Scan Log (${recentFeed.size})", color = PosColors.Slate300, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    if (recentFeed.isNotEmpty()) {
                        TextButton(onClick = onClearFeed) {
                            Text("Clear", color = PosColors.Slate400, fontSize = 11.sp)
                        }
                    }
                }
                if (recentFeed.isEmpty()) {
                    Box(modifier = Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Icon(Icons.Rounded.AddShoppingCart, contentDescription = null, tint = PosColors.Slate600, modifier = Modifier.size(36.dp))
                            Text(
                                "Point camera at 1 to 10 items.\nEAN-13, EAN-8, UPC, Code 128/39/93, ITF, QR & Data Matrix scan simultaneously.",
                                color = PosColors.Slate400,
                                fontSize = 12.sp
                            )
                        }
                    }
                } else {
                    LazyColumn(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        items(recentFeed, key = { it.id }) { entry ->
                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color = PosColors.Slate800,
                                border = BorderStroke(1.dp, if (entry.isUnknown) PosColors.Amber500.copy(alpha = 0.45f) else PosColors.Slate700)
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 8.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(entry.productName ?: "Unknown Barcode", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                                        Text("${entry.code} • ${entry.formatLabel}", color = PosColors.Slate400, fontSize = 11.sp)
                                    }
                                    if (entry.unitPrice != null) {
                                        Text(PosMath.formatPeso(entry.unitPrice), color = PosColors.Emerald500, fontWeight = FontWeight.Bold, fontSize = 12.sp)
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
