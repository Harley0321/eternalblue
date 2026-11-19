package com.example.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

object PosColors {
    val Slate950 = Color(0xFF020617)
    val Slate900 = Color(0xFF0F172A)
    val Slate800 = Color(0xFF1E293B)
    val Slate700 = Color(0xFF334155)
    val Slate600 = Color(0xFF475569)
    val Slate500 = Color(0xFF64748B)
    val Slate400 = Color(0xFF94A3B8)
    val Slate300 = Color(0xFFCBD5E1)
    val Slate200 = Color(0xFFE2E8F0)
    val Slate100 = Color(0xFFF4F6F8)
    val Slate50 = Color(0xFFF8FAFC)

    val Emerald700 = Color(0xFF047857)
    val Emerald600 = Color(0xFF059669)
    val Emerald500 = Color(0xFF10B981)
    val Emerald100 = Color(0xFFD1FAE5)
    val Emerald50 = Color(0xFFECFDF5)

    val Indigo700 = Color(0xFF4338CA)
    val Indigo600 = Color(0xFF4F46E5)
    val Indigo100 = Color(0xFFE0E7FF)
    val Indigo50 = Color(0xFFEEF2FF)

    val Amber700 = Color(0xFFB45309)
    val Amber600 = Color(0xFFD97706)
    val Amber500 = Color(0xFFF59E0B)
    val Amber100 = Color(0xFFFEF3C7)
    val Amber50 = Color(0xFFFFFBEB)

    val Rose700 = Color(0xFFBE123C)
    val Rose600 = Color(0xFFE11D48)
    val Rose100 = Color(0xFFFFE4E6)
    val Rose50 = Color(0xFFFFF1F2)

    val Sky700 = Color(0xFF0369A1)
    val Sky600 = Color(0xFF0284C7)
    val Sky50 = Color(0xFFF0F9FF)

    val Orange700 = Color(0xFFC2410C)
    val Orange50 = Color(0xFFFFF7ED)

    val Teal700 = Color(0xFF0F766E)
    val Teal50 = Color(0xFFF0FDFA)
}

private val LightPosColorScheme = lightColorScheme(
    primary = PosColors.Emerald600,
    onPrimary = Color.White,
    primaryContainer = PosColors.Emerald50,
    onPrimaryContainer = PosColors.Emerald700,
    secondary = PosColors.Indigo600,
    onSecondary = Color.White,
    secondaryContainer = PosColors.Indigo50,
    onSecondaryContainer = PosColors.Indigo700,
    tertiary = PosColors.Slate900,
    onTertiary = Color.White,
    background = PosColors.Slate100,
    onBackground = PosColors.Slate900,
    surface = Color.White,
    onSurface = PosColors.Slate900,
    surfaceVariant = PosColors.Slate50,
    onSurfaceVariant = PosColors.Slate600,
    outline = PosColors.Slate200,
    outlineVariant = PosColors.Slate300,
    error = PosColors.Rose600,
    onError = Color.White,
    errorContainer = PosColors.Rose50,
    onErrorContainer = PosColors.Rose700
)

val PosTypography = Typography(
    titleLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.ExtraBold,
        fontSize = 20.sp,
        lineHeight = 26.sp,
        letterSpacing = (-0.3).sp
    ),
    titleMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 16.sp,
        lineHeight = 22.sp
    ),
    titleSmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 13.sp,
        lineHeight = 18.sp
    ),
    bodyLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 15.sp,
        lineHeight = 20.sp
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 13.sp,
        lineHeight = 18.sp
    ),
    bodySmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 11.sp,
        lineHeight = 15.sp
    ),
    labelMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 12.sp,
        lineHeight = 16.sp
    ),
    labelSmall = TextStyle(
        fontFamily = FontFamily.Monospace,
        fontWeight = FontWeight.SemiBold,
        fontSize = 11.sp,
        lineHeight = 14.sp,
        fontFeatureSettings = "tnum"
    )
)

val PosShapes = Shapes(
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(14.dp),
    large = RoundedCornerShape(18.dp),
    extraLarge = RoundedCornerShape(24.dp)
)

@Composable
fun EternalBluePosTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = LightPosColorScheme,
        typography = PosTypography,
        shapes = PosShapes,
        content = content
    )
}
