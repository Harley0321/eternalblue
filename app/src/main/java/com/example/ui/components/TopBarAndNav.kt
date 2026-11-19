package com.example.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.displayCutout
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.BarChart
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.PointOfSale
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Storefront
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.BarChart
import androidx.compose.material.icons.rounded.Inventory2
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.PointOfSale
import androidx.compose.material.icons.rounded.QrCodeScanner
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Storefront
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarDefaults
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.NavigationRailItemDefaults
import androidx.compose.material3.SmallFloatingActionButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.model.TabName
import com.example.ui.theme.PosColors

@Composable
fun PosTopBar(
    storeName: String,
    storeIcon: String?,
    activeCashierName: String?,
    hasPin: Boolean,
    isWideLayout: Boolean = false,
    onOpenAssistant: () -> Unit,
    onOpenSettings: () -> Unit,
    onLockTerminal: () -> Unit
) {
    val topBarInsets = WindowInsets.statusBars.union(WindowInsets.displayCutout)
        .only(WindowInsetsSides.Top + WindowInsetsSides.Horizontal)

    Surface(
        color = PosColors.Slate950,
        contentColor = Color.White,
        shadowElevation = 4.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .windowInsetsPadding(topBarInsets)
                .padding(horizontal = if (isWideLayout) 18.dp else 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.weight(1f)
            ) {
                StoreEmblem(storeIcon = storeIcon, size = 36.dp)
                Spacer(Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = storeName.ifBlank { "EternalBlue Mart" },
                        style = MaterialTheme.typography.titleMedium,
                        color = Color.White,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = PosColors.Emerald600.copy(alpha = 0.2f),
                            border = BorderStroke(0.5.dp, PosColors.Emerald500.copy(alpha = 0.45f))
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 1.dp)
                            ) {
                                Surface(shape = CircleShape, color = PosColors.Emerald500, modifier = Modifier.size(6.dp)) {}
                                Text(
                                    text = "OFFLINE POS",
                                    fontSize = 9.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    color = PosColors.Emerald100
                                )
                            }
                        }
                        if (!activeCashierName.isNullOrBlank()) {
                            Text(
                                text = "• $activeCashierName",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Medium,
                                color = PosColors.Slate300,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                }
            }

            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = PosColors.Indigo600,
                    modifier = Modifier
                        .height(40.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .clickable(onClick = onOpenAssistant)
                        .testTag("top_assistant_button")
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(5.dp)
                    ) {
                        Icon(Icons.Rounded.AutoAwesome, contentDescription = "Ask Store Assistant", tint = Color.White, modifier = Modifier.size(16.dp))
                        Text(if (isWideLayout) "Store Pulse" else "Ask AI", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color.White)
                    }
                }

                if (hasPin) {
                    IconButton(
                        onClick = onLockTerminal,
                        modifier = Modifier
                            .size(48.dp)
                            .testTag("top_lock_button")
                    ) {
                        Icon(Icons.Rounded.Lock, contentDescription = "Lock POS Terminal", tint = PosColors.Slate300)
                    }
                }

                IconButton(
                    onClick = onOpenSettings,
                    modifier = Modifier
                        .size(48.dp)
                        .testTag("top_settings_button")
                ) {
                    Icon(Icons.Rounded.Settings, contentDescription = "Store Settings", tint = PosColors.Slate200)
                }
            }
        }
    }
}

@Composable
fun PosBottomBar(
    activeTab: TabName,
    lowStockCount: Int,
    outOfStockCount: Int,
    overdueUtangCount: Int,
    onSelectTab: (TabName) -> Unit
) {
    Column {
        HorizontalDivider(color = PosColors.Slate200)
        NavigationBar(
            containerColor = Color.White,
            tonalElevation = 0.dp,
            windowInsets = NavigationBarDefaults.windowInsets
        ) {
            val navColors = NavigationBarItemDefaults.colors(
                selectedIconColor = PosColors.Emerald700,
                selectedTextColor = PosColors.Emerald700,
                indicatorColor = PosColors.Emerald50,
                unselectedIconColor = PosColors.Slate500,
                unselectedTextColor = PosColors.Slate500
            )

            NavigationBarItem(
                selected = activeTab == TabName.pos,
                onClick = { onSelectTab(TabName.pos) },
                icon = {
                    Icon(
                        if (activeTab == TabName.pos) Icons.Rounded.PointOfSale else Icons.Outlined.PointOfSale,
                        contentDescription = "POS Cashier"
                    )
                },
                label = { Text("POS", fontWeight = FontWeight.Bold, fontSize = 11.sp) },
                colors = navColors,
                modifier = Modifier.testTag("nav_pos")
            )

            NavigationBarItem(
                selected = activeTab == TabName.inventory,
                onClick = { onSelectTab(TabName.inventory) },
                icon = {
                    BadgedBox(
                        badge = {
                            if (lowStockCount > 0) {
                                Badge(containerColor = if (outOfStockCount > 0) PosColors.Rose600 else PosColors.Amber600) {
                                    Text(lowStockCount.coerceAtMost(99).toString(), fontSize = 10.sp)
                                }
                            }
                        }
                    ) {
                        Icon(
                            if (activeTab == TabName.inventory) Icons.Rounded.Inventory2 else Icons.Outlined.Inventory2,
                            contentDescription = "Stock Inventory"
                        )
                    }
                },
                label = { Text("Stock", fontWeight = FontWeight.Bold, fontSize = 11.sp) },
                colors = navColors,
                modifier = Modifier.testTag("nav_stock")
            )

            NavigationBarItem(
                selected = activeTab == TabName.operations,
                onClick = { onSelectTab(TabName.operations) },
                icon = {
                    BadgedBox(
                        badge = {
                            if (overdueUtangCount > 0) {
                                Badge(containerColor = PosColors.Rose600) {
                                    Text(overdueUtangCount.coerceAtMost(99).toString(), fontSize = 10.sp)
                                }
                            }
                        }
                    ) {
                        Icon(
                            if (activeTab == TabName.operations) Icons.Rounded.Storefront else Icons.Outlined.Storefront,
                            contentDescription = "Store Operations"
                        )
                    }
                },
                label = { Text("Ops", fontWeight = FontWeight.Bold, fontSize = 11.sp) },
                colors = navColors,
                modifier = Modifier.testTag("nav_ops")
            )

            NavigationBarItem(
                selected = activeTab == TabName.sales,
                onClick = { onSelectTab(TabName.sales) },
                icon = {
                    Icon(
                        if (activeTab == TabName.sales) Icons.Rounded.BarChart else Icons.Outlined.BarChart,
                        contentDescription = "Sales & Reports"
                    )
                },
                label = { Text("Sales", fontWeight = FontWeight.Bold, fontSize = 11.sp) },
                colors = navColors,
                modifier = Modifier.testTag("nav_sales")
            )
        }
    }
}

@Composable
fun PosNavigationRail(
    activeTab: TabName,
    lowStockCount: Int,
    outOfStockCount: Int,
    overdueUtangCount: Int,
    onQuickScan: () -> Unit,
    onSelectTab: (TabName) -> Unit
) {
    Row(modifier = Modifier.fillMaxHeight()) {
        NavigationRail(
            containerColor = Color.White,
            modifier = Modifier
                .fillMaxHeight()
                .navigationBarsPadding()
                .padding(vertical = 8.dp),
            header = {
                SmallFloatingActionButton(
                    onClick = onQuickScan,
                    containerColor = PosColors.Emerald600,
                    contentColor = Color.White,
                    modifier = Modifier
                        .padding(top = 4.dp, bottom = 8.dp)
                        .size(48.dp)
                        .testTag("rail_quick_scan")
                ) {
                    Icon(Icons.Rounded.QrCodeScanner, contentDescription = "Quick Scan Barcode")
                }
            }
        ) {
            val colors = NavigationRailItemDefaults.colors(
                selectedIconColor = PosColors.Emerald700,
                selectedTextColor = PosColors.Emerald700,
                indicatorColor = PosColors.Emerald50,
                unselectedIconColor = PosColors.Slate500,
                unselectedTextColor = PosColors.Slate500
            )

            NavigationRailItem(
                selected = activeTab == TabName.pos,
                onClick = { onSelectTab(TabName.pos) },
                icon = {
                    Icon(
                        if (activeTab == TabName.pos) Icons.Rounded.PointOfSale else Icons.Outlined.PointOfSale,
                        contentDescription = "POS"
                    )
                },
                label = { Text("POS", fontWeight = FontWeight.Bold) },
                colors = colors,
                modifier = Modifier.testTag("rail_pos")
            )
            NavigationRailItem(
                selected = activeTab == TabName.inventory,
                onClick = { onSelectTab(TabName.inventory) },
                icon = {
                    BadgedBox(badge = {
                        if (lowStockCount > 0) Badge(containerColor = if (outOfStockCount > 0) PosColors.Rose600 else PosColors.Amber600) { Text("$lowStockCount") }
                    }) {
                        Icon(
                            if (activeTab == TabName.inventory) Icons.Rounded.Inventory2 else Icons.Outlined.Inventory2,
                            contentDescription = "Stock"
                        )
                    }
                },
                label = { Text("Stock", fontWeight = FontWeight.Bold) },
                colors = colors,
                modifier = Modifier.testTag("rail_stock")
            )
            NavigationRailItem(
                selected = activeTab == TabName.operations,
                onClick = { onSelectTab(TabName.operations) },
                icon = {
                    BadgedBox(badge = {
                        if (overdueUtangCount > 0) Badge(containerColor = PosColors.Rose600) { Text("$overdueUtangCount") }
                    }) {
                        Icon(
                            if (activeTab == TabName.operations) Icons.Rounded.Storefront else Icons.Outlined.Storefront,
                            contentDescription = "Ops"
                        )
                    }
                },
                label = { Text("Ops", fontWeight = FontWeight.Bold) },
                colors = colors,
                modifier = Modifier.testTag("rail_ops")
            )
            NavigationRailItem(
                selected = activeTab == TabName.sales,
                onClick = { onSelectTab(TabName.sales) },
                icon = {
                    Icon(
                        if (activeTab == TabName.sales) Icons.Rounded.BarChart else Icons.Outlined.BarChart,
                        contentDescription = "Sales"
                    )
                },
                label = { Text("Sales", fontWeight = FontWeight.Bold) },
                colors = colors,
                modifier = Modifier.testTag("rail_sales")
            )

            Spacer(Modifier.weight(1f))

            NavigationRailItem(
                selected = activeTab == TabName.settings,
                onClick = { onSelectTab(TabName.settings) },
                icon = {
                    Icon(
                        if (activeTab == TabName.settings) Icons.Rounded.Settings else Icons.Outlined.Settings,
                        contentDescription = "Settings"
                    )
                },
                label = { Text("Settings", fontWeight = FontWeight.Bold) },
                colors = colors,
                modifier = Modifier.testTag("rail_settings")
            )
        }
        VerticalDivider(color = PosColors.Slate200)
    }
}
