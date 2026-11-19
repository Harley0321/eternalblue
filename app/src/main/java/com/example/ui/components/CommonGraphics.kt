package com.example.ui.components

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AcUnit
import androidx.compose.material.icons.filled.Cookie
import androidx.compose.material.icons.filled.Eco
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.LocalDrink
import androidx.compose.material.icons.filled.LocalGroceryStore
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material.icons.filled.ShoppingBasket
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material.icons.filled.WaterDrop
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.R
import com.example.domain.PaymentQr
import com.example.domain.PosMath
import com.example.model.ToastItem
import com.example.model.ToastType
import com.example.ui.theme.AmberWarn
import com.example.ui.theme.EmeraldDark
import com.example.ui.theme.EmeraldGlowCore
import com.example.ui.theme.EmeraldGlowHighlight
import com.example.ui.theme.EmeraldGlowNeon
import com.example.ui.theme.EmeraldLightBg
import com.example.ui.theme.EmeraldPrimary
import com.example.ui.theme.IndigoAccent
import com.example.ui.theme.RoseDanger
import com.example.ui.theme.SlateBorder
import com.example.ui.theme.SlateMuted
import com.example.ui.theme.SlateText

@Composable
fun GlowingEmeraldStoreName(
    text: String,
    modifier: Modifier = Modifier,
    fontSize: TextUnit = 16.sp
) {
    val transition = rememberInfiniteTransition(label = "emeraldStoreGlow")
    val glowPulse by transition.animateFloat(
        initialValue = 0.72f,
        targetValue = 1.0f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 2200, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "glowPulse"
    )

    val baseStyle = TextStyle(
        fontSize = fontSize,
        fontWeight = FontWeight.ExtraBold,
        letterSpacing = 0.3.sp
    )

    Box(modifier = modifier) {
        // Layer 1: Wide atmospheric Cyber-Emerald bloom
        Text(
            text = text,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            color = Color.Transparent,
            style = baseStyle.copy(
                shadow = Shadow(
                    color = EmeraldGlowNeon.copy(alpha = 0.55f * glowPulse),
                    offset = Offset.Zero,
                    blurRadius = 28f
                )
            )
        )
        // Layer 2: Mid saturated emerald aura
        Text(
            text = text,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            color = Color.Transparent,
            style = baseStyle.copy(
                shadow = Shadow(
                    color = EmeraldPrimary.copy(alpha = 0.90f),
                    offset = Offset.Zero,
                    blurRadius = 14f
                )
            )
        )
        // Layer 3: Tight luminous mint-emerald rim
        Text(
            text = text,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            color = Color.Transparent,
            style = baseStyle.copy(
                shadow = Shadow(
                    color = EmeraldGlowHighlight.copy(alpha = 0.95f * glowPulse),
                    offset = Offset.Zero,
                    blurRadius = 5f
                )
            )
        )
        // Layer 4: Crisp, high-contrast emerald green core
        Text(
            text = text,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            color = EmeraldGlowCore,
            style = baseStyle.copy(
                shadow = Shadow(
                    color = EmeraldGlowNeon.copy(alpha = 0.45f),
                    offset = Offset.Zero,
                    blurRadius = 2f
                )
            )
        )
    }
}

@Composable
fun StoreEmblem(iconKey: String?, size: Dp = 36.dp) {
    if (iconKey == "brand") {
        Image(
            painter = painterResource(id = R.drawable.eternalblue_pos_icon),
            contentDescription = "Store emblem",
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .size(size)
                .clip(RoundedCornerShape(10.dp))
                .border(1.dp, EmeraldPrimary.copy(alpha = 0.5f), RoundedCornerShape(10.dp))
        )
        return
    }
    val vec = when (iconKey) {
        "store" -> Icons.Filled.Storefront
        "bag" -> Icons.Filled.ShoppingBag
        "receipt" -> Icons.Filled.ReceiptLong
        else -> Icons.Filled.ShoppingBasket
    }
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .size(size)
            .clip(RoundedCornerShape(10.dp))
            .background(EmeraldPrimary.copy(alpha = 0.2f))
            .border(1.dp, EmeraldPrimary.copy(alpha = 0.4f), RoundedCornerShape(10.dp))
    ) {
        Icon(vec, contentDescription = null, tint = Color(0xFF34D399), modifier = Modifier.size(size * 0.55f))
    }
}

@Composable
fun ProductCategoryBadge(category: String, size: Dp = 36.dp) {
    val c = category.lowercase()
    val (vec, bg, fg) = when {
        c.contains("meat") || c.contains("frozen") -> Triple(Icons.Filled.AcUnit, Color(0xFFFFF1F2), RoseDanger)
        c.contains("rice") || c.contains("staple") -> Triple(Icons.Filled.Eco, Color(0xFFFFFBEB), AmberWarn)
        c.contains("canned") || c.contains("noodle") -> Triple(Icons.Filled.Restaurant, Color(0xFFEEF2FF), IndigoAccent)
        c.contains("beverage") || c.contains("drink") -> Triple(Icons.Filled.LocalDrink, Color(0xFFF0F9FF), Color(0xFF0284C7))
        c.contains("condiment") -> Triple(Icons.Filled.WaterDrop, Color(0xFFFFFBEB), AmberWarn)
        c.contains("snack") -> Triple(Icons.Filled.Cookie, Color(0xFFFFF1F2), RoseDanger)
        c.contains("dairy") -> Triple(Icons.Filled.LocalGroceryStore, EmeraldLightBg, EmeraldDark)
        else -> Triple(Icons.Filled.Inventory2, Color(0xFFF1F5F9), SlateMuted)
    }
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .size(size)
            .clip(RoundedCornerShape(10.dp))
            .background(bg)
            .border(1.dp, fg.copy(alpha = 0.2f), RoundedCornerShape(10.dp))
    ) {
        Icon(vec, contentDescription = null, tint = fg, modifier = Modifier.size(size * 0.52f))
    }
}

@Composable
fun KpiCard(
    title: String,
    value: String,
    sub: String? = null,
    valueColor: Color = SlateText,
    active: Boolean = false,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null
) {
    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = if (active) EmeraldLightBg else Color.White),
        border = BorderStroke(if (active) 1.5.dp else 1.dp, if (active) EmeraldPrimary else SlateBorder),
        modifier = modifier.let { if (onClick != null) it.clickable { onClick() } else it }
    ) {
        Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp)) {
            Text(title.uppercase(), fontSize = 10.sp, fontWeight = FontWeight.Bold, color = SlateMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.height(2.dp))
            Text(value, fontSize = 17.sp, fontWeight = FontWeight.ExtraBold, fontFamily = FontFamily.Monospace, color = valueColor, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (!sub.isNullOrBlank()) {
                Text(sub, fontSize = 11.sp, color = SlateMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

@Composable
fun QrBitmapCard(qr: PaymentQr.ResolvedQr, qrSize: Dp = 170.dp) {
    val bmp = remember(qr.qrPayload) {
        qr.qrPayload?.let { PaymentQr.renderQrBitmap(it, 480) }
    }
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = Color(0xFFEEF2FF),
        border = BorderStroke(1.dp, Color(0xFFC7D2FE)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(14.dp)
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                Surface(color = IndigoAccent, shape = RoundedCornerShape(6.dp)) {
                    Text(qr.channelLabel, color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp))
                }
                if (qr.isDynamicAmount) {
                    Surface(color = EmeraldLightBg, shape = RoundedCornerShape(6.dp)) {
                        Text("Exact Amount", color = EmeraldDark, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp))
                    }
                }
            }
            Spacer(Modifier.height(6.dp))
            Text(qr.merchantName, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = SlateText)
            if (qr.accountNumber.isNotBlank()) {
                Text(qr.accountNumber, fontFamily = FontFamily.Monospace, fontSize = 12.sp, color = SlateMuted)
            }
            Spacer(Modifier.height(10.dp))
            if (bmp != null) {
                Image(
                    bitmap = bmp.asImageBitmap(),
                    contentDescription = "Payment QR",
                    modifier = Modifier
                        .size(qrSize)
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color.White)
                        .padding(6.dp)
                )
            } else if (qr.mode == "MANUAL") {
                Surface(color = Color.White, shape = RoundedCornerShape(12.dp), border = BorderStroke(1.dp, Color(0xFFC7D2FE))) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp)) {
                        Text("Send via ${qr.channelLabel}", fontSize = 11.sp, color = SlateMuted)
                        Text(qr.accountNumber, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp, color = IndigoAccent)
                    }
                }
            } else {
                Text(
                    "Set up your QR Ph payload or mobile account number in Settings → Payment QR.",
                    fontSize = 12.sp,
                    color = AmberWarn,
                    modifier = Modifier.padding(8.dp)
                )
            }
            if (qr.amount > 0.0) {
                Spacer(Modifier.height(8.dp))
                Text(PosMath.formatPeso(qr.amount), fontSize = 18.sp, fontWeight = FontWeight.ExtraBold, fontFamily = FontFamily.Monospace, color = EmeraldDark)
            }
        }
    }
}

@Composable
fun ToastHostOverlay(toasts: List<ToastItem>, modifier: Modifier = Modifier) {
    if (toasts.isEmpty()) return
    Column(
        verticalArrangement = Arrangement.spacedBy(6.dp),
        modifier = modifier.padding(12.dp)
    ) {
        toasts.forEach { t ->
            val bg = when (t.type) {
                ToastType.ERROR -> Color(0xFF9F1239)
                ToastType.WARNING -> Color(0xFF92400E)
                ToastType.INFO -> Color(0xFF0F172A)
            }
            Surface(shape = RoundedCornerShape(12.dp), color = bg, shadowElevation = 6.dp) {
                Text(
                    t.message,
                    color = Color.White,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp)
                )
            }
        }
    }
}
