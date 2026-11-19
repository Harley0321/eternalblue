package com.example.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.BusinessCenter
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.PointOfSale
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.model.TabName
import com.example.ui.theme.EmeraldPrimary
import com.example.ui.theme.IndigoAccent
import com.example.ui.theme.SlateTopBar
import com.example.viewmodel.PosUiState

@Composable
fun PosTopBar(
    state: PosUiState,
    isWide: Boolean,
    onAskAi: () -> Unit,
    onLockPos: () -> Unit,
    onOpenUpdateSettings: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(SlateTopBar)
            .statusBarsPadding()
            .padding(horizontal = 14.dp, vertical = 10.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            StoreEmblem(iconKey = state.settings.storeIcon, size = 36.dp)

            Column(modifier = Modifier.weight(1f)) {
                GlowingEmeraldStoreName(
                    text = state.settings.storeName,
                    fontSize = if (isWide) 19.sp else 17.sp,
                    modifier = Modifier.fillMaxWidth()
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.padding(top = 2.dp)
                ) {
                    Text(
                        state.activeShift?.cashierName ?: state.settings.storeAddress,
                        color = Color(0xFF94A3B8),
                        fontSize = 11.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false)
                    )
                    Surface(color = EmeraldPrimary.copy(alpha = 0.2f), shape = RoundedCornerShape(4.dp)) {
                        Text(
                            "OFFLINE",
                            color = Color(0xFF34D399),
                            fontSize = 9.sp,
                            fontWeight = FontWeight.ExtraBold,
                            modifier = Modifier.padding(horizontal = 5.dp, vertical = 1.dp)
                        )
                    }
                    if (state.updateInfo?.isNewer == true) {
                        Surface(
                            color = Color(0xFF00FF85).copy(alpha = 0.22f),
                            shape = RoundedCornerShape(4.dp),
                            modifier = Modifier.clickable { onOpenUpdateSettings() }
                        ) {
                            Text(
                                "UPDATE",
                                color = Color(0xFF6EE7B7),
                                fontSize = 9.sp,
                                fontWeight = FontWeight.ExtraBold,
                                modifier = Modifier.padding(horizontal = 5.dp, vertical = 1.dp)
                            )
                        }
                    }
                }
            }

            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                Button(
                    onClick = onAskAi,
                    colors = ButtonDefaults.buttonColors(containerColor = IndigoAccent),
                    shape = RoundedCornerShape(10.dp),
                    contentPadding = PaddingValues(
                        horizontal = if (isWide) 12.dp else 10.dp,
                        vertical = 6.dp
                    )
                ) {
                    Icon(Icons.Filled.AutoAwesome, contentDescription = null, modifier = Modifier.size(15.dp))
                    Spacer(Modifier.width(4.dp))
                    Text(
                        if (isWide) "Ask AI (${state.storePulse.healthScore})" else "AI ${state.storePulse.healthScore}",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        softWrap = false
                    )
                }
                if (state.pinConfigured && !state.terminalLocked) {
                    IconButton(onClick = onLockPos, modifier = Modifier.size(36.dp)) {
                        Icon(Icons.Filled.Lock, contentDescription = "Lock POS", tint = Color(0xFFCBD5E1), modifier = Modifier.size(19.dp))
                    }
                }
            }
        }
    }
}

private fun tabIcon(tab: TabName) = when (tab) {
    TabName.POS -> Icons.Filled.PointOfSale
    TabName.INVENTORY -> Icons.Filled.Inventory2
    TabName.OPERATIONS -> Icons.Filled.BusinessCenter
    TabName.SALES -> Icons.Filled.BarChart
    TabName.SETTINGS -> Icons.Filled.Settings
}

@Composable
fun PosBottomBar(activeTab: TabName, onSelect: (TabName) -> Unit) {
    NavigationBar(containerColor = Color.White) {
        TabName.entries.forEach { tab ->
            NavigationBarItem(
                selected = activeTab == tab,
                onClick = { onSelect(tab) },
                icon = { Icon(tabIcon(tab), contentDescription = tab.label) },
                label = { Text(tab.label, fontSize = 11.sp, maxLines = 1) }
            )
        }
    }
}

@Composable
fun PosNavRail(activeTab: TabName, onSelect: (TabName) -> Unit) {
    NavigationRail(containerColor = Color.White) {
        TabName.entries.forEach { tab ->
            NavigationRailItem(
                selected = activeTab == tab,
                onClick = { onSelect(tab) },
                icon = { Icon(tabIcon(tab), contentDescription = tab.label) },
                label = { Text(tab.label, fontSize = 11.sp, maxLines = 1) }
            )
        }
    }
}
