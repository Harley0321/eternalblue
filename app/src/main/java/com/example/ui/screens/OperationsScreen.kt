package com.example.ui.screens

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.model.OperationsSubTab
import com.example.ui.theme.PosColors
import com.example.viewmodel.PosViewModel

@Composable
fun OperationsScreen(vm: PosViewModel) {
    val subTab by vm.opsSubTab.collectAsStateWithLifecycle()

    Column(modifier = Modifier.fillMaxSize()) {
        Surface(color = Color.White, shadowElevation = 1.dp) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OperationsSubTab.entries.forEach { tab ->
                    FilterChip(
                        selected = subTab == tab,
                        onClick = { vm.setOpsSubTab(tab) },
                        label = { Text(tab.label, fontWeight = FontWeight.Bold, fontSize = 12.sp) },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = PosColors.Slate900,
                            selectedLabelColor = Color.White
                        ),
                        modifier = Modifier.testTag("ops_tab_${tab.name}")
                    )
                }
            }
        }

        when (subTab) {
            OperationsSubTab.utang -> UtangSukiTab(vm)
            OperationsSubTab.repack -> RepackTingiTab(vm)
            OperationsSubTab.shift -> ShiftGastosTab(vm)
            OperationsSubTab.services -> DigitalServicesTab(vm)
            OperationsSubTab.printing -> PrinterLabelsTab(vm)
        }
    }
}
