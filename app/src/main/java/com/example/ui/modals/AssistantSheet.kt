package com.example.ui.modals

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.domain.AssistantEngine
import com.example.ui.theme.IndigoAccent
import com.example.ui.theme.SlateBorder
import com.example.ui.theme.SlateMuted
import com.example.ui.theme.SlateSurface
import com.example.viewmodel.PosUiState
import com.example.viewmodel.PosViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AssistantSheet(state: PosUiState, vm: PosViewModel) {
    if (!state.assistantOpen) return
    var input by remember { mutableStateOf("") }

    ModalBottomSheet(onDismissRequest = { vm.setAssistantOpen(false) }) {
        Column(modifier = Modifier.fillMaxWidth().height(540.dp).padding(horizontal = 14.dp)) {
            Row(horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Column {
                    Text("EternalBlue Store AI (Offline)", fontWeight = FontWeight.ExtraBold, fontSize = 16.sp)
                    Text("Health Score ${state.storePulse.healthScore}/100", fontSize = 11.sp, color = SlateMuted)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    FilterChip(
                        selected = state.assistantLang == AssistantEngine.Lang.EN,
                        onClick = { vm.setAssistantLang(AssistantEngine.Lang.EN) },
                        label = { Text("EN", fontSize = 11.sp) }
                    )
                    FilterChip(
                        selected = state.assistantLang == AssistantEngine.Lang.TL,
                        onClick = { vm.setAssistantLang(AssistantEngine.Lang.TL) },
                        label = { Text("TL", fontSize = 11.sp) }
                    )
                    IconButton(onClick = { vm.setAssistantOpen(false) }) {
                        Icon(Icons.Filled.Close, contentDescription = "Close AI")
                    }
                }
            }

            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.weight(1f).fillMaxWidth().background(SlateSurface, RoundedCornerShape(12.dp)).padding(10.dp)
            ) {
                items(state.assistantMessages, key = { it.id }) { msg ->
                    Column(horizontalAlignment = if (msg.isUser) Alignment.End else Alignment.Start, modifier = Modifier.fillMaxWidth()) {
                        Surface(
                            color = if (msg.isUser) IndigoAccent else Color.White,
                            shape = RoundedCornerShape(12.dp),
                            border = if (msg.isUser) null else BorderStroke(1.dp, SlateBorder)
                        ) {
                            Column(modifier = Modifier.padding(10.dp)) {
                                Text(msg.text, color = if (msg.isUser) Color.White else Color(0xFF0F172A), fontSize = 13.sp)
                                if (msg.metrics.isNotEmpty()) {
                                    Spacer(Modifier.height(6.dp))
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) {
                                        msg.metrics.forEach { m ->
                                            Surface(color = Color(0xFFF1F5F9), shape = RoundedCornerShape(8.dp)) {
                                                Column(modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)) {
                                                    Text(m.label, fontSize = 10.sp, color = SlateMuted)
                                                    Text(m.value, fontSize = 12.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        if (!msg.isUser && msg.chips.isNotEmpty()) {
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.horizontalScroll(rememberScrollState()).padding(top = 4.dp)) {
                                msg.chips.forEach { ch ->
                                    SuggestionChip(onClick = { vm.askAssistant(ch) }, label = { Text(ch, fontSize = 11.sp) })
                                }
                            }
                        }
                    }
                }
            }

            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp)) {
                OutlinedTextField(
                    value = input,
                    onValueChange = { input = it },
                    placeholder = { Text("Ask sales, stockout, or item price…", fontSize = 13.sp) },
                    singleLine = true,
                    modifier = Modifier.weight(1f)
                )
                IconButton(onClick = {
                    vm.askAssistant(input)
                    input = ""
                }) {
                    Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Send", tint = IndigoAccent)
                }
            }
        }
    }
}
