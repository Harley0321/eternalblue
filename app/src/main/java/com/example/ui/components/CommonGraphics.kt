package com.example.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AcUnit
import androidx.compose.material.icons.rounded.BatteryChargingFull
import androidx.compose.material.icons.rounded.BakeryDining
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.CleaningServices
import androidx.compose.material.icons.rounded.Coffee
import androidx.compose.material.icons.rounded.Cookie
import androidx.compose.material.icons.rounded.Egg
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Grass
import androidx.compose.material.icons.rounded.GridView
import androidx.compose.material.icons.rounded.Inventory2
import androidx.compose.material.icons.rounded.LocalCafe
import androidx.compose.material.icons.rounded.LocalDrink
import androidx.compose.material.icons.rounded.LocalFireDepartment
import androidx.compose.material.icons.rounded.LocalOffer
import androidx.compose.material.icons.rounded.Medication
import androidx.compose.material.icons.rounded.QrCode2
import androidx.compose.material.icons.rounded.QrCodeScanner
import androidx.compose.material.icons.rounded.RamenDining
import androidx.compose.material.icons.rounded.ReceiptLong
import androidx.compose.material.icons.rounded.Restaurant
import androidx.compose.material.icons.rounded.SetMeal
import androidx.compose.material.icons.rounded.ShoppingBag
import androidx.compose.material.icons.rounded.ShoppingBasket
import androidx.compose.material.icons.rounded.Storefront
import androidx.compose.material.icons.rounded.Verified
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material.icons.rounded.WaterDrop
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.domain.CheckoutQrMode
import com.example.domain.OpsMath
import com.example.domain.PosMath
import com.example.domain.ResolvedCheckoutQr
import com.example.hardware.AndroidDeviceBridge
import com.example.model.Product
import com.example.model.ToastItem
import com.example.model.ToastType
import com.example.ui.theme.PosColors

fun getCategoryIcon(category: String): ImageVector {
    val c = category.lowercase()
    return when {
        category == "All" -> Icons.Rounded.GridView
        "frozen" in c || "meat" in c || "pork" in c || "chicken" in c || "beef" in c -> Icons.Rounded.Restaurant
        "rice" in c || "staple" in c || "grain" in c -> Icons.Rounded.Grass
        "canned" in c || "noodle" in c || "pantry" in c -> Icons.Rounded.Inventory2
        "beverage" in c || "drink" in c || "soda" in c || "coffee" in c -> Icons.Rounded.LocalCafe
        "dairy" in c || "bakery" in c || "bread" in c || "milk" in c -> Icons.Rounded.BakeryDining
        "condiment" in c || "cook" in c || "sauce" in c || "oil" in c -> Icons.Rounded.WaterDrop
        "snack" in c || "biscuit" in c || "candy" in c -> Icons.Rounded.Cookie
        "personal" in c || "home" in c || "clean" in c || "soap" in c -> Icons.Rounded.CleaningServices
        else -> Icons.Rounded.LocalOffer
    }
}

private data class ResolvedIconMeta(val icon: ImageVector, val bg: Color, val fg: Color, val border: Color)

private fun resolveProductIconMeta(product: Product): ResolvedIconMeta {
    val n = product.name.lowercase()
    val c = product.category.lowercase()
    val id = when {
        !product.icon.isNullOrBlank() && product.icon != "auto" -> product.icon
        Regex("""\b(tuna|sardines?|bangus|tilapia|fish|seafood)\b""").containsMatchIn(n) -> "fish"
        Regex("""\b(chicken|manok|wings)\b""").containsMatchIn(n) -> "drumstick"
        Regex("""\b(pork|baboy|beef|hotdog|cheesedog|tocino|longganisa|corned|ham|bacon|meat)\b""").containsMatchIn(n) -> "beef"
        Regex("""\b(egg|itlog)\b""").containsMatchIn(n) -> "egg"
        Regex("""\b(rice|bigas|sinandomeng|jasmin|dinorado|flour|oat)\b""").containsMatchIn(n) -> "wheat"
        Regex("""\b(coffee|kape|nescafe|kopiko|milo|cocoa|tea)\b""").containsMatchIn(n) -> "coffee"
        Regex("""\b(water|mineral|wilkins|summit|absolute)\b""").containsMatchIn(n) -> "glass-water"
        Regex("""\b(cola|coke|sprite|pepsi|royal|soda|juice|cobra|beer)\b""").containsMatchIn(n) -> "cup-soda"
        Regex("""\b(milk|gatas|bear brand|alaska|queso|cheese|butter|yogurt)\b""").containsMatchIn(n) -> "milk"
        Regex("""\b(bread|pandesal|gardenia|loaf|bun|cake|mamon)\b""").containsMatchIn(n) -> "croissant"
        Regex("""\b(noodle|canton|pancit|ramen|pasta|spaghetti)\b""").containsMatchIn(n) -> "soup"
        Regex("""\b(chips|crisps|piattos|nova|cracker|skyflakes|fita|biscuit|cookie|candy)\b""").containsMatchIn(n) -> "cookie"
        Regex("""\b(oil|cooking oil|soy sauce|toyo|vinegar|suka|patis|sauce|ketchup)\b""").containsMatchIn(n) -> "droplets"
        Regex("""\b(soap|sabon|safeguard|detergent|surf|ariel|tide|shampoo|toothpaste|tissue)\b""").containsMatchIn(n) -> "spray-can"
        Regex("""\b(medicine|vitamin|paracetamol|biogesic|pill|tablet)\b""").containsMatchIn(n) -> "pill"
        Regex("""\b(lpg|gasul|lighter|candle|match)\b""").containsMatchIn(n) -> "flame"
        Regex("""\b(battery|load|prepaid|sim)\b""").containsMatchIn(n) -> "battery"
        "frozen" in c || "meat" in c -> "beef"
        "rice" in c || "staple" in c -> "wheat"
        "noodle" in c || "canned" in c -> "package"
        "beverage" in c -> "cup-soda"
        "dairy" in c || "bakery" in c -> "milk"
        "condiment" in c || "cook" in c -> "droplets"
        "snack" in c -> "cookie"
        "personal" in c || "home" in c -> "spray-can"
        else -> "package"
    }

    val iconVec = when (id) {
        "fish" -> Icons.Rounded.SetMeal
        "drumstick", "beef" -> Icons.Rounded.Restaurant
        "egg" -> Icons.Rounded.Egg
        "wheat" -> Icons.Rounded.Grass
        "coffee" -> Icons.Rounded.Coffee
        "glass-water", "droplets" -> Icons.Rounded.WaterDrop
        "cup-soda", "milk" -> Icons.Rounded.LocalDrink
        "croissant" -> Icons.Rounded.BakeryDining
        "soup" -> Icons.Rounded.RamenDining
        "cookie" -> Icons.Rounded.Cookie
        "spray-can" -> Icons.Rounded.CleaningServices
        "pill" -> Icons.Rounded.Medication
        "flame" -> Icons.Rounded.LocalFireDepartment
        "battery" -> Icons.Rounded.BatteryChargingFull
        "apple" -> Icons.Rounded.AcUnit
        else -> Icons.Rounded.Inventory2
    }

    val tintKey = if (!product.iconColor.isNullOrBlank() && product.iconColor != "auto") product.iconColor else when (id) {
        "beef" -> "rose"
        "drumstick", "soup", "flame" -> "orange"
        "fish", "glass-water", "milk" -> "sky"
        "wheat", "coffee", "croissant", "egg", "droplets" -> "amber"
        "cup-soda" -> "rose"
        "cookie", "battery" -> "indigo"
        "spray-can" -> "teal"
        "pill" -> "emerald"
        else -> "slate"
    }

    val (bg, fg, border) = when (tintKey) {
        "emerald" -> Triple(PosColors.Emerald50, PosColors.Emerald700, PosColors.Emerald100)
        "amber" -> Triple(PosColors.Amber50, PosColors.Amber700, PosColors.Amber100)
        "rose" -> Triple(PosColors.Rose50, PosColors.Rose700, PosColors.Rose100)
        "sky" -> Triple(PosColors.Sky50, PosColors.Sky700, Color(0xFFBAE6FD))
        "indigo" -> Triple(PosColors.Indigo50, PosColors.Indigo700, PosColors.Indigo100)
        "orange" -> Triple(PosColors.Orange50, PosColors.Orange700, Color(0xFFFED7AA))
        "teal" -> Triple(PosColors.Teal50, PosColors.Teal700, Color(0xFF99F6E4))
        else -> Triple(PosColors.Slate100, PosColors.Slate700, PosColors.Slate200)
    }
    return ResolvedIconMeta(iconVec, bg, fg, border)
}

@Composable
fun ProductIconBadge(product: Product, size: Dp = 36.dp, modifier: Modifier = Modifier) {
    val meta = remember(product.id, product.name, product.category, product.icon, product.iconColor) {
        resolveProductIconMeta(product)
    }
    Box(
        modifier = modifier
            .size(size)
            .clip(RoundedCornerShape(10.dp))
            .background(meta.bg)
            .border(1.dp, meta.border, RoundedCornerShape(10.dp)),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            imageVector = meta.icon,
            contentDescription = product.name,
            tint = meta.fg,
            modifier = Modifier.size(size * 0.55f)
        )
    }
}

@Composable
fun StoreEmblem(storeIcon: String? = "basket", size: Dp = 36.dp, modifier: Modifier = Modifier) {
    val icon = when (storeIcon) {
        "store" -> Icons.Rounded.Storefront
        "bag" -> Icons.Rounded.ShoppingBag
        "scanner" -> Icons.Rounded.QrCodeScanner
        "receipt" -> Icons.Rounded.ReceiptLong
        else -> Icons.Rounded.ShoppingBasket
    }
    Box(
        modifier = modifier
            .size(size)
            .clip(RoundedCornerShape(12.dp))
            .background(Brush.linearGradient(listOf(PosColors.Emerald500, PosColors.Emerald700))),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            imageVector = icon,
            contentDescription = "Store emblem",
            tint = Color.White,
            modifier = Modifier.size(size * 0.56f)
        )
    }
}

@Composable
fun QrCodeGraphic(payload: String, size: Dp = 180.dp, modifier: Modifier = Modifier) {
    val bmp = remember(payload) { AndroidDeviceBridge.generateQrBitmap(payload, 512) }
    Box(
        modifier = modifier
            .size(size)
            .clip(RoundedCornerShape(14.dp))
            .background(Color.White)
            .border(1.dp, PosColors.Slate200, RoundedCornerShape(14.dp))
            .padding(8.dp),
        contentAlignment = Alignment.Center
    ) {
        if (bmp != null) {
            Image(
                bitmap = bmp.asImageBitmap(),
                contentDescription = "Payment QR code",
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Fit
            )
        } else {
            Icon(Icons.Rounded.QrCode2, contentDescription = "QR fallback", tint = PosColors.Slate400, modifier = Modifier.size(48.dp))
        }
    }
}

@Composable
fun BarcodeCanvas(code: String, modifier: Modifier = Modifier, barHeight: Dp = 38.dp) {
    val encoded = remember(code) { OpsMath.encodeCode128Bars(code) }
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = modifier) {
        Canvas(modifier = Modifier.fillMaxWidth().height(barHeight)) {
            val totalMod = encoded.totalModules.coerceAtLeast(1)
            val modWidth = size.width / totalMod
            var x = 0f
            encoded.widths.forEachIndexed { idx, w ->
                val widthPx = w * modWidth
                if (idx % 2 == 0) {
                    drawRect(color = PosColors.Slate900, topLeft = Offset(x, 0f), size = Size(widthPx, size.height))
                }
                x += widthPx
            }
        }
        Spacer(Modifier.height(2.dp))
        Text(
            text = code,
            style = MaterialTheme.typography.labelSmall,
            color = PosColors.Slate700,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
fun MerchantQrCard(
    qrState: ResolvedCheckoutQr,
    modifier: Modifier = Modifier,
    compact: Boolean = false
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = PosColors.Slate50,
        border = BorderStroke(1.dp, PosColors.Slate200)
    ) {
        Column(
            modifier = Modifier.padding(if (compact) 12.dp else 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Surface(shape = RoundedCornerShape(8.dp), color = PosColors.Indigo100) {
                    Text(
                        text = qrState.channelLabel,
                        style = MaterialTheme.typography.labelMedium,
                        color = PosColors.Indigo700,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                    )
                }
                if (qrState.isDynamicAmount) {
                    Surface(shape = RoundedCornerShape(8.dp), color = PosColors.Emerald100) {
                        Row(
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(3.dp)
                        ) {
                            Icon(Icons.Rounded.Verified, contentDescription = null, tint = PosColors.Emerald700, modifier = Modifier.size(12.dp))
                            Text("Amount Locked", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = PosColors.Emerald700)
                        }
                    }
                }
            }

            Spacer(Modifier.height(10.dp))

            when (qrState.mode) {
                CheckoutQrMode.EMVCO -> {
                    qrState.qrPayload?.let { payload ->
                        QrCodeGraphic(payload = payload, size = if (compact) 150.dp else 190.dp)
                    }
                }
                CheckoutQrMode.IMAGE -> {
                    Text(
                        text = "Uploaded Merchant QR Photo Configured",
                        style = MaterialTheme.typography.bodySmall,
                        color = PosColors.Slate700
                    )
                    qrState.qrImageDataUrl?.let { dataUrl ->
                        val base64 = dataUrl.substringAfter("base64,", "")
                        val bmp = remember(base64) {
                            runCatching {
                                val bytes = android.util.Base64.decode(base64, android.util.Base64.DEFAULT)
                                android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                            }.getOrNull()
                        }
                        if (bmp != null) {
                            Spacer(Modifier.height(8.dp))
                            Image(
                                bitmap = bmp.asImageBitmap(),
                                contentDescription = "Uploaded QR",
                                modifier = Modifier
                                    .size(if (compact) 150.dp else 190.dp)
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(Color.White)
                                    .border(1.dp, PosColors.Slate200, RoundedCornerShape(12.dp)),
                                contentScale = ContentScale.Fit
                            )
                        }
                    }
                }
                CheckoutQrMode.MANUAL -> {
                    Surface(shape = RoundedCornerShape(12.dp), color = Color.White, border = BorderStroke(1.dp, PosColors.Slate200)) {
                        Column(modifier = Modifier.padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("SEND PAYMENT TO", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = PosColors.Slate500)
                            Spacer(Modifier.height(4.dp))
                            Text(qrState.accountNumber, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = PosColors.Slate900)
                            Text(qrState.merchantName, style = MaterialTheme.typography.bodySmall, color = PosColors.Slate600)
                        }
                    }
                }
                CheckoutQrMode.UNCONFIGURED -> {
                    Text(
                        text = qrState.error ?: "No merchant QR configured yet. Setup in Settings → Payment QR.",
                        style = MaterialTheme.typography.bodySmall,
                        color = PosColors.Amber700
                    )
                }
            }

            if (qrState.amount > 0.0) {
                Spacer(Modifier.height(8.dp))
                Text(
                    text = "Pay Exactly ${PosMath.formatPeso(qrState.amount)}",
                    style = MaterialTheme.typography.titleMedium,
                    color = PosColors.Emerald700
                )
            }
            if (qrState.accountNumber.isNotEmpty() && qrState.mode != CheckoutQrMode.MANUAL) {
                Text(
                    text = "${qrState.merchantName} · ${qrState.accountNumber}",
                    style = MaterialTheme.typography.bodySmall,
                    color = PosColors.Slate600
                )
            }
        }
    }
}

@Composable
fun ToastOverlay(toasts: List<ToastItem>, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        for (toast in toasts) {
            val (bg, icon) = when (toast.type) {
                ToastType.SUCCESS -> PosColors.Slate900 to Icons.Rounded.CheckCircle
                ToastType.WARNING -> PosColors.Amber700 to Icons.Rounded.WarningAmber
                ToastType.ERROR -> PosColors.Rose700 to Icons.Rounded.ErrorOutline
            }
            val iconTint = when (toast.type) {
                ToastType.SUCCESS -> PosColors.Emerald500
                else -> Color.White
            }
            AnimatedVisibility(visible = true, enter = fadeIn() + slideInVertically(), exit = fadeOut() + slideOutVertically()) {
                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = bg,
                    shadowElevation = 6.dp
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(icon, contentDescription = null, tint = iconTint, modifier = Modifier.size(18.dp))
                        Text(toast.message, color = Color.White, style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
        }
    }
}
