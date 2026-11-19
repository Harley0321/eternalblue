package com.example.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

val EmeraldPrimary = Color(0xFF059669)
val EmeraldDark = Color(0xFF047857)
val EmeraldLightBg = Color(0xFFECFDF5)
val EmeraldGlowCore = Color(0xFF34D399)
val EmeraldGlowHighlight = Color(0xFF6EE7B7)
val EmeraldGlowNeon = Color(0xFF00FF85)
val EmeraldDeepCanvas = Color(0xFF07110C)
val SlateTopBar = Color(0xFF020617)
val SlateSurface = Color(0xFFF4F6F8)
val SlateBorder = Color(0xFFE2E8F0)
val SlateText = Color(0xFF0F172A)
val SlateMuted = Color(0xFF64748B)
val IndigoAccent = Color(0xFF4F46E5)
val AmberWarn = Color(0xFFD97706)
val RoseDanger = Color(0xFFE11D48)

private val EternalBlueColorScheme = lightColorScheme(
    primary = EmeraldPrimary,
    onPrimary = Color.White,
    primaryContainer = EmeraldLightBg,
    onPrimaryContainer = Color(0xFF064E3B),
    secondary = IndigoAccent,
    onSecondary = Color.White,
    background = SlateSurface,
    onBackground = SlateText,
    surface = Color.White,
    onSurface = SlateText,
    surfaceVariant = Color(0xFFF1F5F9),
    onSurfaceVariant = SlateMuted,
    outline = SlateBorder,
    error = RoseDanger,
    onError = Color.White
)

private val EternalBlueTypography = Typography(
    titleLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.ExtraBold, fontSize = 20.sp),
    titleMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 16.sp),
    bodyMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 14.sp),
    labelMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 12.sp)
)

@Composable
fun EternalBlueTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = EternalBlueColorScheme,
        typography = EternalBlueTypography,
        content = content
    )
}
