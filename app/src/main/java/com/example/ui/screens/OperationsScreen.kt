package com.example.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.model.OperationsSubTab
import com.example.ui.theme.SlateBorder
import com.example.viewmodel.PosUiState
import com.example.viewmodel.PosViewModel

@Composable
fun OperationsScreen(state: PosUiState, vm: PosViewModel) {
    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier
                .fillMaxWidth()
                .background(Color.White)
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 12.dp, vertical = 8.dp)
        ) {
            OperationsSubTab.entries.forEach { tab ->
                FilterChip(
                    selected = state.opsSubTab == tab,
                    onClick = { vm.setOpsSubTab(tab) },
                    label = { Text(tab.label, fontSize = 12.sp) }
                )
            }
        }
        HorizontalDivider(color = SlateBorder)
        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
            when (state.opsSubTab) {
                OperationsSubTab.UTANG -> UtangSubTab(state, vm)
                OperationsSubTab.REPACK -> RepackSubTab(state, vm)
                OperationsSubTab.SHIFT -> ShiftSubTab(state, vm)
                OperationsSubTab.SERVICES -> ServicesSubTab(state, vm)
                OperationsSubTab.PRINTING -> PrintingSubTab(state, vm)
            }
        }
    }
}
